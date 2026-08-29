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
// Avatar API — shuffle the generated design, upload/remove a photo, and the
// one place the photo URL is spelled out.
import config, { apiFetch } from '../config';

async function asJson(response, fallbackMessage) {
  if (!response.ok) {
    let detail = fallbackMessage;
    try {
      const body = await response.json();
      detail = body.detail || body.error || fallbackMessage;
    } catch { /* non-JSON error body */ }
    throw new Error(detail);
  }
  return response.json();
}

const collection = (kind) => {
  if (kind === 'user') return 'users';
  if (kind === 'patient') return 'patients';
  throw new Error(`No avatar API for ${kind}`);
};
const base = (kind, id) => `${config.apiUrl}/api/${collection(kind)}/${id}/avatar`;

/** Where a stored photo is served from, or null (providers have no photos). */
export function avatarPhotoUrl(kind, id, photo) {
  if (!photo || id === null || id === undefined) return null;
  if (kind !== 'user' && kind !== 'patient') return null;
  return `${base(kind, id)}/photo/${photo}`;
}

export const avatarService = {
  async shuffle(kind, id) {
    const res = await apiFetch(`${base(kind, id)}/shuffle`, { method: 'POST' });
    return asJson(res, 'Failed to shuffle the avatar');
  },

  // No Content-Type header: the browser sets the multipart boundary itself.
  async uploadPhoto(kind, id, file) {
    const fd = new FormData();
    fd.append('file', file);
    const res = await apiFetch(`${base(kind, id)}/photo`, { method: 'PUT', body: fd });
    return asJson(res, 'Failed to upload the photo');
  },

  async removePhoto(kind, id) {
    const res = await apiFetch(`${base(kind, id)}/photo`, { method: 'DELETE' });
    return asJson(res, 'Failed to remove the photo');
  },
};

export default avatarService;
