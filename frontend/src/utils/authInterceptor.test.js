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
  sessionStorage.clear();
  // Restore non-iframe state (some tests redefine window.top).
  Object.defineProperty(window, 'top', { value: window, configurable: true });
});

// Install a fresh interceptor on top of a base fetch mock that returns `response`.
// `iframe: true` makes the module detect a cross-origin embedding (window.top
// differs from window.self) — must be set before the dynamic import since the
// module reads `isIframe` at load.
async function install({ response, getAuthLevel, onStale, iframe = false }) {
  if (iframe) {
    Object.defineProperty(window, 'top', { value: {}, configurable: true });
  }
  const base = vi.fn().mockResolvedValue(response);
  window.fetch = base;
  const { installAuthInterceptor } = await import('./authInterceptor');
  installAuthInterceptor({ getAuthLevel, onStale });
  return base;
}

// Authorization header sent to the base fetch for a given mock call (0-indexed).
function authHeaderOf(base, callIndex = 0) {
  const init = base.mock.calls[callIndex]?.[1];
  const headers = init?.headers;
  if (!headers) return undefined;
  if (typeof Headers !== 'undefined' && headers instanceof Headers) {
    return headers.get('Authorization') ?? undefined;
  }
  return headers.Authorization;
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

  describe('iframe Bearer injection', () => {
    it('attaches the stored token for same-origin requests when embedded', async () => {
      sessionStorage.setItem('auth_token', 'tok123');
      const base = await install({
        response: res(200), getAuthLevel: () => 'full', onStale: vi.fn(), iframe: true,
      });

      await window.fetch(`${window.location.origin}/api/dashboard/summary`);
      expect(authHeaderOf(base)).toBe('Bearer tok123');
    });

    it('does NOT attach the token when not in an iframe', async () => {
      sessionStorage.setItem('auth_token', 'tok123');
      const base = await install({
        response: res(200), getAuthLevel: () => 'full', onStale: vi.fn(), iframe: false,
      });

      await window.fetch(`${window.location.origin}/api/dashboard/summary`);
      expect(authHeaderOf(base)).toBeUndefined();
    });

    it('does NOT attach the token when none is stored', async () => {
      const base = await install({
        response: res(200), getAuthLevel: () => 'full', onStale: vi.fn(), iframe: true,
      });

      await window.fetch(`${window.location.origin}/api/dashboard/summary`);
      expect(authHeaderOf(base)).toBeUndefined();
    });

    it('does NOT attach the token to cross-origin requests', async () => {
      sessionStorage.setItem('auth_token', 'tok123');
      const base = await install({
        response: res(200), getAuthLevel: () => 'full', onStale: vi.fn(), iframe: true,
      });

      await window.fetch('https://evil.example.com/steal');
      expect(authHeaderOf(base)).toBeUndefined();
    });

    it('does NOT clobber a caller-supplied Authorization header', async () => {
      sessionStorage.setItem('auth_token', 'tok123');
      const base = await install({
        response: res(200), getAuthLevel: () => 'full', onStale: vi.fn(), iframe: true,
      });

      await window.fetch(`${window.location.origin}/api/x`, {
        headers: { Authorization: 'Bearer existing' },
      });
      expect(authHeaderOf(base)).toBe('Bearer existing');
    });

    it('merges into an existing init without dropping other options', async () => {
      sessionStorage.setItem('auth_token', 'tok123');
      const base = await install({
        response: res(200), getAuthLevel: () => 'full', onStale: vi.fn(), iframe: true,
      });

      await window.fetch(`${window.location.origin}/api/x`, {
        method: 'POST', credentials: 'include',
      });
      const init = base.mock.calls[0][1];
      expect(init.method).toBe('POST');
      expect(init.credentials).toBe('include');
      expect(authHeaderOf(base)).toBe('Bearer tok123');
    });
  });
});
