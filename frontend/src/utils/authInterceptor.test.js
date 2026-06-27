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
// Wave 2 — global stale-JWT fetch interceptor. The module has an install-once
// `installed` guard, so each test resets modules + dynamic-imports a fresh copy
// and saves/restores window.fetch.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// A Response-like with the clone().json() shape the interceptor reads.
const res = (status, body = {}) => ({ status, clone: () => ({ json: async () => body }) });
const flush = () => new Promise((r) => setTimeout(r, 0));

let originalFetch;

beforeEach(() => {
  originalFetch = window.fetch;
  vi.resetModules();
});

afterEach(() => {
  window.fetch = originalFetch;
});

// Install a fresh interceptor on top of a base fetch mock that returns `response`.
async function install({ response, getAuthLevel, onStale }) {
  const base = vi.fn().mockResolvedValue(response);
  window.fetch = base;
  const { installAuthInterceptor } = await import('./authInterceptor');
  installAuthInterceptor({ getAuthLevel, onStale });
  return base;
}

describe('installAuthInterceptor', () => {
  it('passes /api/auth/* through without triggering recovery', async () => {
    const onStale = vi.fn();
    await install({ response: res(401, { requires_auth: true }), getAuthLevel: () => 'full', onStale });

    await window.fetch('http://localhost/api/auth/session');
    await flush();
    expect(onStale).not.toHaveBeenCalled();
  });

  it('recovers on a 401 middleware rejection (requires_auth)', async () => {
    const onStale = vi.fn();
    await install({ response: res(401, { requires_auth: true }), getAuthLevel: () => 'full', onStale });

    await window.fetch('http://localhost/api/patients');
    await flush();
    expect(onStale).toHaveBeenCalledTimes(1);
  });

  it('ignores a plain restricted-read 401 (no requires_auth)', async () => {
    const onStale = vi.fn();
    await install({ response: res(401, { detail: 'Not authenticated' }), getAuthLevel: () => 'full', onStale });

    await window.fetch('http://localhost/api/patients/1');
    await flush();
    expect(onStale).not.toHaveBeenCalled();
  });

  it('recovers on a 403 while full-auth (silent downgrade)', async () => {
    const onStale = vi.fn();
    await install({ response: res(403), getAuthLevel: () => 'full', onStale });

    await window.fetch('http://localhost/api/care/thing');
    await flush();
    expect(onStale).toHaveBeenCalledTimes(1);
  });

  it('ignores a 403 when not full-auth', async () => {
    const onStale = vi.fn();
    await install({ response: res(403), getAuthLevel: () => 'account', onStale });

    await window.fetch('http://localhost/api/care/thing');
    await flush();
    expect(onStale).not.toHaveBeenCalled();
  });

  it('collapses a burst of failures into a single recovery (single-flight)', async () => {
    const onStale = vi.fn();
    await install({ response: res(401, { requires_auth: true }), getAuthLevel: () => 'full', onStale });

    await Promise.all([
      window.fetch('http://localhost/api/a'),
      window.fetch('http://localhost/api/b'),
      window.fetch('http://localhost/api/c'),
    ]);
    await flush();
    expect(onStale).toHaveBeenCalledTimes(1);
  });

  it('returns the original response to the caller', async () => {
    const response = res(200, { ok: true });
    await install({ response, getAuthLevel: () => 'full', onStale: vi.fn() });
    const out = await window.fetch('http://localhost/api/x');
    expect(out).toBe(response);
  });
});
