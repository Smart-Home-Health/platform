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
// Packing-slip scanning: on-device barcode decoding + OCR.
//
// Everything runs in the browser — no image ever needs the server for
// decoding. All Tesseract assets (worker, wasm core, language data) are
// vendored into the build under tessdata/ (see vite.config.js and
// public/tessdata/) and resolved relative to document.baseURI so they load
// same-origin in dev, the unified image, and behind Home Assistant ingress.
// NEVER pass CDN paths here: LAN/offline installs must keep working.
//
// Barcode format (Pediatric Home Service / McKesson slips): each line item
// carries a Code 128 barcode reading "/I" + unit-of-measure + item number,
// e.g. "/IEA573717" -> { uom: 'EA', itemNumber: '573717' }
//      "/ICS1227006" -> { uom: 'CS', itemNumber: '1227006' }
// So one barcode read yields both the supplier item number and the unit.

import { createWorker } from 'tesseract.js';

// --- Asset paths (same-origin, ingress-aware) --------------------------------

function tessAsset(relative) {
  // document.baseURI honors the <base href> the backend injects for HA ingress.
  return new URL(relative, document.baseURI).href;
}

// --- OCR worker (lazy singleton) ---------------------------------------------

let _workerPromise = null;

export function getOcrWorker() {
  if (!_workerPromise) {
    _workerPromise = createWorker('eng', 1, {
      workerPath: tessAsset('tessdata/worker.min.js'),
      corePath: tessAsset('tessdata/core/'),
      langPath: tessAsset('tessdata/lang/'),
      gzip: true,
    });
  }
  return _workerPromise;
}

export async function terminateOcrWorker() {
  if (_workerPromise) {
    const worker = await _workerPromise.catch(() => null);
    _workerPromise = null;
    if (worker) await worker.terminate().catch(() => {});
  }
}

/** OCR a canvas/image element; returns recognized text ('' on failure). */
export async function ocrImage(source) {
  const worker = await getOcrWorker();
  const { data } = await worker.recognize(source);
  return data?.text || '';
}

// --- Barcode decoding ---------------------------------------------------------

function toCanvas(source) {
  if (source instanceof HTMLCanvasElement) return source;
  // Video frame or image element -> draw onto a canvas so every decoder
  // gets the same input (ZXing has no one-shot video API).
  const canvas = document.createElement('canvas');
  canvas.width = source.videoWidth || source.naturalWidth || source.width;
  canvas.height = source.videoHeight || source.naturalHeight || source.height;
  canvas.getContext('2d').drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas;
}

/**
 * ZXing reads ONE barcode per image, but a slip page stacks one barcode per
 * line item. Strip-scan: decode the full frame, then overlapping horizontal
 * bands, collecting every distinct read. This is the iOS path (no native
 * BarcodeDetector there) so photo-based scanning still catches every line.
 */
async function zxingDecodeAll(canvas) {
  const { BrowserMultiFormatReader } = await import('@zxing/browser');
  const { DecodeHintType, BarcodeFormat } = await import('@zxing/library');
  const hints = new Map();
  hints.set(DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.CODE_128]);
  hints.set(DecodeHintType.TRY_HARDER, true);
  const reader = new BrowserMultiFormatReader(hints);

  const found = new Set();
  const tryDecode = (c) => {
    try {
      const result = reader.decodeFromCanvas(c);
      if (result) found.add(result.getText());
    } catch { /* NotFoundException — nothing in this band */ }
  };

  tryDecode(canvas);

  const bandCount = 14; // ~one band per printed line, 50% overlap between bands
  const bandHeight = Math.max(60, Math.floor(canvas.height / bandCount));
  const step = Math.max(30, Math.floor(bandHeight / 2));
  const strip = document.createElement('canvas');
  strip.width = canvas.width;
  strip.height = bandHeight;
  const ctx = strip.getContext('2d');
  for (let y = 0; y < canvas.height - 30; y += step) {
    const h = Math.min(bandHeight, canvas.height - y);
    strip.height = h;
    ctx.drawImage(canvas, 0, y, canvas.width, h, 0, 0, canvas.width, h);
    tryDecode(strip);
  }
  return [...found];
}

