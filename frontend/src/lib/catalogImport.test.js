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
// Initial Inventory Setup: multi-slip grouping, review-bucket classification,
// friendly-name suggestions, import payload mapping, count math.
import { describe, it, expect } from 'vitest';
import {
  groupSlipLines,
  classifyLines,
  friendlyName,
  cardToImportItem,
  countTotal,
} from './catalogImport';

describe('groupSlipLines', () => {
  it('merges the same item across slips and counts seenOnSlips', () => {
    const slips = [
      { barcodes: ['/IEA573717'], ocrItems: [{ itemNumber: '573717', qtyOrdered: 3, qtyShipped: 3, qtyToFollow: null, description: 'CPAP HUMID CHAMB' }] },
      { barcodes: ['/IEA573717'], ocrItems: [] },
      { barcodes: [], ocrItems: [{ itemNumber: '573717', qtyOrdered: 1, qtyShipped: 1, qtyToFollow: null, description: 'CPAP HUMID CHAMB DISP' }] },
    ];
    const lines = groupSlipLines(slips);
    expect(lines).toHaveLength(1);
    expect(lines[0].itemNumber).toBe('573717');
    expect(lines[0].seenOnSlips).toBe(3);
    // Longest description wins across slips
    expect(lines[0].description).toBe('CPAP HUMID CHAMB DISP');
    expect(lines[0].source).toBe('barcode');
    expect(lines[0].uom).toBe('EA');
  });

  it('keeps distinct items separate', () => {
    const slips = [
      { barcodes: ['/IEA111111', '/ICS222222'], ocrItems: [] },
      { barcodes: [], ocrItems: [{ itemNumber: '333333', qtyOrdered: 1, qtyShipped: null, qtyToFollow: null, description: 'TIE TRACH ONE INCH' }] },
    ];
    const lines = groupSlipLines(slips);
    expect(lines.map((l) => l.itemNumber).sort()).toEqual(['111111', '222222', '333333']);
    expect(lines.every((l) => l.seenOnSlips === 1)).toBe(true);
  });

  it('barcode read upgrades an OCR-only line from an earlier slip', () => {
    const slips = [
      { barcodes: [], ocrItems: [{ itemNumber: '450020', qtyOrdered: 2, qtyShipped: 2, qtyToFollow: null, description: 'TUBE TRACH TTS CUFF' }] },
      { barcodes: ['/IBX450020'], ocrItems: [] },
    ];
    const [line] = groupSlipLines(slips);
    expect(line.source).toBe('barcode');
    expect(line.uom).toBe('BX');
    expect(line.description).toBe('TUBE TRACH TTS CUFF');
  });

  it('handles empty input', () => {
    expect(groupSlipLines([])).toEqual([]);
    expect(groupSlipLines(undefined)).toEqual([]);
  });

  it('keeps the raw OCR line that came with the best description', () => {
    const slips = [
      { barcodes: [], ocrItems: [{ itemNumber: '450020', qtyOrdered: 2, qtyShipped: 2, qtyToFollow: null, description: 'TUBE TRACH', raw: '1 450020 2 2 EA TUBE TRACH' }] },
      { barcodes: [], ocrItems: [{ itemNumber: '450020', qtyOrdered: 2, qtyShipped: 2, qtyToFollow: null, description: 'TUBE TRACH TTS CUFF', raw: '1 450020 2 2 EA TUBE TRACH TTS CUFF' }] },
    ];
    const [line] = groupSlipLines(slips);
    expect(line.raw).toBe('1 450020 2 2 EA TUBE TRACH TTS CUFF');
  });
});

