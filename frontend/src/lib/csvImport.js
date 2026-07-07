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
// CSV -> shipment items: parse, guess which column is which, let the user
// correct the mapping, and build rows for POST /api/shipments/{id}/items/bulk.
// Parsing is done in the browser (small RFC-4180-ish parser below) so the
// offline/LAN posture holds — no server round-trip, no new dependency.

/** Importable target fields, in display order. '' = ignore the column. */
export const CSV_TARGET_FIELDS = [
  { value: 'item_number', label: 'Item #' },
  { value: 'item_description', label: 'Description' },
  { value: 'qty_ordered', label: 'Quantity' },
  { value: 'unit_of_measure', label: 'Unit (EA/BX/CS)' },
  { value: 'manufacturer_name', label: 'Manufacturer' },
  { value: 'unit_price', label: 'Price' },
  { value: '', label: 'Ignore' },
];

/** Target fields when importing SUPPLY CATALOG rows (Initial Inventory Setup). */
export const CSV_EQUIPMENT_FIELDS = [
  { value: 'name', label: 'What you call it' },
  { value: 'item_number', label: 'Item #' },
  { value: 'raw_description', label: 'Their description' },
  { value: 'quantity', label: 'How many on hand' },
  { value: 'unit_of_measure', label: 'Unit (EA/BX/CS)' },
  { value: 'unit_size', label: 'Per package' },
  { value: 'storage_location', label: 'Where it lives' },
  { value: 'reorder_point', label: 'Reorder point' },
  { value: 'par_level', label: 'Target stock' },
  { value: '', label: 'Ignore' },
];

/**
 * Minimal CSV parser: quoted fields, embedded commas/quotes/newlines, CRLF.
 * Returns an array of rows (arrays of strings). Blank lines are dropped.
 */
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  const src = text || '';

  for (let i = 0; i < src.length; i += 1) {
    const c = src[i];
    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') { field += '"'; i += 1; } // escaped quote
        else inQuotes = false;
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field); field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i += 1;
      row.push(field); field = '';
      if (row.some((f) => f.trim() !== '')) rows.push(row);
      row = [];
    } else {
      field += c;
    }
  }
  row.push(field);
  if (row.some((f) => f.trim() !== '')) rows.push(row);
  return rows;
}

