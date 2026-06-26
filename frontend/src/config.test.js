/*
 * Smart Home Health Hub
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
// Wave 2 — runtime API base resolution, ws URL derivation, and the iframe-aware
// apiFetch Bearer injection. jsdom default host is localhost, which we exploit
// for the env branches instead of stubbing window.location.
import { describe, it, expect, vi, afterEach } from 'vitest';
import config, { getApiBaseUrl, apiFetch } from './config';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('getApiBaseUrl', () => {
  it('uses the current host:8000 when env is unset', () => {
    vi.stubEnv('VITE_API_URL', '');
    expect(getApiBaseUrl()).toBe('http://localhost:8000');
  });

  it('uses the current host when env points at localhost', () => {
    vi.stubEnv('VITE_API_URL', 'http://localhost:9999');
    expect(getApiBaseUrl()).toBe('http://localhost:8000');
  });

  it('passes through an explicit non-localhost env URL', () => {
    vi.stubEnv('VITE_API_URL', 'http://192.168.1.184:8000');
    expect(getApiBaseUrl()).toBe('http://192.168.1.184:8000');
  });
});

describe('config.wsUrl', () => {
  it('derives ws:// from an http API url', () => {
    vi.stubEnv('VITE_API_URL', '');
    expect(config.wsUrl).toBe('ws://localhost:8000/ws/sensors');
  });

  it('derives wss:// from an https API url', () => {
    vi.stubEnv('VITE_API_URL', 'https://example.com:8000');
    expect(config.wsUrl).toBe('wss://example.com:8000/ws/sensors');
  });
});

describe('apiFetch (non-iframe)', () => {
  it('always sends credentials and never a Bearer header', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);

    await apiFetch('http://localhost:8000/api/x', { method: 'POST', headers: { X: '1' } });

    const [, opts] = fetchMock.mock.calls[0];
    expect(opts.credentials).toBe('include');
    expect(opts.method).toBe('POST');
    expect(opts.headers.Authorization).toBeUndefined();
  });
});

describe('apiFetch (cross-origin iframe)', () => {
  // _isIframe is computed at module load from window.self !== window.top; a
  // cross-origin parent makes accessing window.top throw -> treated as iframe.
  afterEach(() => {
    Object.defineProperty(window, 'top', { configurable: true, get: () => window });
    sessionStorage.clear();
    vi.resetModules();
  });

  it('attaches the stored token as a Bearer header', async () => {
    Object.defineProperty(window, 'top', {
      configurable: true,
      get() { throw new Error('cross-origin'); },
    });
    sessionStorage.setItem('auth_token', 'tok-123');
    vi.resetModules();
    const fresh = await import('./config');

    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);

    await fresh.apiFetch('http://localhost:8000/api/x');

    const [, opts] = fetchMock.mock.calls[0];
    expect(opts.credentials).toBe('include');
    expect(opts.headers.Authorization).toBe('Bearer tok-123');
  });
});
