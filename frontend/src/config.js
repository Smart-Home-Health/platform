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
// Base API URL for backend requests. Resolved at runtime so the app works from
// any device (e.g. a phone at 192.168.1.184) with no rebuild.
//
// Same-origin by default: the unified production image serves this SPA and the
// API from one origin, and split dev runs behind a Vite proxy (/api + /ws ->
// backend:8000, see vite.config.js), so the browser only ever talks to the host
// it loaded the page from. `window.location.origin` therefore works for both —
// no hardcoded :8000 port. An explicit non-localhost VITE_API_URL still wins
// (e.g. pointing a standalone frontend at a remote API).
export function getApiBaseUrl() {
  const envUrl = import.meta.env.VITE_API_URL;
  if (envUrl && !String(envUrl).includes('localhost')) return envUrl;
  if (typeof window !== 'undefined') return window.location.origin;
  return 'http://localhost:8000';
}
// Coerce to string when used in template literals or .replace(); always returns current value.
export const API_BASE_URL = { toString: getApiBaseUrl, valueOf: getApiBaseUrl };

// Detect cross-origin iframe (e.g. Home Assistant embedding)
const _isIframe = (() => { try { return window.self !== window.top; } catch { return true; } })();

/**
 * Drop-in fetch wrapper that attaches the stored auth token as a Bearer header
 * when running inside a cross-origin iframe (where SameSite cookies are blocked).
 * Use exactly like fetch(): apiFetch(url, { method, headers, body, ... })
 */
export function apiFetch(url, options = {}) {
  const opts = { credentials: 'include', ...options };
  if (_isIframe) {
    const token = sessionStorage.getItem('auth_token');
    if (token) {
      opts.headers = { ...opts.headers, Authorization: `Bearer ${token}` };
    }
  }
  return fetch(url, opts);
}

const config = {
  get apiUrl() {
    return getApiBaseUrl();
  },
  
  // WebSocket URL derived from API URL
  get wsUrl() {
    const url = new URL(this.apiUrl);
    const protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${protocol}//${url.host}/ws/sensors`;
  },
  
  // Add other configuration values here
  chartRefreshRate: import.meta.env.VITE_CHART_REFRESH_RATE || 1000,
  chartTimespan: import.meta.env.VITE_CHART_TIMESPAN || 5,

  // Ensure this is correctly set
  vitalsEndpoints: {
    manual: '/api/vitals/manual',
    nutrition: '/api/vitals/nutrition',
    weight: '/api/vitals/weight',
  }
};

export default config;