/**
 * Decode all barcodes visible in a canvas / video frame / image element.
 * Prefers the native BarcodeDetector API (multi-barcode, fast, Android/Chrome);
 * falls back to ZXing strip-scanning elsewhere (iOS Safari).
 * Returns an array of raw barcode strings (deduped).
 */
export async function detectBarcodes(source) {
  if (typeof window !== 'undefined' && 'BarcodeDetector' in window) {
    try {
      const detector = new window.BarcodeDetector({ formats: ['code_128'] });
      const found = await detector.detect(source);
      return [...new Set(found.map((b) => b.rawValue).filter(Boolean))];
    } catch {
      // fall through to ZXing
    }
  }
  try {
    return await zxingDecodeAll(toCanvas(source));
  } catch {
    return [];
  }
}

/**
 * Parse a slip line-item barcode: "/I" + UOM (2 letters) + item number.
 * Returns { uom, itemNumber } or null if it isn't a line-item barcode
 * (e.g. the order-number barcodes in the slip header).
 */
export function parseSlipBarcode(raw) {
  const m = /^\/?I([A-Z]{2})([0-9A-Z-]{4,})$/.exec((raw || '').trim());
  if (!m) return null;
  return { uom: m[1], itemNumber: m[2] };
}

// --- OCR text heuristics --------------------------------------------------------

const UOM_TOKEN = /^(EA|CS|BX|PK|RL|CT|KT|PR|DZ)$/i;

// Slip header/address noise that OCR happily serves up as "items":
// ZIP+4s ("45342-3658"), the Cust P.O. number, invoice/order/license numbers.
const HEADER_LINE_RE = /(NUMBER|LICENSE|INVOICE|P\.?O\.?\s|PAGE\s|DATE:|PHONE|DISTRIBUTION\s+CENTER|SHIP\s+TO|BILL\s+TO)/i;
const STATE_ZIP_RE = /\b[A-Z]{2},?\s+\d{5}(-\d{4})?\b/;
const ZIP4_RE = /^\d{5}-\d{4}$/;

/**
 * Pull probable line items out of OCR'd packing-slip text.
 * Slip line shape (columns):
 *   LN# ItemNumber QtyOrdered Shipped UOM [ToFollow] Description Vendor
 * OCR is noisy, so this is deliberately loose: find a plausible item number,
 * read leading small integers as the qty columns, skip a UOM token, read a
 * trailing int as the "To Follow" (backorder) column, keep the rest as the
 * description. Header/address lines are rejected outright.
 * Returns [{ itemNumber, qtyOrdered, qtyShipped, qtyToFollow, description }]
 * — any field except itemNumber may be null.
 */
export function parseSlipText(text) {
  const items = [];
  const seen = new Set();
  for (const line of (text || '').split('\n')) {
    // Skip header/address territory before even looking for numbers.
    if (HEADER_LINE_RE.test(line) || STATE_ZIP_RE.test(line)) continue;

    // Item numbers on PHS slips: 5+ alphanumerics starting with a digit
    // (450020, 1227006, 8900-7-50, HC325S appears as mfg number instead).
    const m = /\b(\d[\d-]{4,}[A-Z]?)\b(.*)$/.exec(line);
    if (!m) continue;
    const itemNumber = m[1];
    if (seen.has(itemNumber)) continue;
    // ZIP+4s and long digit runs (barcode text, license numbers) are not items.
    if (ZIP4_RE.test(itemNumber)) continue;
    if (/^\d+$/.test(itemNumber.replace(/-/g, '')) && itemNumber.replace(/-/g, '').length > 8) continue;

    // Walk the tail: qty columns come BEFORE any word, so only ints seen
    // ahead of the first alphabetic token count (keeps "6.0MM" out of qtys).
    const tokens = (m[2] || '').trim().split(/\s+/).filter(Boolean);
    const qtys = [];
    let i = 0;
    while (i < tokens.length && qtys.length < 2 && /^\d{1,3}$/.test(tokens[i])) {
      qtys.push(Number(tokens[i]));
      i += 1;
    }
    if (i < tokens.length && UOM_TOKEN.test(tokens[i])) i += 1;

    // The "To Follow" column sits right after UOM/Bin Loc: a small int before
    // the description text = quantity still coming from the warehouse.
    let qtyToFollow = null;
    if (i < tokens.length && /^\d{1,3}$/.test(tokens[i])) {
      qtyToFollow = Number(tokens[i]);
      i += 1;
    }

    // Whatever's left is the printed description (may include the vendor
    // name — easy to trim in the review grid). Cut at a stray barcode text.
    let description = tokens.slice(i).join(' ').replace(/\s*\/I[A-Z]{2}[0-9A-Z-]*.*$/, '').trim();
    if (description.length < 3 || !/[A-Za-z]{3}/.test(description)) description = null;

    items.push({
      itemNumber,
      qtyOrdered: qtys.length > 0 ? qtys[0] : null,
      qtyShipped: qtys.length > 1 ? qtys[1] : null,
      qtyToFollow,
      description,
    });
    seen.add(itemNumber);
  }
  return items;
}

