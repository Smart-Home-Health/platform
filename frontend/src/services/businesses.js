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
// Businesses. Only the supplier lookup the shipments pages need lives here so
// far — both of them fetched `/api/businesses?type=dme` by hand, and each
// unwrapped the response differently.
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

export const businessService = {
  /** DME suppliers, always as an array. */
  async listDmeSuppliers() {
    const response = await apiFetch(`${config.apiUrl}/api/businesses?type=dme`);
    const data = await asJson(response, 'Failed to fetch suppliers');
    if (Array.isArray(data)) return data;
    return data.businesses || [];
  },
};

export default businessService;