// Header keywords -> target field, first match wins (checked in order so the
// more specific patterns beat the generic ones).
const HEADER_PATTERNS = [
  ['item_number', /item\s*(#|no|num|number)|sku|part\s*(#|no|num|number)?|catalog|product\s*(code|#|no)|mfg\s*(#|no|num)/i],
  ['qty_ordered', /qty|quantity|ordered|count|amount/i],
  ['unit_of_measure', /uom|unit\s*of\s*measure|^unit(s)?$/i],
  ['unit_price', /price|cost|each\b/i],
  ['manufacturer_name', /manufacturer|mfg\b|brand|vendor/i],
  ['item_description', /desc|description|item\s*name|product|name/i],
];

// Same idea for supply-catalog CSVs (home-grown spreadsheets: "what we call
// it", "where it lives", per-package sizes, reorder levels).
export const EQUIPMENT_HEADER_PATTERNS = [
  ['item_number', /item\s*(#|no|num|number)|sku|part\s*(#|no|num|number)?|catalog|product\s*(code|#|no)|mfg\s*(#|no|num)/i],
  ['storage_location', /location|where|shelf|bin|closet|cart|room/i],
  ['unit_size', /per\s*(box|pack|package|case|unit)|unit\s*size|pack\s*size|case\s*(size|qty|count)/i],
  ['reorder_point', /reorder|low\s*stock|min(imum)?\b/i],
  ['par_level', /par|target|max(imum)?\b/i],
  ['quantity', /on\s*hand|qty|quantity|count|have/i],
  ['unit_of_measure', /uom|unit\s*of\s*measure|^unit(s)?$/i],
  ['raw_description', /desc|description|their\s*name|vendor|product/i],
  ['name', /^name$|call\s*it|supply|item\s*name|what/i],
];

/** True when the first row looks like labels rather than data. */
export function looksLikeHeader(firstRow, patterns = HEADER_PATTERNS) {
  if (!firstRow || firstRow.length === 0) return false;
  const labelish = firstRow.filter((cell) =>
    patterns.some(([, re]) => re.test(cell.trim()))
  );
  // Headers rarely contain bare numbers; data rows usually do.
  const numeric = firstRow.filter((cell) => /^\s*\d+([.,]\d+)?\s*$/.test(cell));
  return labelish.length >= 2 || (labelish.length >= 1 && numeric.length === 0);
}

/**
 * Guess a column -> field mapping from the header row (if any) plus a peek at
 * the data. Returns an array the same length as the widest row, each entry a
 * target-field value ('' = ignore). Each field is assigned at most once.
 * opts.patterns picks the header-keyword set; opts.qtyField / opts.descField
 * name the fields the data-shape fallbacks assign (they differ between the
 * shipment-item and supply-catalog target sets).
 */
export function guessMapping(rows, hasHeader, opts = {}) {
  const {
    patterns = HEADER_PATTERNS,
    qtyField = 'qty_ordered',
    descField = 'item_description',
  } = opts;
  const width = Math.max(0, ...rows.map((r) => r.length));
  const mapping = Array(width).fill('');
  const taken = new Set();

  if (hasHeader && rows.length > 0) {
    rows[0].forEach((cell, col) => {
      for (const [field, re] of patterns) {
        if (!taken.has(field) && re.test(cell.trim())) {
          mapping[col] = field;
          taken.add(field);
          break;
        }
      }
    });
  }

  // Data-shape fallbacks for anything the header didn't nail down.
  const data = rows.slice(hasHeader ? 1 : 0, hasHeader ? 6 : 5);
  for (let col = 0; col < width; col += 1) {
    if (mapping[col]) continue;
    const cells = data.map((r) => (r[col] || '').trim()).filter(Boolean);
    if (cells.length === 0) continue;
    const allSmallInts = cells.every((c) => /^\d{1,4}$/.test(c));
    const allUom = cells.every((c) => /^(EA|CS|BX|PK|RL|CT|KT|PR|DZ)$/i.test(c));
    const allItemish = cells.every((c) => /^[0-9A-Z][0-9A-Z-]{3,}$/i.test(c) && /\d/.test(c));
    if (allUom && !taken.has('unit_of_measure')) {
      mapping[col] = 'unit_of_measure'; taken.add('unit_of_measure');
    } else if (allSmallInts && !taken.has(qtyField)) {
      mapping[col] = qtyField; taken.add(qtyField);
    } else if (allItemish && !taken.has('item_number')) {
      mapping[col] = 'item_number'; taken.add('item_number');
    } else if (!taken.has(descField) && cells.some((c) => /[A-Za-z]{3}/.test(c))) {
      mapping[col] = descField; taken.add(descField);
    }
  }
  return mapping;
}

/**
 * Apply a confirmed mapping: rows + mapping -> bulk-endpoint item payloads.
 * Skips the header row when hasHeader, and drops rows that yield neither an
 * item number nor a description.
 */
export function buildItemsFromCsv(rows, mapping, hasHeader) {
  const data = rows.slice(hasHeader ? 1 : 0);
  const items = [];
  for (const row of data) {
    const item = {};
    mapping.forEach((field, col) => {
      if (!field) return;
      const raw = (row[col] || '').trim();
      if (!raw) return;
      if (field === 'qty_ordered') {
        const n = parseInt(raw.replace(/[^\d-]/g, ''), 10);
        if (!Number.isNaN(n)) item.qty_ordered = n;
      } else if (field === 'unit_price') {
        const n = parseFloat(raw.replace(/[^0-9.-]/g, ''));
        if (!Number.isNaN(n)) item.unit_price = n;
      } else if (field === 'unit_of_measure') {
        item.unit_of_measure = raw.toUpperCase();
      } else {
        item[field] = raw;
      }
    });
    if (item.item_number || item.item_description) {
      if (item.qty_ordered === undefined) item.qty_ordered = 1;
      items.push(item);
    }
  }
  return items;
}

/**
 * Apply a confirmed mapping for SUPPLY CATALOG rows (Initial Inventory Setup):
 * rows + mapping -> catalog-import item drafts. Integer fields are parsed;
 * rows with neither a name nor an item number are dropped. A row without a
 * name falls back to its raw description so the review card has something
 * to prefill.
 */
export function buildEquipmentFromCsv(rows, mapping, hasHeader) {
  const INT_FIELDS = new Set(['quantity', 'unit_size', 'reorder_point', 'par_level']);
  const data = rows.slice(hasHeader ? 1 : 0);
  const items = [];
  for (const row of data) {
    const item = {};
    mapping.forEach((field, col) => {
      if (!field) return;
      const raw = (row[col] || '').trim();
      if (!raw) return;
      if (INT_FIELDS.has(field)) {
        const n = parseInt(raw.replace(/[^\d-]/g, ''), 10);
        if (!Number.isNaN(n) && n >= 0) item[field] = n;
      } else if (field === 'unit_of_measure') {
        item.unit_of_measure = raw.toUpperCase();
      } else {
        item[field] = raw;
      }
    });
    if (item.name || item.item_number) {
      if (!item.name && item.raw_description) item.name = item.raw_description;
      items.push(item);
    }
  }
  return items;
}
