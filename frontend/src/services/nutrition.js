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
// Nutrition API service — intake, output events, the saved-item library and
// presets. Nutrition calls used to be ~20 inline fetches scattered across the
// pages and modals; new work goes through here.
import config, { apiFetch } from '../config';

async function asJson(response, fallbackMessage) {
  if (!response.ok) {
    let detail = fallbackMessage;
    try {
      const body = await response.json();
      detail = body.detail || body.error || fallbackMessage;
    } catch { /* non-JSON error body */ }
    throw new Error(detail);
  }
  return response.json();
}

const jsonPost = (url, body, method = 'POST') => apiFetch(url, {
  method,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

export const nutritionService = {
  // ---------- intake ----------
  async createIntake(patientId, data) {
    const response = await jsonPost(
      `${config.apiUrl}/api/nutrition-intake?patient_id=${patientId}`, data,
    );
    return asJson(response, 'Failed to log intake');
  },

  async updateIntake(intakeId, data) {
    const response = await jsonPost(
      `${config.apiUrl}/api/nutrition-intake/${intakeId}`, data, 'PUT',
    );
    return asJson(response, 'Failed to update intake');
  },

  async deleteIntake(intakeId) {
    const response = await apiFetch(`${config.apiUrl}/api/nutrition-intake/${intakeId}`, {
      method: 'DELETE',
    });
    return asJson(response, 'Failed to delete intake');
  },

  // ---------- output ----------
  // One bathroom event, written as its 1-2 rows in a single transaction. The
  // urine/stool split still happens — server-side, atomically — so a failure
  // can no longer leave half an event in the record.
  async createOutputEvent(event) {
    const response = await jsonPost(`${config.apiUrl}/api/nutrition/outputs/event`, event);
    return asJson(response, 'Failed to log output');
  },

  async updateOutput(outputId, data) {
    const response = await jsonPost(
      `${config.apiUrl}/api/nutrition/outputs/${outputId}`, data, 'PUT',
    );
    return asJson(response, 'Failed to update output');
  },

  async deleteOutput(outputId) {
    const response = await apiFetch(`${config.apiUrl}/api/nutrition/outputs/${outputId}`, {
      method: 'DELETE',
    });
    return asJson(response, 'Failed to delete output');
  },

  async outputTypes() {
    const response = await apiFetch(`${config.apiUrl}/api/nutrition/outputs/types`);
    return asJson(response, 'Failed to fetch output options');
  },

  // ---------- saved items ----------
  async listItems({ patientId, search, itemType, limit = 50 } = {}) {
    const params = new URLSearchParams();
    if (patientId) params.set('patient_id', patientId);
    if (search) params.set('search', search);
    if (itemType) params.set('item_type', itemType);
    params.set('limit', String(limit));
    const response = await apiFetch(`${config.apiUrl}/api/nutrition/items?${params}`);
    return asJson(response, 'Failed to fetch saved items');
  },

  async createItem(data) {
    const response = await jsonPost(`${config.apiUrl}/api/nutrition/items`, data);
    return asJson(response, 'Failed to save item');
  },

  async updateItem(itemId, data) {
    const response = await jsonPost(`${config.apiUrl}/api/nutrition/items/${itemId}`, data, 'PUT');
    return asJson(response, 'Failed to update item');
  },

  async deleteItem(itemId) {
    const response = await apiFetch(`${config.apiUrl}/api/nutrition/items/${itemId}`, {
      method: 'DELETE',
    });
    return asJson(response, 'Failed to remove item');
  },

  // ---------- presets ----------
  async listPresets(patientId) {
    const qs = patientId ? `?patient_id=${patientId}` : '';
    const response = await apiFetch(`${config.apiUrl}/api/nutrition/presets${qs}`);
    return asJson(response, 'Failed to fetch presets');
  },

  async createPreset(data) {
    const response = await jsonPost(`${config.apiUrl}/api/nutrition/presets`, data);
    return asJson(response, 'Failed to save preset');
  },

  async deletePreset(presetId) {
    const response = await apiFetch(`${config.apiUrl}/api/nutrition/presets/${presetId}`, {
      method: 'DELETE',
    });
    return asJson(response, 'Failed to remove preset');
  },

  // Logs every component of a preset as its own intake row, grouped.
  async applyPreset(presetId, data) {
    const response = await jsonPost(
      `${config.apiUrl}/api/nutrition/presets/${presetId}/apply`, data,
    );
    return asJson(response, 'Failed to apply preset');
  },

  // ---------- recent ----------
  async recent(patientId, limit = 6) {
    const response = await apiFetch(
      `${config.apiUrl}/api/nutrition/recent?patient_id=${patientId}&limit=${limit}`,
    );
    return asJson(response, 'Failed to fetch recent items');
  },
};

export default nutritionService;
