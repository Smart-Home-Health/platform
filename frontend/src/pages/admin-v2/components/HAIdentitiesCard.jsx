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
// Home Assistant identities seen on ingress, with link/unlink to app users.
// Every HA user who opens the panel appears here automatically; linking one
// makes them sign in with no prompts from then on. System-admin only (the
// backend 403s otherwise, and the card hides itself).
import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert } from '@/components/ui/alert';
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '@/components/ui/select';
import { isIngress } from '../../../config';
import {
  listHaIdentities, linkHaIdentity, unlinkHaIdentity, forgetHaIdentity,
} from '../../../services/haIdentity';

const identityLabel = (item) =>
  item.display_name || item.username || `HA user ${item.ha_user_id.slice(0, 8)}…`;

const lastSeen = (iso) => {
  try { return new Date(iso).toLocaleDateString(); } catch { return ''; }
};

export default function HAIdentitiesCard({ users = [] }) {
  const [items, setItems] = useState(null); // null = loading/forbidden
  const [error, setError] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [pendingLink, setPendingLink] = useState({}); // ha_user_id -> selected app user id

  const load = async () => {
    try {
      setItems(await listHaIdentities());
      setError(null);
    } catch (err) {
      if (err.status === 403 || err.status === 401) {
        // Not a system admin: this card simply isn't for them.
        setItems(null);
      } else {
        // Real failure: keep (or create) the card so the error is visible.
        setError(err.message);
        setItems((prev) => prev ?? []);
      }
    }
  };

  useEffect(() => { load(); }, []);

  if (!items) return null; // loading, or not permitted
  if (items.length === 0 && !isIngress() && !error) return null;

  const unmapped = items.filter((i) => !i.mapped_user).length;

  const act = async (haUserId, fn) => {
    setBusyId(haUserId);
    setError(null);
    try {
      await fn();
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <CardTitle>Home Assistant users</CardTitle>
          {unmapped > 0 && <Badge variant="default">{unmapped} not linked</Badge>}
        </div>
        <p className="text-sm text-muted-foreground">
          Anyone who opens the app from the Home Assistant sidebar shows up here.
          Link them to a profile and they'll be signed in automatically — no
          password, no picker.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {error && <Alert variant="destructive">{error}</Alert>}
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No Home Assistant users have opened the app yet. Have them open it
            from the HA sidebar once and they'll appear here.
          </p>
        ) : (
          items.map((item) => (
            <div
              key={item.ha_user_id}
              className="flex flex-col gap-2 rounded-md border border-border p-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="flex min-w-0 flex-col">
                <span className="truncate font-medium text-foreground">{identityLabel(item)}</span>
                <span className="truncate text-xs text-muted-foreground">
                  {item.username ? `@${item.username} · ` : ''}last seen {lastSeen(item.last_seen)}
                </span>
              </div>
              {item.mapped_user ? (
                <div className="flex items-center gap-2">
                  <Badge variant="secondary">Signs in as {item.mapped_user.full_name}</Badge>
                  <Button
                    variant="secondary" size="sm"
                    disabled={busyId === item.ha_user_id}
                    onClick={() => act(item.ha_user_id, () => unlinkHaIdentity(item.ha_user_id))}
                  >
                    Unlink
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <Select
                    value={pendingLink[item.ha_user_id] || ''}
                    onValueChange={(v) => setPendingLink((prev) => ({ ...prev, [item.ha_user_id]: v }))}
                  >
                    <SelectTrigger className="w-44"><SelectValue placeholder="Choose profile…" /></SelectTrigger>
                    <SelectContent>
                      {users.filter((u) => u.is_active).map((u) => (
                        <SelectItem key={u.id} value={String(u.id)}>{u.full_name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    size="sm"
                    disabled={!pendingLink[item.ha_user_id] || busyId === item.ha_user_id}
                    onClick={() => act(item.ha_user_id, () =>
                      linkHaIdentity(item.ha_user_id, parseInt(pendingLink[item.ha_user_id], 10)))}
                  >
                    Link
                  </Button>
                  <Button
                    variant="ghost" size="sm"
                    disabled={busyId === item.ha_user_id}
                    onClick={() => act(item.ha_user_id, () => forgetHaIdentity(item.ha_user_id))}
                  >
                    Remove
                  </Button>
                </div>
              )}
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