/**
 * Merge barcodes + OCR rows into one scan line per item number, keeping the
 * richest data we saw for each (barcode wins on number/UOM, OCR contributes
 * qty + description). Unlike buildNewItems this does NOT drop lines that
 * match existing items — resolution against the shipment happens next.
 * Returns [{ itemNumber, uom, qty, description, source }]
 */
export function buildScanLines(barcodes, ocrItems) {
  const lines = new Map();
  const ocrByNumber = new Map(ocrItems.map((o) => [o.itemNumber, o]));

  for (const raw of barcodes) {
    const parsed = parseSlipBarcode(raw);
    if (!parsed || lines.has(parsed.itemNumber)) continue;
    const ocr = ocrByNumber.get(parsed.itemNumber);
    lines.set(parsed.itemNumber, {
      itemNumber: parsed.itemNumber,
      uom: parsed.uom,
      qty: ocr?.qtyShipped ?? ocr?.qtyOrdered ?? 1,
      description: ocr?.description || null,
      source: 'barcode',
    });
  }
  for (const ocr of ocrItems) {
    if (lines.has(ocr.itemNumber)) continue;
    lines.set(ocr.itemNumber, {
      itemNumber: ocr.itemNumber,
      uom: null,
      qty: ocr.qtyShipped ?? ocr.qtyOrdered ?? 1,
      description: ocr.description || null,
      source: 'ocr',
    });
  }
  return [...lines.values()];
}

const _tokenize = (s) => (s || '')
  .toUpperCase()
  .replace(/[^A-Z0-9 ]+/g, ' ')
  .split(/\s+/)
  .filter((t) => t.length >= 2);

/**
 * Similarity between a scanned description and an item's label:
 * shared-token overlap in [0, 1]. Deliberately simple — slip text is short,
 * shouty, and abbreviated, so token overlap beats edit distance here.
 */
export function nameMatchScore(a, b) {
  const ta = _tokenize(a);
  const tb = new Set(_tokenize(b));
  if (ta.length === 0 || tb.size === 0) return 0;
  const shared = ta.filter((t) => tb.has(t)).length;
  return shared / Math.min(ta.length, tb.size);
}

const NAME_MATCH_THRESHOLD = 0.5;

/**
 * Resolve scan lines against the shipment's items (the backend truth):
 *   1. exact item-number match           -> matchType 'number'
 *   2. best description/name similarity  -> matchType 'name'
 *   3. neither                           -> matchType null (suggest add-new)
 * Multiple lines may resolve to the same item (split shipments) — the caller
 * sums quantities. Every resolution is a suggestion the user can override.
 * Returns lines decorated with { matchType, shipment_item_id, score }.
 */
export function resolveScanLines(lines, shipmentItems) {
  const byNumber = new Map(
    shipmentItems.filter((i) => i.item_number).map((i) => [String(i.item_number).trim(), i])
  );
  return lines.map((line) => {
    const numberHit = byNumber.get(line.itemNumber);
    if (numberHit) {
      return { ...line, matchType: 'number', shipment_item_id: numberHit.id, score: 1 };
    }
    let best = null;
    let bestScore = 0;
    for (const item of shipmentItems) {
      const label = [item.item_description, item.equipment_name].filter(Boolean).join(' ');
      const score = nameMatchScore(line.description, label);
      if (score > bestScore) { best = item; bestScore = score; }
    }
    if (best && bestScore >= NAME_MATCH_THRESHOLD) {
      return { ...line, matchType: 'name', shipment_item_id: best.id, score: bestScore };
    }
    return { ...line, matchType: null, shipment_item_id: null, score: 0 };
  });
}

