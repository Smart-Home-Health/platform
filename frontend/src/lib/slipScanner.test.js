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
import { parseSlipBarcode, parseSlipText, matchScanToItems, buildNewItems, buildScanLines, resolveScanLines, nameMatchScore, equipmentNumberIndex } from './slipScanner';

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

  it('keeps the distributor wording and links our equipment by number', () => {
    const drafts = buildNewItems(
      ['/IEA450020'],
      [{ itemNumber: '450020', qtyOrdered: 2, description: 'TUBE, TRACH TTS CUFF 6.0MM' }],
      [],
      [{ id: 9, item_number: '450020', name: 'Trach Tube 6.0MM' }]
    );
    // Two names: theirs stays on the item, ours comes via the equipment link.
    expect(drafts[0].item_description).toBe('TUBE, TRACH TTS CUFF 6.0MM');
    expect(drafts[0]).toMatchObject({ equipment_id: 9, equipment_match: 'number' });
  });

  it('reconciles by name when our equipment has no supplier number yet', () => {
    // "Vent Tube" in our DB; PHS ships it as a breathing circuit.
    const drafts = buildNewItems(
      [],
      [{ itemNumber: '1051368', qtyOrdered: 4, description: 'CIRCUIT, BRTHNG HTD SNGL LIMB ADLT' }],
      [],
      [
        { id: 5, item_number: null, name: 'Vent Tube', description: 'Heated single limb breathing circuit' },
        { id: 6, item_number: null, name: 'Trach Tube', description: null },
      ]
    );
    expect(drafts[0]).toMatchObject({ equipment_id: 5, equipment_match: 'name' });
  });

  it('leaves unmatched lines unlinked', () => {
    const drafts = buildNewItems(
      [], [{ itemNumber: '999000', qtyOrdered: 1, description: 'PEPTAMEN, UNFLAV 250ML' }],
      [], [{ id: 6, item_number: null, name: 'Trach Tube' }]
    );
    expect(drafts[0]).toMatchObject({ equipment_id: null, equipment_match: null });
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

describe('buildScanLines + resolveScanLines (multi-slip flow)', () => {
  const shipmentItems = [
    { id: 21, item_number: '450020', item_description: 'TUBE, TRACH TTS CUFF 6.0MM' },
    { id: 22, item_number: '573717', item_description: 'CPAP HUMID CHAMB DISP', equipment_name: 'Humidifier chamber' },
    { id: 23, item_number: null, item_description: 'BANDAGE, COBAN ELAS TAN' },
  ];

  it('merges barcodes and OCR into one line per item number', () => {
    const lines = buildScanLines(
      ['/IEA450020'],
      [{ itemNumber: '450020', qtyOrdered: 2, qtyShipped: 2, description: 'TUBE, TRACH' },
       { itemNumber: '853872', qtyOrdered: 2, qtyShipped: 2, description: 'TUBING, CPAP GRAY' }]
    );
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatchObject({ itemNumber: '450020', uom: 'EA', qty: 2, source: 'barcode' });
    expect(lines[1]).toMatchObject({ itemNumber: '853872', source: 'ocr' });
  });

  it('resolves by item number first', () => {
    const [line] = resolveScanLines(
      [{ itemNumber: '450020', qty: 2, description: null }], shipmentItems
    );
    expect(line).toMatchObject({ matchType: 'number', shipment_item_id: 21 });
  });

  it('falls back to name matching when the number is unknown', () => {
    // Second slip uses a different SKU for the same humidifier chamber.
    const [line] = resolveScanLines(
      [{ itemNumber: '999111', qty: 3, description: 'CPAP HUMID CHAMB DISPOSABLE' }],
      shipmentItems
    );
    expect(line.matchType).toBe('name');
    expect(line.shipment_item_id).toBe(22);
  });

  it('suggests add-new when nothing matches', () => {
    const [line] = resolveScanLines(
      [{ itemNumber: '999222', qty: 1, description: 'PEPTAMEN, UNFLAV 250ML' }],
      shipmentItems
    );
    expect(line).toMatchObject({ matchType: null, shipment_item_id: null });
  });

  it('lets multiple lines resolve to the same item (split boxes)', () => {
    const lines = resolveScanLines(
      [{ itemNumber: '450020', qty: 1, description: null },
       { itemNumber: '450020X', qty: 1, description: 'TUBE TRACH TTS CUFF' }],
      shipmentItems
    );
    expect(lines[0].shipment_item_id).toBe(21);
    expect(lines[1].shipment_item_id).toBe(21); // name match onto the same item
  });
});

describe('nameMatchScore', () => {
  it('scores shouty abbreviated slip text against friendly names', () => {
    expect(nameMatchScore('CPAP HUMID CHAMB DISP', 'CPAP HUMID CHAMB DISP FSHPAY')).toBeGreaterThan(0.9);
    expect(nameMatchScore('TUBE, TRACH TTS CUFF 6.0MM', 'BANDAGE, COBAN ELAS TAN')).toBeLessThan(0.5);
    expect(nameMatchScore('', 'anything')).toBe(0);
  });
});

describe('parseSlipText — To Follow column and header rejection', () => {
  it('reads the To Follow qty after the UOM (real line 7 shape)', () => {
    const items = parseSlipText('7 * 573717 3 0 EA 3 CPAP HUMID CHAMB DISP FSHPAY');
    expect(items[0]).toMatchObject({
      itemNumber: '573717', qtyOrdered: 3, qtyShipped: 0, qtyToFollow: 3,
      description: 'CPAP HUMID CHAMB DISP FSHPAY',
    });
  });

  it('leaves qtyToFollow null when the column is absent', () => {
    const items = parseSlipText('1 450020 2 2 EA TUBE, TRACH TTS CUFF 6.0MM');
    expect(items[0].qtyToFollow).toBeNull();
  });

  it('rejects address and header lines (the garbage rows from the field)', () => {
    const text = [
      'MIAMISBURG, OH 45342-3658',            // ZIP+4 became "item 45342-3658"
      'COLUMBUS, OH 43217',
      'CUST P.O. NUMBER: 100372',             // PO number became "item 100372"
      'INVOICE NUMBER: 10527731',
      'ORDER NUMBER: 78711852',
      'SHIPPED FROM LICENSE: 0132000178',
      '78711852261540828',                    // stray barcode digit run
      '1 450020 2 2 EA TUBE, TRACH TTS CUFF 6.0MM', // the one real line
    ].join('\n');
    const items = parseSlipText(text);
    expect(items).toHaveLength(1);
    expect(items[0].itemNumber).toBe('450020');
  });
});

describe('buildNewItems — shipped and to-follow flow through', () => {
  it('carries qty_shipped and qty_backordered from OCR', () => {
    const drafts = buildNewItems(
      ['/IEA573717'],
      [{ itemNumber: '573717', qtyOrdered: 3, qtyShipped: 0, qtyToFollow: 3, description: 'CPAP HUMID CHAMB DISP' }],
      [], []
    );
    expect(drafts[0]).toMatchObject({ qty_ordered: 3, qty_shipped: 0, qty_backordered: 3 });
  });

  it('defaults shipped to ordered and backorder to 0 without OCR data', () => {
    const drafts = buildNewItems(['/IEA450020'], [], [], []);
    expect(drafts[0]).toMatchObject({ qty_ordered: 1, qty_shipped: 1, qty_backordered: 0 });
  });
});

describe('equipmentNumberIndex + alias-aware buildNewItems', () => {
  const equipment = [
    { id: 1, name: 'Trach tube', item_number: '450020', aliases: [{ item_number: '999001' }] },
    { id: 2, name: 'Breathing circuit', item_number: null, aliases: [{ item_number: '4412007' }] },
    { id: 3, name: 'Old style rows', item_number: '111000' }, // no aliases key at all
  ];

  it('indexes primary numbers, alias numbers, and alias-less rows', () => {
    const index = equipmentNumberIndex(equipment);
    expect(index.get('450020').id).toBe(1);
    expect(index.get('999001').id).toBe(1);
    expect(index.get('4412007').id).toBe(2);
    expect(index.get('111000').id).toBe(3);
  });

  it('primary numbers win over alias collisions', () => {
    const index = equipmentNumberIndex([
      { id: 1, name: 'A', item_number: '450020', aliases: [] },
      { id: 2, name: 'B', item_number: null, aliases: [{ item_number: '450020' }] },
    ]);
    expect(index.get('450020').id).toBe(1);
  });

  it('buildNewItems links a scan by alias number (equipment_match: number)', () => {
    const drafts = buildNewItems(['/IEA4412007'], [], [], equipment);
    expect(drafts[0].equipment_id).toBe(2);
    expect(drafts[0].equipment_match).toBe('number');
  });

  it('buildNewItems still links by primary number', () => {
    const drafts = buildNewItems(['/IEA450020'], [], [], equipment);
    expect(drafts[0].equipment_id).toBe(1);
    expect(drafts[0].equipment_match).toBe('number');
  });
});

describe('parseSlipText — raw source line', () => {
  it('keeps the OCR line each item was parsed from', () => {
    const items = parseSlipText('  1 450020 2 2 EA TUBE TRACH TTS CUFF 4.0MM  ');
    expect(items[0].raw).toBe('1 450020 2 2 EA TUBE TRACH TTS CUFF 4.0MM');
  });
});
