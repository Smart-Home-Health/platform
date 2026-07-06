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
// Pure parsing/matching helpers for packing-slip scanning. Barcode/OCR
// engines are exercised manually (WASM doesn't run in CI); these tests pin
// the PHS/McKesson barcode format and the OCR line heuristics.
import { describe, it, expect } from 'vitest';
import { parseSlipBarcode, parseSlipText, matchScanToItems, buildNewItems } from './slipScanner';

describe('parseSlipBarcode', () => {
  // Real values photographed from PHS packing slips.
  it('decodes /I + UOM + item number', () => {
    expect(parseSlipBarcode('/IEA573717')).toEqual({ uom: 'EA', itemNumber: '573717' });
    expect(parseSlipBarcode('/ICS1227006')).toEqual({ uom: 'CS', itemNumber: '1227006' });
    expect(parseSlipBarcode('/IRL481236')).toEqual({ uom: 'RL', itemNumber: '481236' });
  });

  it('tolerates a missing leading slash', () => {
    expect(parseSlipBarcode('IEA450020')).toEqual({ uom: 'EA', itemNumber: '450020' });
  });

  it('rejects header/order barcodes and junk', () => {
    expect(parseSlipBarcode('78711852075378930')).toBeNull(); // order barcode
    expect(parseSlipBarcode('')).toBeNull();
    expect(parseSlipBarcode(null)).toBeNull();
  });
});

describe('parseSlipText', () => {
  it('extracts item numbers with trailing quantity columns', () => {
    const text = [
      'LN# Item/Mfg Number Qty Ordered Shipped UOM',
      '1 450020 2 2 EA TUBE, TRACH TTS CUFF 6.0MM',
      '2 1227006 1 1 CS UNDERPAD, PREVAIL',
      '7 * 573717 3 0 EA CPAP HUMID CHAMB DISP',
    ].join('\n');
    const items = parseSlipText(text);
    const byNum = Object.fromEntries(items.map((i) => [i.itemNumber, i]));
    expect(byNum['450020']).toMatchObject({ qtyOrdered: 2, qtyShipped: 2 });
    expect(byNum['1227006']).toMatchObject({ qtyOrdered: 1, qtyShipped: 1 });
    expect(byNum['573717']).toMatchObject({ qtyOrdered: 3, qtyShipped: 0 });
  });

  it('captures the printed description after the qty/UOM columns', () => {
    const items = parseSlipText('1 450020 2 2 EA TUBE, TRACH TTS CUFF 6.0MM SMITHS');
    expect(items[0].description).toBe('TUBE, TRACH TTS CUFF 6.0MM SMITHS');
    // digits inside the description must not leak into quantities
    expect(items[0]).toMatchObject({ qtyOrdered: 2, qtyShipped: 2 });
  });

  it('drops junk descriptions and stray barcode text', () => {
    const items = parseSlipText('3 1199725 4 4 EA CONNECTOR, STRT 15MM /IEA1199725');
    expect(items[0].description).toBe('CONNECTOR, STRT 15MM');
    const noDesc = parseSlipText('5 853872 2 2 EA ..');
    expect(noDesc[0].description).toBeNull();
  });

  it('dedupes repeated item numbers and survives noise', () => {
    const items = parseSlipText('450020 2 2\ngarbage line\n450020 9 9\n');
    expect(items).toHaveLength(1);
    expect(items[0].qtyOrdered).toBe(2);
  });

  it('returns empty for empty/absent text', () => {
    expect(parseSlipText('')).toEqual([]);
    expect(parseSlipText(null)).toEqual([]);
  });
});

describe('matchScanToItems', () => {
  const expected = [
    { id: 11, item_number: '450020', qty_ordered: 2, qty_shipped: 2 },
    { id: 12, item_number: '573717', qty_ordered: 3, qty_shipped: 3 },
    { id: 13, item_number: '999999', qty_ordered: 1, qty_shipped: 1 },
  ];

  it('flags barcode matches first, then OCR, else null', () => {
    const out = matchScanToItems(
      expected,
      ['/IEA450020'],
      [{ itemNumber: '573717', qtyOrdered: 3, qtyShipped: 0 }]
    );
    expect(out.find((o) => o.shipment_item_id === 11).matched).toBe('barcode');
    expect(out.find((o) => o.shipment_item_id === 12).matched).toBe('ocr');
    expect(out.find((o) => o.shipment_item_id === 13).matched).toBeNull();
  });

  it('prefers OCR-read shipped qty, falling back to expected values', () => {
    const out = matchScanToItems(
      expected,
      [],
      [{ itemNumber: '573717', qtyOrdered: 3, qtyShipped: 0 }]
    );
    expect(out.find((o) => o.shipment_item_id === 12).qty_shipped).toBe(0); // slip says 0 shipped ("to follow")
    expect(out.find((o) => o.shipment_item_id === 11).qty_shipped).toBe(2); // fallback to expected
  });
});

describe('buildNewItems', () => {
  it('creates drafts from barcodes with UOM, enriched by OCR qty and description', () => {
    const drafts = buildNewItems(
      ['/IEA450020', '/ICS1227006'],
      [{ itemNumber: '450020', qtyOrdered: 2, qtyShipped: 2, description: 'TUBE, TRACH TTS CUFF 6.0MM' }],
      [], []
    );
    const byNum = Object.fromEntries(drafts.map((d) => [d.item_number, d]));
    expect(byNum['450020']).toMatchObject({
      unit_of_measure: 'EA', qty_ordered: 2, source: 'barcode',
      item_description: 'TUBE, TRACH TTS CUFF 6.0MM',
    });
    expect(byNum['1227006']).toMatchObject({ unit_of_measure: 'CS', qty_ordered: 1, item_description: null });
  });

  it('prefers the tracked equipment name over the OCR description', () => {
    const drafts = buildNewItems(
      ['/IEA450020'],
      [{ itemNumber: '450020', qtyOrdered: 2, description: 'TUBE, TRACH TTS CUFF 6.0MM' }],
      [],
      [{ id: 9, item_number: '450020', name: 'Trach Tube 6.0MM' }]
    );
    expect(drafts[0].item_description).toBe('Trach Tube 6.0MM');
  });

  it('includes OCR-only rows the camera missed', () => {
    const drafts = buildNewItems([], [{ itemNumber: '853872', qtyOrdered: 2 }], [], []);
    expect(drafts).toHaveLength(1);
    expect(drafts[0]).toMatchObject({ item_number: '853872', source: 'ocr', unit_of_measure: null });
  });

  it('skips items already on the shipment and dedupes', () => {
    const drafts = buildNewItems(
      ['/IEA450020', '/IEA450020', '/IEA573717'],
      [{ itemNumber: '450020', qtyOrdered: 2 }],
      [{ item_number: '450020' }],
      []
    );
    expect(drafts).toHaveLength(1);
    expect(drafts[0].item_number).toBe('573717');
  });

  it('auto-links matching equipment and borrows its name', () => {
    const drafts = buildNewItems(
      ['/IEA450020'], [], [],
      [{ id: 9, item_number: '450020', name: 'Trach Tube 6.0MM' }]
    );
    expect(drafts[0]).toMatchObject({ equipment_id: 9, item_description: 'Trach Tube 6.0MM' });
  });
});
