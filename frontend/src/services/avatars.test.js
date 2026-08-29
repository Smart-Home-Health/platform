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
import { describe, it, expect, vi, beforeEach } from 'vitest';
import config from '../config';
import { avatarPhotoUrl, avatarService } from './avatars';

const ok = (body) => Promise.resolve({ ok: true, json: () => Promise.resolve(body) });

describe('avatarService', () => {
  beforeEach(() => { vi.stubGlobal('fetch', vi.fn()); });

  it('spells the photo URL once, for users and patients only', () => {
    expect(avatarPhotoUrl('user', 3, 'abc.jpg')).toBe(`${config.apiUrl}/api/users/3/avatar/photo/abc.jpg`);
    expect(avatarPhotoUrl('patient', 5, 'abc.png')).toBe(`${config.apiUrl}/api/patients/5/avatar/photo/abc.png`);
    expect(avatarPhotoUrl('provider', 5, 'abc.png')).toBeNull();
    expect(avatarPhotoUrl('user', 3, null)).toBeNull();
    expect(avatarPhotoUrl('user', null, 'abc.jpg')).toBeNull();
  });

  it('shuffles with POST', async () => {
    fetch.mockReturnValue(ok({ avatar_seed: 'x', avatar_photo: null }));
    const out = await avatarService.shuffle('patient', 5);
    expect(out.avatar_seed).toBe('x');
    const [url, opts] = fetch.mock.calls[0];
    expect(url).toBe(`${config.apiUrl}/api/patients/5/avatar/shuffle`);
    expect(opts.method).toBe('POST');
    expect(opts.credentials).toBe('include');
  });

  it('uploads multipart without forcing a Content-Type', async () => {
    fetch.mockReturnValue(ok({ avatar_seed: null, avatar_photo: 'f.jpg' }));
    const file = new File([new Uint8Array([1, 2, 3])], 'p.jpg', { type: 'image/jpeg' });
    await avatarService.uploadPhoto('user', 2, file);
    const [url, opts] = fetch.mock.calls[0];
    expect(url).toBe(`${config.apiUrl}/api/users/2/avatar/photo`);
    expect(opts.method).toBe('PUT');
    expect(opts.body).toBeInstanceOf(FormData);
    expect(opts.body.get('file')).toBe(file);
    expect(opts.headers?.['Content-Type']).toBeUndefined();
  });

  it('removes with DELETE and surfaces the API detail on failure', async () => {
    fetch.mockReturnValue(Promise.resolve({
      ok: false, json: () => Promise.resolve({ detail: 'Photo not found' }),
    }));
    await expect(avatarService.removePhoto('user', 2)).rejects.toThrow('Photo not found');
    expect(fetch.mock.calls[0][1].method).toBe('DELETE');
  });

  it('refuses kinds without an avatar API', async () => {
    await expect(avatarService.shuffle('provider', 1)).rejects.toThrow(/No avatar API/);
  });
});
