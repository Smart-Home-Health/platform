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
// An <img src> can't carry the Bearer token apiFetch adds when the app runs
// inside a Home Assistant iframe (cookies are blocked cross-origin there). So
// authenticated images are fetched as blobs and shown via object URLs. One
// in-flight/resolved entry per URL, ref-counted across consumers, revoked when
// the last consumer unmounts; the server's immutable Cache-Control keeps the
// network side cheap.
import { useEffect, useState } from 'react';
import { apiFetch } from '../config';

const cache = new Map(); // url -> { refs, objectUrl, error, promise }

function entryFor(url) {
  let entry = cache.get(url);
  if (entry) return entry;
  entry = { refs: 0, objectUrl: null, error: null, promise: null };
  entry.promise = apiFetch(url)
    .then((res) => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.blob();
    })
    .then((blob) => {
      if (entry.refs <= 0) return; // everyone left before it arrived
      entry.objectUrl = URL.createObjectURL(blob);
    })
    .catch((err) => { entry.error = err; });
  cache.set(url, entry);
  return entry;
}

function release(url, entry) {
  entry.refs -= 1;
  if (entry.refs > 0) return;
  if (entry.objectUrl) URL.revokeObjectURL(entry.objectUrl);
  entry.objectUrl = null;
  cache.delete(url);
}

/** @returns {{ src: string|null, error: Error|null }} */
export function useAuthedImageUrl(url) {
  const [state, setState] = useState({ src: null, error: null });

  useEffect(() => {
    if (!url) {
      setState({ src: null, error: null });
      return undefined;
    }
    const entry = entryFor(url);
    entry.refs += 1;
    let active = true;
    entry.promise.then(() => {
      if (active) setState({ src: entry.objectUrl, error: entry.error });
    });
    return () => {
      active = false;
      release(url, entry);
    };
  }, [url]);

  return state;
}

/** Test hook: forget everything (does not revoke). */
export function _resetAuthedImageCache() {
  cache.clear();
}
