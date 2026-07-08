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
// Equipment REST wrapper — Initial Inventory Setup endpoints. Goes through
// apiFetch (credentials:'include'); we mock global.fetch underneath it.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { equipmentService } from './equipment';

const res = (body, { ok = true, status = 200 } = {}) => ({ ok, status, json: async () => body });

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(res({})));
});

const calledUrl = () => fetch.mock.calls[0][0];
const calledOpts = () => fetch.mock.calls[0][1] || {};

describe('equipmentService', () => {
  it('list scopes by patient and includes credentials', async () => {
    await equipmentService.list(5);
    expect(calledUrl()).toContain('/api/equipment?patient_id=5');
    expect(calledOpts().credentials).toBe('include');
  });

  it('list omits the query string without a patient', async () => {
    await equipmentService.list();
    expect(calledUrl()).toMatch(/\/api\/equipment$/);
  });

  it('catalogImport POSTs snake_case scope + items', async () => {
    await equipmentService.catalogImport({
      patientId: 5,
      supplierId: 9,
      items: [{ action: 'create', name: 'Trach ties', item_number: '573717' }],
    });
    expect(calledUrl()).toContain('/api/equipment/catalog-import');
    const body = JSON.parse(calledOpts().body);
    expect(body.patient_id).toBe(5);
    expect(body.supplier_id).toBe(9);
    expect(body.items).toHaveLength(1);
  });

  it('setCount POSTs quantity + note to /count', async () => {
    await equipmentService.setCount(3, { quantity: 64, note: 'Initial inventory setup' });
    expect(calledUrl()).toContain('/api/equipment/3/count');
    expect(JSON.parse(calledOpts().body)).toEqual({ quantity: 64, note: 'Initial inventory setup' });
  });

  it('addAlias maps camelCase args to the API shape', async () => {
    await equipmentService.addAlias(3, { itemNumber: '1898000', supplierId: 2, rawDescription: 'CONNECTOR' });
    expect(calledUrl()).toContain('/api/equipment/3/aliases');
    expect(JSON.parse(calledOpts().body)).toEqual({
      item_number: '1898000', supplier_id: 2, raw_description: 'CONNECTOR',
    });
  });

  it('deleteAlias DELETEs the alias path', async () => {
    await equipmentService.deleteAlias(3, 7);
    expect(calledUrl()).toContain('/api/equipment/3/aliases/7');
    expect(calledOpts().method).toBe('DELETE');
  });

  it('surfaces API error detail on failure', async () => {
    fetch.mockResolvedValue(res({ detail: 'Alias already exists' }, { ok: false, status: 409 }));
    await expect(equipmentService.addAlias(3, { itemNumber: 'x' })).rejects.toThrow('Alias already exists');
  });
});
