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

async function request(path, method, payload) {
  const response = await apiFetch(`${config.apiUrl}/api/schedule/${path}`, {
    method,
    ...(payload && { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = body.detail;
    const message = Array.isArray(detail) ? detail.map(entry => entry.msg).join('. ')
      : typeof detail === 'string' ? detail : detail?.message;
    const error = new Error(message || (method === 'GET' ? 'Could not load the reminder settings.' : 'Could not save the reminder settings.'));
    error.detail = detail;
    throw error;
  }
  return body;
}

export const scheduleReminders = {
  defaults: patientId => request(`reminder-defaults/${patientId}`, 'GET'),
  saveDefault: (patientId, minutes) =>
    request(`reminder-defaults/${patientId}`, 'PUT', { reminder_window_minutes: minutes }),
  move: (category, occurrence) => request(`reminders/${category}`, 'PUT', occurrence),
  cancel: (category, occurrence) => request(`reminders/${category}`, 'DELETE', occurrence),
};
