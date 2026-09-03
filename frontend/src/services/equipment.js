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
// Equipment / supply-catalog API service.
// New endpoints from the Initial Inventory Setup work go through here;
// older inline fetches on the equipment pages migrate opportunistically.
import config, { apiFetch } from '../config';

async function asJson(response, fallbackMessage) {
  if (!response.ok) {
    let detail = fallbackMessage;
    let payload = null;
    try {
      payload = await response.json();
      detail = payload.detail || payload.error || fallbackMessage;
    } catch { /* non-JSON error body */ }
    const error = new Error(detail);
    // The out-of-stock 409 carries the supply, its count and its unit. The
    // restock gate needs those, and they were being thrown away with the body.
    error.status = response.status;
    error.payload = payload;
    throw error;
  }
  return response.json();
}

export const equipmentService = {
  async list(patientId) {
    const qs = patientId ? `?patient_id=${patientId}` : '';
    const response = await apiFetch(`${config.apiUrl}/api/equipment${qs}`);
    return asJson(response, 'Failed to fetch supplies');
  },

  /** Change history across equipment, newest first. */
  async changeHistory({ patientId = null, equipmentId = null, limit = 50 } = {}) {
    const qs = new URLSearchParams();
    if (patientId) qs.set('patient_id', patientId);
    if (equipmentId) qs.set('equipment_id', equipmentId);
    if (limit) qs.set('limit', limit);
    const response = await apiFetch(`${config.apiUrl}/api/equipment/history?${qs}`);
    return asJson(response, 'Failed to fetch equipment history');
  },

  /** Stocktakes across every supply, newest first. */
  async recentCounts({ patientId = null, limit = 100 } = {}) {
    const qs = new URLSearchParams();
    if (patientId) qs.set('patient_id', patientId);
    if (limit) qs.set('limit', limit);
    const response = await apiFetch(`${config.apiUrl}/api/equipment/counts?${qs}`);
    return asJson(response, 'Failed to fetch stock activity');
  },

  /** Record a scheduled change. Refused with a 409 when tracked stock is out. */
  async logChange(equipmentId, changedAt) {
    const response = await apiFetch(`${config.apiUrl}/api/equipment/${equipmentId}/change`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ changed_at: changedAt }),
    });
    return asJson(response, 'Failed to record the change');
  },

  async create(data) {
    const response = await apiFetch(`${config.apiUrl}/api/equipment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return asJson(response, 'Failed to add the supply');
  },

  async remove(equipmentId) {
    const response = await apiFetch(`${config.apiUrl}/api/equipment/${equipmentId}`, {
      method: 'DELETE',
    });
    return asJson(response, 'Failed to remove the supply');
  },

  /** Add to what is on hand (a delta, not an absolute count). */
  async receive(equipmentId, amount) {
    const response = await apiFetch(`${config.apiUrl}/api/equipment/${equipmentId}/receive`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount }),
    });
    return asJson(response, 'Failed to record what arrived');
  },

  /** Take from what is on hand. Distinct from setCount, which is audited. */
  async open(equipmentId, amount) {
    const response = await apiFetch(`${config.apiUrl}/api/equipment/${equipmentId}/open`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount }),
    });
    return asJson(response, 'Failed to record what was used');
  },

  async update(equipmentId, data) {
    const response = await apiFetch(`${config.apiUrl}/api/equipment/${equipmentId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return asJson(response, 'Failed to update supply');
  },

  // --- Initial Inventory Setup ---
  async catalogImport({ patientId = null, supplierId = null, items }) {
    const response = await apiFetch(`${config.apiUrl}/api/equipment/catalog-import`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ patient_id: patientId, supplier_id: supplierId, items }),
    });
    return asJson(response, 'Failed to save the supply list');
  },

  // --- Stocktake (absolute count with audit trail) ---
  async setCount(equipmentId, { quantity, note = null }) {
    const response = await apiFetch(`${config.apiUrl}/api/equipment/${equipmentId}/count`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ quantity, note }),
    });
    return asJson(response, 'Failed to save the count');
  },

  async getCountHistory(equipmentId) {
    const response = await apiFetch(`${config.apiUrl}/api/equipment/${equipmentId}/counts`);
    return asJson(response, 'Failed to fetch count history');
  },

  // --- Provider aliases (alternate item numbers) ---
  async addAlias(equipmentId, { itemNumber, supplierId = null, rawDescription = null }) {
    const response = await apiFetch(`${config.apiUrl}/api/equipment/${equipmentId}/aliases`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ item_number: itemNumber, supplier_id: supplierId, raw_description: rawDescription }),
    });
    return asJson(response, 'Failed to add the item number');
  },

  async deleteAlias(equipmentId, aliasId) {
    const response = await apiFetch(`${config.apiUrl}/api/equipment/${equipmentId}/aliases/${aliasId}`, {
      method: 'DELETE',
    });
    return asJson(response, 'Failed to remove the item number');
  },
};
