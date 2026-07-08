/*
 * Smart Home Health
 * Copyright (C) 2026 John Carty
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */
// Initial Inventory Setup: turn a stack of scanned packing slips into supply
// CATALOG candidates. OCR/barcodes seed the catalog; humans confirm counts.
// Pure functions — everything here is unit-testable without a browser.

import { buildScanLines, equipmentNumberIndex, nameMatchScore } from './slipScanner';

const NAME_MATCH_THRESHOLD = 0.5;

/**
 * Merge scan results from MANY slips into one line per item number.
 * slips: [{ barcodes: [...], ocrItems: [...] }] — one entry per captured slip.
 * The same item on 4 slips shows once, with seenOnSlips: 4 (a strong signal
 * it's a real supply, not OCR noise). Barcode reads win on UOM/source; the
 * longest description seen wins (OCR truncates unpredictably).
 * Returns [{ itemNumber, uom, description, seenOnSlips, source }]
 */
export function groupSlipLines(slips) {
  const merged = new Map();
  (slips || []).forEach((slip, slipIndex) => {
    const lines = buildScanLines(slip.barcodes || [], slip.ocrItems || []);
    for (const line of lines) {
      const existing = merged.get(line.itemNumber);
      if (!existing) {
        merged.set(line.itemNumber, { ...line, seenOnSlips: 1, _slips: new Set([slipIndex]) });
        continue;
      }
      if (line.source === 'barcode' && existing.source !== 'barcode') {
        existing.uom = line.uom || existing.uom;
        existing.source = 'barcode';
      }
      if ((line.description || '').length > (existing.description || '').length) {
        existing.description = line.description;
        // The raw OCR line + its photo strip travel with the best
        // description — review UIs show them as "what we saw on the slip".
        if (line.raw) existing.raw = line.raw;
        if (line.image) existing.image = line.image;
      }
      if (!existing.raw && line.raw) existing.raw = line.raw;
      if (!existing.image && line.image) existing.image = line.image;
      if (!existing._slips.has(slipIndex)) {
        existing._slips.add(slipIndex);
        existing.seenOnSlips += 1;
      }
    }
  });
  return [...merged.values()].map((entry) => {
    const line = { ...entry };
    delete line._slips;
    return line;
  });
}

/**
 * Classify grouped lines into review buckets so the user mostly handles
 * exceptions instead of fixing a giant OCR mess:
 *   'match'  — looks like a supply already in the catalog (number via
 *              primary/alias index, or name similarity >= 0.5)
 *   'ready'  — confident new item: barcode-sourced, or a number plus a
 *              >= 3-word description, or seen on 2+ slips
 *   'review' — plausible but thin (OCR-only, short description)
 *   'noise'  — OCR-invented fragment (no description, seen once)
 * Each line gets a default action: match -> 'match', ready/review -> 'add',
 * noise -> 'skip'. Every default is user-overridable on the card.
 */
export function classifyLines(lines, equipmentList = []) {
  const byNumber = equipmentNumberIndex(equipmentList);
  return (lines || []).map((line) => {
    const numberHit = byNumber.get(line.itemNumber) || null;
    let matched = numberHit;
    let matchHow = numberHit ? 'number' : null;
    let matchScore = numberHit ? 1 : 0;
    if (!matched && line.description) {
      let best = null;
      let bestScore = 0;
      for (const e of equipmentList) {
        const score = Math.max(
          nameMatchScore(line.description, e.name),
          nameMatchScore(line.description, e.description)
        );
        if (score > bestScore) { best = e; bestScore = score; }
      }
      if (best && bestScore >= NAME_MATCH_THRESHOLD) {
        matched = best;
        matchHow = 'name';
        matchScore = bestScore;
      }
    }

    let bucket;
    let action;
    if (matched) {
      bucket = 'match';
      action = 'match';
    } else {
      const descWords = (line.description || '')
        .split(/\s+/)
        .filter((w) => /[A-Za-z]{2}/.test(w)).length;
      if (line.source === 'barcode' || descWords >= 3 || line.seenOnSlips >= 2) {
        bucket = 'ready';
        action = 'add';
      } else if (line.description) {
        bucket = 'review';
        action = 'add';
      } else {
        bucket = 'noise';
        action = 'skip';
      }
    }

    return {
      ...line,
      bucket,
      action,
      suggestedEquipmentId: matched ? matched.id : null,
      matchHow,
      matchScore,
    };
  });
}

/**
 * Plain-English default for "What do you call it?" from shouty slip wording.
 * A suggestion the user overwrites — not an attempt to decode abbreviations.
 * "CONNECTOR, AIRWAY SWVL DBL" -> "Connector, Airway Swvl Dbl"
 */
export function friendlyName(description) {
  const cleaned = (description || '')
    .replace(/\s*\/I[A-Z]{2}[0-9A-Z-]*.*$/, '') // stray barcode text
    .replace(/[^A-Za-z0-9/,.\- ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return '';
  return cleaned
    .toLowerCase()
    .replace(/(^|[\s/-])([a-z])/g, (m, sep, ch) => sep + ch.toUpperCase());
}

const toInt = (v) => {
  const n = parseInt(v, 10);
  return Number.isNaN(n) ? null : n;
};

/**
 * Review card -> POST /api/equipment/catalog-import item payload.
 * card.action 'match' needs equipmentId; anything else becomes a create.
 * The distributor's wording rides along as raw_description (stored as the
 * provider alias + description); `name` is the user's own words.
 */
export function cardToImportItem(card) {
  const itemNumber = (card.itemNumber || '').trim() || null;
  const rawDescription = (card.description || '').trim() || null;
  const storageLocation = (card.storageLocation || '').trim() || null;
  // UPC/EAN scanned off the physical box during review — becomes a
  // provider-independent alias so scanning the item itself identifies it.
  const productBarcode = (card.productBarcode || '').trim() || null;
  if (card.action === 'match') {
    return {
      action: 'match',
      equipment_id: card.equipmentId,
      item_number: itemNumber,
      raw_description: rawDescription,
      storage_location: storageLocation,
      product_barcode: productBarcode,
    };
  }
  return {
    action: 'create',
    name: (card.name || '').trim(),
    item_number: itemNumber,
    raw_description: rawDescription,
    category: card.category || 'supply',
    unit_of_measure: (card.uom || '').trim() || null,
    unit_size: toInt(card.unitSize),
    storage_location: storageLocation,
    product_barcode: productBarcode,
  };
}

/**
 * Count-mode math: packages x per-package + loose, NaN-safe.
 * DME packaging is weird (1 case = 30, 1 pack = 5, loose extras everywhere),
 * so the user counts in packaging units and we store base units.
 * An empty per-package counts packages as single items (x1).
 */
export function countTotal({ packages, perPackage, loose } = {}) {
  const p = toInt(packages) ?? 0;
  const per = toInt(perPackage) ?? 1;
  const l = toInt(loose) ?? 0;
  return Math.max(0, p) * Math.max(1, per) + Math.max(0, l);
}
