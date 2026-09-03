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
// Fetching messages. The case that actually bit: the dashboard's active tab
// runs the low-stock generators before answering, so it is the slow request —
// and its late reply used to overwrite whichever tab the user had moved on to.
import { renderHook, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import useMessages from './useMessages';

const deferred = () => {
  let resolve;
  const promise = new Promise(r => { resolve = r; });
  return { promise, resolve };
};

const jsonRes = (body) => ({ ok: true, status: 200, json: async () => body });

beforeEach(() => { vi.restoreAllMocks(); });

describe('useMessages', () => {
  it('asks the per-user endpoint for the dashboard and the registry for admin', async () => {
    const fetchMock = vi.fn(async () => jsonRes({ items: [], count: 0 }));
    vi.stubGlobal('fetch', fetchMock);

    renderHook(() => useMessages({ scope: 'mine' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(fetchMock.mock.calls[0][0]).toContain('/api/messages/active');

    fetchMock.mockClear();
    renderHook(() => useMessages({ scope: 'all' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(fetchMock.mock.calls[0][0]).toContain('/api/messages?status=active');
  });

  it('ignores a slow reply for a tab the reader has already left', async () => {
    const slow = deferred();
    const fetchMock = vi.fn(async (url) => {
      if (String(url).includes('/active')) return slow.promise;
      return jsonRes({ items: [{ id: 7, title: 'Archived' }], total: 1, total_pages: 1 });
    });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useMessages({ scope: 'mine' }));
    act(() => result.current.setStatus('dismissed'));
    await waitFor(() => expect(result.current.items).toHaveLength(1));

    // The active request finally answers — with an empty list, which is the
    // truth for *that* tab and must not clear this one.
    await act(async () => { slow.resolve(jsonRes({ items: [], count: 0 })); });
    expect(result.current.items).toHaveLength(1);
    expect(result.current.status).toBe('dismissed');
  });

  it('starts from a handed-over list without re-running the generators', async () => {
    const fetchMock = vi.fn(async () => jsonRes({ items: [], count: 0 }));
    vi.stubGlobal('fetch', fetchMock);

    const seed = [{ id: 1, title: 'Already fetched' }];
    const { result } = renderHook(() => useMessages({ scope: 'mine', initialItems: seed }));
    expect(result.current.items).toEqual(seed);
    expect(result.current.loading).toBe(false);
    await new Promise(r => setTimeout(r, 20));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('surfaces a failure instead of showing an empty list', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 500, statusText: 'Server Error' })));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { result } = renderHook(() => useMessages({ scope: 'all' }));
    await waitFor(() => expect(result.current.error).toMatch(/Failed to load/));
  });

  it('drops a dismissed message from the list and re-reads', async () => {
    let page = [{ id: 4, title: 'Ojemda is running low' }];
    const fetchMock = vi.fn(async (url, opts) => {
      if (opts?.method === 'POST') { page = []; return jsonRes({ status: 'success' }); }
      return jsonRes({ items: page, count: page.length, total: page.length, total_pages: 1 });
    });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useMessages({ scope: 'mine' }));
    await waitFor(() => expect(result.current.items).toHaveLength(1));
    await act(async () => { await result.current.dismiss({ id: 4 }); });
    expect(result.current.items).toHaveLength(0);
    expect(fetchMock.mock.calls.some(([u, o]) =>
      String(u).endsWith('/api/messages/4/dismiss') && o?.method === 'POST')).toBe(true);
  });
});
