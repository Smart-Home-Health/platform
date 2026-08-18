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
// Fetching and acting on messages, shared by both hosts.
//
// The two surfaces mean different things by "active" and the API has an
// endpoint for each, so `scope` picks:
//   'mine' — GET /api/messages/active: what this user must deal with now. Runs
//            the generators first, and drops messages this user has already
//            acknowledged or snoozed. The dashboard's badge counts these.
//   'all'  — GET /api/messages?status=active: every open message regardless of
//            who has snoozed it. The admin registry has to show those.
// Dismissed and resolved only exist on the paginated endpoint, so both scopes
// use it for those tabs.
import { useCallback, useEffect, useRef, useState } from 'react';
import config, { apiFetch } from '../../config';

export default function useMessages({ scope = 'all', pageSize = 20, initialItems = null } = {}) {
  const [status, setStatusRaw] = useState('active');
  const [page, setPage] = useState(1);
  const [items, setItems] = useState(initialItems || []);
  const [total, setTotal] = useState(initialItems ? initialItems.length : 0);
  const [totalPages, setTotalPages] = useState(0);
  const [loading, setLoading] = useState(!initialItems);
  const [error, setError] = useState(null);
  const [busyId, setBusyId] = useState(null);
  // The auto-pop hands over the list it already fetched; the first fetch would
  // only re-run the generators for the same answer. It is skipped once — every
  // later tab change, action or refresh talks to the API normally.
  const skipFirst = useRef(!!initialItems);
  // Requests can land out of order — the active tab runs the generators before
  // answering, so it is the slow one, and its late reply would otherwise wipe
  // the list the user has already switched to. Only the newest request writes.
  const reqId = useRef(0);

  const setStatus = useCallback((next) => {
    setStatusRaw(next);
    setPage(1);
  }, []);

  const fetchMessages = useCallback(async () => {
    if (skipFirst.current) { skipFirst.current = false; return; }
    const mine = scope === 'mine' && status === 'active';
    const id = ++reqId.current;
    try {
      setLoading(true);
      setError(null);
      const url = mine
        ? `${config.apiUrl}/api/messages/active`
        : `${config.apiUrl}/api/messages?status=${status}&page=${page}&page_size=${pageSize}`;
      const res = await apiFetch(url);
      if (!res.ok) throw new Error(`Error fetching messages: ${res.statusText}`);
      const data = await res.json();
      if (id !== reqId.current) return;
      setItems(data.items || []);
      setTotal(mine ? (data.count ?? (data.items || []).length) : (data.total || 0));
      setTotalPages(mine ? 0 : (data.total_pages || 0));
    } catch (err) {
      if (id !== reqId.current) return;
      console.error('Error fetching messages:', err);
      setError('Failed to load messages. Please try again.');
    } finally {
      if (id === reqId.current) setLoading(false);
    }
  }, [scope, status, page, pageSize]);

  useEffect(() => { fetchMessages(); }, [fetchMessages]);

  const act = useCallback(async (message, path, body) => {
    try {
      setBusyId(message.id);
      setError(null);
      const res = await apiFetch(`${config.apiUrl}/api/messages/${message.id}/${path}`, {
        method: 'POST',
        headers: body ? { 'Content-Type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      if (!res.ok) {
        const detail = await res.json().catch(() => ({}));
        throw new Error(detail.detail || res.statusText);
      }
      // Drop it locally so the card goes away on the tap, then re-read: the
      // server decides what the list is now (a per-user ack may leave the
      // message active for everyone else, and the admin scope keeps it).
      setItems(prev => prev.filter(m => m.id !== message.id));
      await fetchMessages();
    } catch (err) {
      console.error(`Error on message ${path}:`, err);
      setError(err.message || 'Action failed. Please try again.');
    } finally {
      setBusyId(null);
    }
  }, [fetchMessages]);

  const dismiss = useCallback((message) => act(message, 'dismiss'), [act]);
  const snooze = useCallback((message, minutes) => act(message, 'snooze', { minutes }), [act]);

  return {
    status, setStatus, page, setPage,
    items, total, totalPages, loading, error, setError,
    busyId, refresh: fetchMessages, dismiss, snooze,
  };
}
