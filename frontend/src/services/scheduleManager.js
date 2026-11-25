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
import config, { apiFetch } from '../config';

async function request(patientId, path = '', method = 'GET', payload) {
  const response = await apiFetch(
    `${config.apiUrl}/api/schedule-manager/${encodeURIComponent(patientId)}${path}`,
    {
      method,
      ...(payload && { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }),
    },
  );
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = Array.isArray(body.detail)
      ? body.detail.map((entry) => entry.msg).join('. ')
      : body.detail;
    const error = new Error(detail || `Schedule Manager request failed (${response.status}).`);
    error.status = response.status;
    throw error;
  }
  return body;
}

export const scheduleManagerService = {
  get: (patientId) => request(patientId),
  save: (patientId, settings, replaceRecipients) =>
    request(patientId, `?replace_check_recipients=${Boolean(replaceRecipients)}`, 'PUT', settings),
  preview: (patientId, settings, replaceRecipients) =>
    request(patientId, `/preview?replace_check_recipients=${Boolean(replaceRecipients)}`, 'POST', settings),
  moveFeed: (patientId, occurrence) => request(patientId, '/feed-start', 'PUT', occurrence),
  record: (patientId, action) => request(patientId, '/actions', 'POST', action),
};
