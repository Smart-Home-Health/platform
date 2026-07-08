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
// CSV -> shipment items: parser, header detection, mapping guess, row build.
import { describe, it, expect } from 'vitest';
import { parseCsv, looksLikeHeader, guessMapping, buildItemsFromCsv, buildEquipmentFromCsv, EQUIPMENT_HEADER_PATTERNS } from './csvImport';

describe('parseCsv', () => {
  it('parses plain rows and drops blank lines', () => {
    expect(parseCsv('a,b,c\n\n1,2,3\n')).toEqual([['a', 'b', 'c'], ['1', '2', '3']]);
  });

  it('handles quoted fields with commas, quotes, and newlines', () => {
    const rows = parseCsv('"TUBE, TRACH",2,"say ""hi""","line1\nline2"');
    expect(rows).toEqual([['TUBE, TRACH', '2', 'say "hi"', 'line1\nline2']]);
  });

  it('handles CRLF line endings', () => {
    expect(parseCsv('a,b\r\nc,d\r\n')).toEqual([['a', 'b'], ['c', 'd']]);
  });
});

describe('looksLikeHeader', () => {
  it('recognizes label rows', () => {
    expect(looksLikeHeader(['Item Number', 'Description', 'Qty', 'UOM'])).toBe(true);
  });

  it('rejects data rows', () => {
    expect(looksLikeHeader(['450020', 'TUBE, TRACH TTS CUFF', '2', 'EA'])).toBe(false);
  });
});

describe('guessMapping', () => {
  it('maps by header names', () => {
    const rows = [
      ['Item #', 'Description', 'Qty', 'UOM', 'Notes'],
      ['450020', 'TUBE, TRACH', '2', 'EA', 'x'],
    ];
    const mapping = guessMapping(rows, true);
    expect(mapping[0]).toBe('item_number');
    expect(mapping[1]).toBe('item_description');
    expect(mapping[2]).toBe('qty_ordered');
    expect(mapping[3]).toBe('unit_of_measure');
    expect(mapping[4]).toBe(''); // Notes -> ignore
  });

  it('falls back to data shapes when there is no header', () => {
    const rows = [
      ['450020', 'TUBE, TRACH TTS CUFF', '2', 'EA'],
      ['1227006', 'UNDERPAD, PREVAIL', '1', 'CS'],
    ];
    const mapping = guessMapping(rows, false);
    expect(mapping[0]).toBe('item_number');
    expect(mapping[1]).toBe('item_description');
    expect(mapping[2]).toBe('qty_ordered');
    expect(mapping[3]).toBe('unit_of_measure');
  });

  it('assigns each field at most once', () => {
    const mapping = guessMapping([['Qty', 'Quantity'], ['1', '2']], true);
    expect(mapping.filter((f) => f === 'qty_ordered')).toHaveLength(1);
  });
});

describe('buildItemsFromCsv', () => {
  const rows = [
    ['Item #', 'Description', 'Qty', 'UOM', 'Price'],
    ['450020', 'TUBE, TRACH', '2', 'ea', '$12.50'],
    ['1227006', 'UNDERPAD', '', 'CS', ''],
    ['', '', '', '', ''],
  ];
  const mapping = ['item_number', 'item_description', 'qty_ordered', 'unit_of_measure', 'unit_price'];

  it('builds bulk payloads, skipping the header and empty rows', () => {
    const items = buildItemsFromCsv(rows, mapping, true);
    expect(items).toHaveLength(2);
    expect(items[0]).toEqual({
      item_number: '450020', item_description: 'TUBE, TRACH',
      qty_ordered: 2, unit_of_measure: 'EA', unit_price: 12.5,
    });
    // Missing qty defaults to 1
    expect(items[1].qty_ordered).toBe(1);
  });

  it('drops rows without an item number or description', () => {
    const items = buildItemsFromCsv([['', '', '5', 'EA', '']], mapping, false);
    expect(items).toHaveLength(0);
  });

  it('respects remapped columns', () => {
    const swapped = ['item_description', 'item_number', 'qty_ordered', '', ''];
    const items = buildItemsFromCsv([['Trach Tube', '450020', '2', 'EA', '']], swapped, false);
    expect(items[0]).toMatchObject({ item_number: '450020', item_description: 'Trach Tube' });
  });
});

describe('equipment-shaped CSV import (Initial Inventory Setup)', () => {
  it('guesses supply-catalog headers with the equipment pattern set', () => {
    const rows = [
      ['Name', 'Item #', 'On hand', 'Per box', 'Where it lives'],
      ['Trach ties', '573717', '64', '30', 'Trach cart'],
    ];
    const mapping = guessMapping(rows, true, { patterns: EQUIPMENT_HEADER_PATTERNS, qtyField: 'quantity', descField: 'name' });
    expect(mapping[0]).toBe('name');
    expect(mapping[1]).toBe('item_number');
    expect(mapping[2]).toBe('quantity');
    expect(mapping[3]).toBe('unit_size');
    expect(mapping[4]).toBe('storage_location');
  });

  it('shipment guessing is unchanged by the new options parameter', () => {
    const rows = [
      ['Item #', 'Description', 'Qty', 'UOM'],
      ['450020', 'TUBE, TRACH', '2', 'EA'],
    ];
    const mapping = guessMapping(rows, true);
    expect(mapping).toEqual(['item_number', 'item_description', 'qty_ordered', 'unit_of_measure']);
  });

  it('buildEquipmentFromCsv parses ints and keeps text fields', () => {
    const mapping = ['name', 'item_number', 'quantity', 'unit_size', 'storage_location'];
    const items = buildEquipmentFromCsv(
      [['Trach ties', '573717', '64', '30', 'Trach cart']],
      mapping, false
    );
    expect(items[0]).toEqual({
      name: 'Trach ties',
      item_number: '573717',
      quantity: 64,
      unit_size: 30,
      storage_location: 'Trach cart',
    });
  });

  it('buildEquipmentFromCsv falls back to raw_description for a missing name', () => {
    const mapping = ['raw_description', 'item_number'];
    const items = buildEquipmentFromCsv([['TIE TRACH 1IN', '573717']], mapping, false);
    expect(items[0].name).toBe('TIE TRACH 1IN');
    expect(items[0].raw_description).toBe('TIE TRACH 1IN');
  });

  it('buildEquipmentFromCsv drops rows with neither name nor item number', () => {
    const mapping = ['name', 'item_number', 'quantity'];
    expect(buildEquipmentFromCsv([['', '', '5']], mapping, false)).toHaveLength(0);
  });
});