/**
 * Build NEW item drafts from a scan — for populating a shipment or standing
 * order from an invoice instead of typing each line.
 * Combines every barcode read (item number + UOM) with any OCR line data for
 * the same item number (description, qty), plus OCR-only rows the camera
 * didn't catch a barcode for. Items already on the shipment are skipped.
 * equipmentList (optional): [{ id, item_number, ... }] to auto-link.
 * Returns [{ item_number, unit_of_measure, item_description, qty_ordered,
 *            equipment_id, source: 'barcode'|'ocr' }]
 */
export function buildNewItems(barcodes, ocrItems, existingItems = [], equipmentList = []) {
  const existing = new Set(existingItems.map((i) => (i.item_number || '').trim()).filter(Boolean));
  const equipmentByNumber = new Map(
    equipmentList.filter((e) => e.item_number).map((e) => [String(e.item_number).trim(), e])
  );
  const ocrByNumber = new Map(ocrItems.map((o) => [o.itemNumber, o]));

  const drafts = new Map(); // item_number -> draft

  for (const raw of barcodes) {
    const parsed = parseSlipBarcode(raw);
    if (!parsed || existing.has(parsed.itemNumber) || drafts.has(parsed.itemNumber)) continue;
    const ocr = ocrByNumber.get(parsed.itemNumber);
    const equipment = equipmentByNumber.get(parsed.itemNumber);
    drafts.set(parsed.itemNumber, {
      item_number: parsed.itemNumber,
      unit_of_measure: parsed.uom,
      item_description: equipment?.name || ocr?.description || null,
      qty_ordered: ocr?.qtyOrdered ?? 1,
      qty_shipped: ocr?.qtyShipped ?? ocr?.qtyOrdered ?? 1,
      qty_backordered: ocr?.qtyToFollow ?? 0,
      equipment_id: equipment?.id ?? null,
      source: 'barcode',
    });
  }

  for (const ocr of ocrItems) {
    if (existing.has(ocr.itemNumber) || drafts.has(ocr.itemNumber)) continue;
    const equipment = equipmentByNumber.get(ocr.itemNumber);
    drafts.set(ocr.itemNumber, {
      item_number: ocr.itemNumber,
      unit_of_measure: null,
      item_description: equipment?.name || ocr.description || null,
      qty_ordered: ocr.qtyOrdered ?? 1,
      qty_shipped: ocr.qtyShipped ?? ocr.qtyOrdered ?? 1,
      qty_backordered: ocr.qtyToFollow ?? 0,
      equipment_id: equipment?.id ?? null,
      source: 'ocr',
    });
  }

  return [...drafts.values()];
}

/**
 * Merge barcode finds + OCR line items against the delivery's expected items.
 * expectedItems: [{ id, item_number, qty_ordered, qty_shipped, ... }]
 * Returns per-expected-item suggestions:
 *   { shipment_item_id, matched ('barcode'|'ocr'|null), qty_shipped (suggested) }
 */
export function matchScanToItems(expectedItems, barcodes, ocrItems) {
  const barcodeNumbers = new Set(
    barcodes.map(parseSlipBarcode).filter(Boolean).map((b) => b.itemNumber)
  );
  const ocrByNumber = new Map(ocrItems.map((o) => [o.itemNumber, o]));

  return expectedItems.map((item) => {
    const num = (item.item_number || '').trim();
    const ocr = ocrByNumber.get(num);
    return {
      shipment_item_id: item.id,
      item_number: num,
      matched: barcodeNumbers.has(num) ? 'barcode' : (ocr ? 'ocr' : null),
      qty_shipped: ocr?.qtyShipped ?? item.qty_shipped ?? item.qty_ordered,
    };
  });
}