describe('classifyLines', () => {
  const equipment = [
    { id: 1, name: 'Trach tube', item_number: '450020', description: null, aliases: [] },
    { id: 2, name: 'Breathing circuit', item_number: null, description: null, aliases: [{ item_number: '4412007' }] },
  ];

  it('buckets number matches (primary) as match with suggestion', () => {
    const [line] = classifyLines([{ itemNumber: '450020', source: 'ocr', description: 'TUBE TRACH', seenOnSlips: 1 }], equipment);
    expect(line.bucket).toBe('match');
    expect(line.action).toBe('match');
    expect(line.suggestedEquipmentId).toBe(1);
    expect(line.matchHow).toBe('number');
  });

  it('buckets alias-number matches as match', () => {
    const [line] = classifyLines([{ itemNumber: '4412007', source: 'barcode', description: null, seenOnSlips: 1 }], equipment);
    expect(line.bucket).toBe('match');
    expect(line.suggestedEquipmentId).toBe(2);
    expect(line.matchHow).toBe('number');
  });

  it('buckets name-similarity matches as match', () => {
    const [line] = classifyLines(
      [{ itemNumber: '999999', source: 'ocr', description: 'CIRCUIT BRTHNG VENT ADULT', seenOnSlips: 1 }],
      equipment
    );
    expect(line.bucket).toBe('match');
    expect(line.suggestedEquipmentId).toBe(2);
    expect(line.matchHow).toBe('name');
  });

  it('barcode-sourced unknowns are ready', () => {
    const [line] = classifyLines([{ itemNumber: '888888', source: 'barcode', description: null, seenOnSlips: 1 }], equipment);
    expect(line.bucket).toBe('ready');
    expect(line.action).toBe('add');
  });

  it('OCR with a rich description is ready; thin description needs review', () => {
    const [rich, thin] = classifyLines([
      { itemNumber: '777777', source: 'ocr', description: 'CONNECTOR AIRWAY SWIVEL PORT', seenOnSlips: 1 },
      { itemNumber: '666666', source: 'ocr', description: 'VALVE', seenOnSlips: 1 },
    ], equipment);
    expect(rich.bucket).toBe('ready');
    expect(thin.bucket).toBe('review');
  });

  it('seen on 2+ slips promotes to ready even with a thin description', () => {
    const [line] = classifyLines([{ itemNumber: '666666', source: 'ocr', description: 'VALVE', seenOnSlips: 3 }], equipment);
    expect(line.bucket).toBe('ready');
  });

  it('OCR-only, description-less, seen-once lines are noise defaulting to skip', () => {
    const [line] = classifyLines([{ itemNumber: '1979000', source: 'ocr', description: null, seenOnSlips: 1 }], equipment);
    expect(line.bucket).toBe('noise');
    expect(line.action).toBe('skip');
  });
});

describe('friendlyName', () => {
  it('title-cases shouty slip wording', () => {
    expect(friendlyName('TIE TRACH 1IN TWL WHT')).toBe('Tie Trach 1in Twl Wht');
  });

  it('strips stray barcode text and collapses whitespace', () => {
    expect(friendlyName('CHAMBER  HUMID /IEA573717')).toBe('Chamber Humid');
  });

  it('returns empty string for empty input', () => {
    expect(friendlyName(null)).toBe('');
    expect(friendlyName('')).toBe('');
  });
});

describe('cardToImportItem', () => {
  it('maps an add card to a create payload', () => {
    const item = cardToImportItem({
      action: 'add',
      name: '  Trach ties ',
      itemNumber: ' 573717 ',
      description: 'TIE TRACH 1IN',
      category: 'supply',
      uom: 'EA',
      unitSize: '30',
      storageLocation: 'Trach cart',
    });
    expect(item).toEqual({
      action: 'create',
      name: 'Trach ties',
      item_number: '573717',
      raw_description: 'TIE TRACH 1IN',
      category: 'supply',
      unit_of_measure: 'EA',
      unit_size: 30,
      storage_location: 'Trach cart',
      product_barcode: null,
    });
  });

  it('carries a scanned product barcode on both create and match', () => {
    expect(cardToImportItem({ action: 'add', name: 'Gauze', productBarcode: ' 0123456789012 ' }).product_barcode)
      .toBe('0123456789012');
    expect(cardToImportItem({ action: 'match', equipmentId: 3, productBarcode: '0123456789012' }).product_barcode)
      .toBe('0123456789012');
  });

  it('maps a match card to a match payload', () => {
    const item = cardToImportItem({
      action: 'match',
      equipmentId: 42,
      itemNumber: '4412007',
      description: 'CIRCUIT BRTHNG',
      storageLocation: '',
    });
    expect(item).toEqual({
      action: 'match',
      equipment_id: 42,
      item_number: '4412007',
      raw_description: 'CIRCUIT BRTHNG',
      storage_location: null,
      product_barcode: null,
    });
  });

  it('nulls out empty optional fields on create', () => {
    const item = cardToImportItem({ action: 'add', name: 'Gauze', itemNumber: '', unitSize: 'abc' });
    expect(item.item_number).toBeNull();
    expect(item.unit_size).toBeNull();
    expect(item.raw_description).toBeNull();
  });
});

describe('countTotal', () => {
  it('computes packages x per-package + loose', () => {
    expect(countTotal({ packages: 2, perPackage: 30, loose: 4 })).toBe(64);
  });

  it('treats missing per-package as single items', () => {
    expect(countTotal({ packages: 3, perPackage: '', loose: 1 })).toBe(4);
  });

  it('is NaN-safe on garbage input', () => {
    expect(countTotal({ packages: 'x', perPackage: 'y', loose: 'z' })).toBe(0);
    expect(countTotal()).toBe(0);
  });

  it('accepts string digits (controlled inputs)', () => {
    expect(countTotal({ packages: '2', perPackage: '5', loose: '0' })).toBe(10);
  });
});
