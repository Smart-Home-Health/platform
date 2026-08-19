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
// Shipments / deliveries API service.
// New endpoints from the delivery-confirmation rework go through here;
// older inline fetches in the shipment pages migrate opportunistically.
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

export const shipmentService = {
  // --- Shipments / deliveries ---
  async listShipments(params = {}) {
    const qs = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') qs.set(k, v);
    });
    const response = await apiFetch(`${config.apiUrl}/api/shipments?${qs}`);
    return asJson(response, 'Failed to fetch shipments');
  },

  async getShipment(shipmentId) {
    const response = await apiFetch(`${config.apiUrl}/api/shipments/${shipmentId}`);
    return asJson(response, 'Failed to fetch shipment');
  },

  async createShipment(data) {
    const response = await apiFetch(`${config.apiUrl}/api/shipments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return asJson(response, 'Failed to create shipment');
  },

  async deleteShipment(shipmentId) {
    const response = await apiFetch(`${config.apiUrl}/api/shipments/${shipmentId}`, {
      method: 'DELETE',
    });
    return asJson(response, 'Failed to delete shipment');
  },

  async patchShipment(shipmentId, data) {
    const response = await apiFetch(`${config.apiUrl}/api/shipments/${shipmentId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return asJson(response, 'Failed to update shipment');
  },

  async copyShipment(shipmentId) {
    const response = await apiFetch(`${config.apiUrl}/api/shipments/${shipmentId}/copy`, {
      method: 'POST',
    });
    return asJson(response, 'Failed to copy shipment');
  },

  // --- Items ---
  async addItem(shipmentId, data) {
    const response = await apiFetch(`${config.apiUrl}/api/shipments/${shipmentId}/items`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return asJson(response, 'Failed to add item');
  },

  // --- Receiving ---
  async receiveItems(shipmentId, items) {
    const response = await apiFetch(`${config.apiUrl}/api/shipments/${shipmentId}/receive`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(items),
    });
    return asJson(response, 'Failed to record receipt');
  },

  async finalizeShipment(shipmentId) {
    const response = await apiFetch(`${config.apiUrl}/api/shipments/${shipmentId}/finalize`, {
      method: 'POST',
    });
    return asJson(response, 'Failed to finalize shipment');
  },

  // --- Alerts ---
  // These had no service entry at all; the alerts page hand-rolled every call.
  async listAlerts(params = {}) {
    const qs = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') qs.set(k, v);
    });
    const response = await apiFetch(`${config.apiUrl}/api/shipments/alerts?${qs}`);
    return asJson(response, 'Failed to fetch alerts');
  },

  async listShipmentAlerts(shipmentId) {
    const response = await apiFetch(`${config.apiUrl}/api/shipments/${shipmentId}/alerts`);
    return asJson(response, 'Failed to fetch alerts');
  },

  async resolveAlert(alertId, resolutionNotes = null) {
    const response = await apiFetch(`${config.apiUrl}/api/shipments/alerts/${alertId}/resolve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ resolution_notes: resolutionNotes }),
    });
    return asJson(response, 'Failed to resolve alert');
  },

  async createFollowupOrder(alertIds) {
    const response = await apiFetch(`${config.apiUrl}/api/shipments/alerts/create-followup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ alert_ids: alertIds }),
    });
    return asJson(response, 'Failed to create follow-up order');
  },

  // --- Standing orders ("usual order") ---
  async listTemplates(patientId) {
    return this.listShipments({ patient_id: patientId, is_template: true });
  },

  async createDeliveryFromTemplate(templateId, expectedDelivery = null) {
    const response = await apiFetch(`${config.apiUrl}/api/shipments/${templateId}/create-delivery`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ expected_delivery: expectedDelivery }),
    });
    return asJson(response, 'Failed to create delivery');
  },

  // --- Reconcile (one-call delivery confirm) ---
  async reconcileShipment(shipmentId, { mode = 'same_as_usual', items = null, confirmedDeliveryDate = null } = {}) {
    const response = await apiFetch(`${config.apiUrl}/api/shipments/${shipmentId}/reconcile`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mode,
        items,
        confirmed_delivery_date: confirmedDeliveryDate,
      }),
    });
    return asJson(response, 'Failed to confirm delivery');
  },

  async updateItem(shipmentId, itemId, data) {
    const response = await apiFetch(`${config.apiUrl}/api/shipments/${shipmentId}/items/${itemId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return asJson(response, 'Failed to update item');
  },

  async deleteItem(shipmentId, itemId) {
    const response = await apiFetch(`${config.apiUrl}/api/shipments/${shipmentId}/items/${itemId}`, {
      method: 'DELETE',
    });
    return asJson(response, 'Failed to remove item');
  },

  async bulkAddItems(shipmentId, items) {
    const response = await apiFetch(`${config.apiUrl}/api/shipments/${shipmentId}/items/bulk`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(items),
    });
    return asJson(response, 'Failed to add items');
  },

  // --- Packing-slip documents ---
  async uploadDocument(shipmentId, file, { pageNumber = null, title = null } = {}) {
    const fd = new FormData();
    fd.append('file', file);
    if (pageNumber !== null) fd.append('page_number', String(pageNumber));
    if (title) fd.append('title', title);
    const response = await apiFetch(`${config.apiUrl}/api/shipments/${shipmentId}/documents`, {
      method: 'POST',
      body: fd,
    });
    return asJson(response, 'Failed to upload packing slip');
  },

  async listDocuments(shipmentId) {
    const response = await apiFetch(`${config.apiUrl}/api/shipments/${shipmentId}/documents`);
    return asJson(response, 'Failed to fetch packing slips');
  },

  documentRawUrl(shipmentId, documentId) {
    return `${config.apiUrl}/api/shipments/${shipmentId}/documents/${documentId}/raw`;
  },

  async deleteDocument(shipmentId, documentId) {
    const response = await apiFetch(`${config.apiUrl}/api/shipments/${shipmentId}/documents/${documentId}`, {
      method: 'DELETE',
    });
    return asJson(response, 'Failed to delete packing slip');
  },

  // --- Inventory ---
  async getInventory(patientId) {
    const qs = patientId ? `?patient_id=${patientId}` : '';
    const response = await apiFetch(`${config.apiUrl}/api/shipments/inventory${qs}`);
    return asJson(response, 'Failed to fetch inventory');
  },
};
