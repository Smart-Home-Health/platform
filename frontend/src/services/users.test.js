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
// Wave 2 — user/role REST wrappers. These go through apiFetch (which adds
// credentials:'include'); we mock global.fetch underneath it.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { userService } from './users';

const res = (body, { ok = true, status = 200 } = {}) => ({ ok, status, json: async () => body });

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(res({})));
});

const calledUrl = () => fetch.mock.calls[0][0];
const calledOpts = () => fetch.mock.calls[0][1] || {};

describe('userService', () => {
  it('getUsers GETs /api/auth/users with credentials', async () => {
    fetch.mockResolvedValueOnce(res([{ id: 1 }]));
    const out = await userService.getUsers();
    expect(calledUrl()).toContain('/api/auth/users');
    expect(calledOpts().credentials).toBe('include');
    expect(out).toEqual([{ id: 1 }]);
  });

  it('getUser hits the id path', async () => {
    await userService.getUser(9);
    expect(calledUrl()).toContain('/api/auth/users/9');
  });

  it('createUser POSTs JSON and surfaces detail on error', async () => {
    await userService.createUser({ username: 'x' });
    expect(calledOpts().method).toBe('POST');
    expect(JSON.parse(calledOpts().body)).toEqual({ username: 'x' });

    fetch.mockResolvedValueOnce(res({ detail: 'Username taken' }, { ok: false, status: 400 }));
    await expect(userService.createUser({ username: 'x' })).rejects.toThrow('Username taken');
  });

  it('updateUser PUTs to the id path', async () => {
    await userService.updateUser(2, { full_name: 'New' });
    expect(calledUrl()).toContain('/api/auth/users/2');
    expect(calledOpts().method).toBe('PUT');
  });

  it('deleteUser DELETEs the id path', async () => {
    await userService.deleteUser(3);
    expect(calledUrl()).toContain('/api/auth/users/3');
    expect(calledOpts().method).toBe('DELETE');
  });

  it('getRoles GETs /api/auth/roles', async () => {
    await userService.getRoles();
    expect(calledUrl()).toContain('/api/auth/roles');
  });

  it('assignRole POSTs role_id + expires_at', async () => {
    await userService.assignRole(4, 11);
    expect(calledUrl()).toContain('/api/auth/users/4/roles');
    expect(calledOpts().method).toBe('POST');
    expect(JSON.parse(calledOpts().body)).toEqual({ role_id: 11, expires_at: null });
  });

  it('removeRole DELETEs the user/role path', async () => {
    await userService.removeRole(4, 11);
    expect(calledUrl()).toContain('/api/auth/users/4/roles/11');
    expect(calledOpts().method).toBe('DELETE');
  });
});
