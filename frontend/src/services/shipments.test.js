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
// Shipments REST wrapper — delivery-confirm rework endpoints. Goes through
// apiFetch (credentials:'include'); we mock global.fetch underneath it.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { shipmentService } from './shipments';

const res = (body, { ok = true, status = 200 } = {}) => ({ ok, status, json: async () => body });

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(res({})));
});

const calledUrl = () => fetch.mock.calls[0][0];
const calledOpts = () => fetch.mock.calls[0][1] || {};

describe('shipmentService', () => {
  it('listShipments builds query params and includes credentials', async () => {
    await shipmentService.listShipments({ patient_id: 5, is_template: false, status: '' });
    expect(calledUrl()).toContain('/api/shipments?');
    expect(calledUrl()).toContain('patient_id=5');
    expect(calledUrl()).toContain('is_template=false');
    expect(calledUrl()).not.toContain('status='); // empty values dropped
    expect(calledOpts().credentials).toBe('include');
  });

  it('listTemplates filters to is_template=true', async () => {
    await shipmentService.listTemplates(7);
    expect(calledUrl()).toContain('patient_id=7');
    expect(calledUrl()).toContain('is_template=true');
  });

  it('createDeliveryFromTemplate POSTs the create-delivery path', async () => {
    await shipmentService.createDeliveryFromTemplate(12);
    expect(calledUrl()).toContain('/api/shipments/12/create-delivery');
    expect(calledOpts().method).toBe('POST');
  });

  it('reconcileShipment POSTs mode + items + confirmed date', async () => {
    await shipmentService.reconcileShipment(3, {
      mode: 'itemized',
      items: [{ shipment_item_id: 1, qty_received: 2 }],
    });
    expect(calledUrl()).toContain('/api/shipments/3/reconcile');
    const body = JSON.parse(calledOpts().body);
    expect(body.mode).toBe('itemized');
    expect(body.items).toHaveLength(1);
  });

  it('reconcileShipment defaults to same_as_usual', async () => {
    await shipmentService.reconcileShipment(3);
    expect(JSON.parse(calledOpts().body).mode).toBe('same_as_usual');
  });

  it('uploadDocument sends multipart FormData with page metadata', async () => {
    const file = new File(['x'], 'slip.jpg', { type: 'image/jpeg' });
    await shipmentService.uploadDocument(4, file, { pageNumber: 2, title: 'Page 2' });
    expect(calledUrl()).toContain('/api/shipments/4/documents');
    expect(calledOpts().method).toBe('POST');
    const fd = calledOpts().body;
    expect(fd).toBeInstanceOf(FormData);
    expect(fd.get('file')).toBe(file);
    expect(fd.get('page_number')).toBe('2');
    expect(fd.get('title')).toBe('Page 2');
  });

  it('updateItem PUTs to the item path', async () => {
    await shipmentService.updateItem(5, 7, { qty_ordered: 3 });
    expect(calledUrl()).toContain('/api/shipments/5/items/7');
    expect(calledOpts().method).toBe('PUT');
    expect(JSON.parse(calledOpts().body)).toEqual({ qty_ordered: 3 });
  });

  it('deleteItem DELETEs the item path', async () => {
    await shipmentService.deleteItem(5, 7);
    expect(calledUrl()).toContain('/api/shipments/5/items/7');
    expect(calledOpts().method).toBe('DELETE');
  });

  it('bulkAddItems POSTs the items array to /items/bulk', async () => {
    await shipmentService.bulkAddItems(5, [
      { item_number: '450020', qty_ordered: 2, unit_of_measure: 'EA' },
    ]);
    expect(calledUrl()).toContain('/api/shipments/5/items/bulk');
    expect(calledOpts().method).toBe('POST');
    expect(JSON.parse(calledOpts().body)).toHaveLength(1);
  });

  it('documentRawUrl points at the raw endpoint', () => {
    expect(shipmentService.documentRawUrl(4, 9)).toContain('/api/shipments/4/documents/9/raw');
  });

  it('getInventory scopes to the patient', async () => {
    await shipmentService.getInventory(6);
    expect(calledUrl()).toContain('/api/shipments/inventory?patient_id=6');
  });

  it('surfaces backend error detail on failure', async () => {
    fetch.mockResolvedValueOnce(res({ detail: 'File too large (20 MB max)' }, { ok: false, status: 413 }));
    const file = new File(['x'], 'big.jpg', { type: 'image/jpeg' });
    await expect(shipmentService.uploadDocument(1, file)).rejects.toThrow('File too large');
  });
});
