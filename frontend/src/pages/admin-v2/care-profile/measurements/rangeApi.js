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
// Writes to /api/vitals/ranges.
//
// The endpoint upserts only the rows it is given, so each editor sends just
// the measurement it touched. It also overwrites every column on those rows,
// so a payload has to carry back the values it is not changing — otherwise
// saving an expected range would silently clear a hard limit.
import config, { apiFetch } from '../../../../config';

export const numOrNull = (v) =>
  (v === '' || v === null || v === undefined || Number.isNaN(Number(v)) ? null : Number(v));

// FastAPI hands back `detail` as a string for our own errors and as a list of
// objects for validation failures; stringifying the list renders
// "[object Object]".
export const rangeErrorText = (detail, fallback) => {
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail)) {
    const msgs = detail.map((d) => d?.msg).filter(Boolean);
    if (msgs.length) return msgs.join('; ');
  }
  return fallback;
};

/**
 * One row's payload, defaulting every field to what the API already resolved.
 *
 * Hard limits are only sent back when the patient already has a row for this
 * measurement: for a default-sourced row, sending the resolved values would
 * freeze today's global defaults as a per-patient override.
 */
export const rowPayload = (row, over = {}) => ({
  vital_key: row.vital_key,
  field_key: row.field_key || '',
  expected_min: numOrNull(row.expected_min),
  expected_max: numOrNull(row.expected_max),
  implausible_min: row.source === 'patient' ? numOrNull(row.implausible_min) : null,
  implausible_max: row.source === 'patient' ? numOrNull(row.implausible_max) : null,
  required: Boolean(row.required),
  note: row.note || null,
  ...over,
});

export async function saveRanges(patientId, ranges) {
  const res = await apiFetch(`${config.apiUrl}/api/vitals/ranges`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ patient_id: Number(patientId), ranges }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(rangeErrorText(body.detail, 'Could not save these bounds.'));
  return body.ranges || [];
}
