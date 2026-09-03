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
// Shared helpers for the symptoms views (log form, active cards, history).

export const titleCase = (s) =>
  (s || '').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

// Severity bands: 0 idle, 1–3 mild (green), 4–7 moderate (amber),
// 8–10 severe (red — clinical concern, the one place red belongs).
export const bandFor = (sev) => {
  if (!sev || sev === 0) return { key: 'none', label: 'None' };
  if (sev <= 3) return { key: 'mild', label: 'Mild' };
  if (sev <= 7) return { key: 'moderate', label: 'Moderate' };
  return { key: 'severe', label: 'Severe' };
};

// "4D 19H" style elapsed label from an ISO start time.
export const elapsedLabel = (iso) => {
  if (!iso) return '';
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 0) return '0H';
  const hours = Math.floor(ms / 3600000);
  const days = Math.floor(hours / 24);
  if (days > 0) return `${days}D ${hours % 24}H`;
  if (hours > 0) return `${hours}H`;
  return `${Math.max(1, Math.floor(ms / 60000))}M`;
};
