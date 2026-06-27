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
// Wave 2 — settings REST wrappers. getSetting has special-cased 404/default
// fallback and swallows errors; the mutators throw on !ok.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getSettings, getSetting, setSetting, updateSettings, deleteSetting } from './settings';

const res = (body, { ok = true, status = 200 } = {}) => ({ ok, status, json: async () => body });

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(res({})));
  vi.spyOn(console, 'error').mockImplementation(() => {}); // wrappers log on catch
});

const calledUrl = () => fetch.mock.calls[0][0];
const calledOpts = () => fetch.mock.calls[0][1] || {};

describe('getSettings', () => {
  it('GETs /api/settings and returns json', async () => {
    fetch.mockResolvedValueOnce(res({ a: 1 }));
    expect(await getSettings()).toEqual({ a: 1 });
    expect(calledUrl()).toContain('/api/settings');
    expect(calledOpts().credentials).toBe('include');
  });

  it('throws on a non-ok response', async () => {
    fetch.mockResolvedValueOnce(res({}, { ok: false, status: 500 }));
    await expect(getSettings()).rejects.toThrow(/Failed to fetch settings/);
  });
});

describe('getSetting', () => {
  it('returns the value on success', async () => {
    fetch.mockResolvedValueOnce(res({ value: 'blue' }));
    expect(await getSetting('theme')).toBe('blue');
  });

  it('returns the default on 404', async () => {
    fetch.mockResolvedValueOnce(res({}, { ok: false, status: 404 }));
    expect(await getSetting('missing', 'fallback')).toBe('fallback');
  });

  it('appends ?default= when a default is given', async () => {
    fetch.mockResolvedValueOnce(res({ value: 'x' }));
    await getSetting('k', 'def');
    expect(calledUrl()).toContain('/api/settings/k?default=def');
  });

  it('swallows network errors and returns the default', async () => {
    fetch.mockRejectedValueOnce(new Error('boom'));
    expect(await getSetting('k', 'safe')).toBe('safe');
  });
});

describe('mutators', () => {
  it('setSetting POSTs value/data_type/description', async () => {
    await setSetting('k', 42, 'int', 'desc');
    expect(calledUrl()).toContain('/api/settings/k');
    expect(calledOpts().method).toBe('POST');
    expect(JSON.parse(calledOpts().body)).toEqual({ value: 42, data_type: 'int', description: 'desc' });
  });

  it('updateSettings POSTs a settings object', async () => {
    await updateSettings({ a: '1', b: '2' });
    expect(calledUrl()).toMatch(/\/api\/settings$/);
    expect(JSON.parse(calledOpts().body)).toEqual({ settings: { a: '1', b: '2' } });
  });

  it('deleteSetting DELETEs the key', async () => {
    await deleteSetting('k');
    expect(calledUrl()).toContain('/api/settings/k');
    expect(calledOpts().method).toBe('DELETE');
  });

  it('setSetting throws on a non-ok response', async () => {
    fetch.mockResolvedValueOnce(res({}, { ok: false, status: 500 }));
    await expect(setSetting('k', 1)).rejects.toThrow(/Failed to save setting/);
  });
});
