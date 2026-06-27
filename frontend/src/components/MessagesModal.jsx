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
import { useState, useEffect, useCallback } from 'react';
import config, { apiFetch } from '../config';
import { CheckIcon } from './Icons';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';

const SEVERITY = {
  critical: { color: '#e53e3e', label: 'Critical' },
  warning: { color: '#dd6b20', label: 'Warning' },
  info: { color: '#4299e1', label: 'Info' },
};

const SNOOZE_OPTIONS = [
  { label: '1 hour', minutes: 60 },
  { label: '4 hours', minutes: 240 },
  { label: '1 day', minutes: 1440 },
];

/**
 * Pop-up listing the active attention messages (low medication stock,
 * broadcasts, …) with the dismiss/snooze actions each message allows. Used
 * both for the automatic pop-up after login (MessagesAutoPop) and the
 * Messages menu icon.
 */
const MessagesModal = ({ onClose, initialMessages = null }) => {
  const [messages, setMessages] = useState(initialMessages || []);
  const [loading, setLoading] = useState(!initialMessages);
  const [error, setError] = useState(null);
  const [busyId, setBusyId] = useState(null);

  const fetchMessages = useCallback(async () => {
    try {
      setError(null);
      const res = await apiFetch(`${config.apiUrl}/api/messages/active`);
      if (!res.ok) throw new Error(`Error fetching messages: ${res.statusText}`);
      const data = await res.json();
      setMessages(data.items || []);
    } catch (err) {
      console.error('Error fetching messages:', err);
      setError('Failed to load messages. Please try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // When the opener already fetched the list (login auto-pop), reuse it
    // instead of immediately re-running the generators on the backend.
    if (!initialMessages) fetchMessages();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchMessages]);

  const act = async (messageId, path, body) => {
    try {
      setBusyId(messageId);
      setError(null);
      const res = await apiFetch(`${config.apiUrl}/api/messages/${messageId}/${path}`, {
        method: 'POST',
        headers: body ? { 'Content-Type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      if (!res.ok) {
        const detail = await res.json().catch(() => ({}));
        throw new Error(detail.detail || res.statusText);
      }
      await fetchMessages();
    } catch (err) {
      console.error(`Error on message ${path}:`, err);
      setError(err.message || 'Action failed. Please try again.');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Messages</DialogTitle>
          <DialogDescription className="sr-only">
            Active messages that need your attention
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          {error && <Alert variant="destructive">{error}</Alert>}

          {loading ? (
            <div className="py-10 text-center text-muted-foreground">Loading messages…</div>
          ) : messages.length === 0 ? (
            <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border py-10 text-muted-foreground">
              <CheckIcon size={28} />
              All caught up — nothing needs your attention.
            </div>
          ) : (
            messages.map(message => {
              const sev = SEVERITY[message.severity] || SEVERITY.info;
              const busy = busyId === message.id;
              return (
                <div
                  key={message.id}
                  className="flex flex-col gap-2.5 rounded-lg border border-border border-l-4 bg-card p-4 shadow-sm"
                  style={{ borderLeftColor: sev.color }}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span
                      className="text-xs font-bold uppercase tracking-wider"
                      style={{ color: sev.color }}
                    >
                      {sev.label}
                    </span>
                    {message.created_at && (
                      <span className="text-xs text-muted-foreground">
                        {new Date(message.created_at).toLocaleString()}
                      </span>
                    )}
                  </div>

                  <div className="text-base font-semibold text-foreground">
                    {message.title}
                    {message.data?.patient_name && (
                      <span className="ml-2 text-sm font-normal text-muted-foreground">
                        · {message.data.patient_name}
                      </span>
                    )}
                  </div>
                  {message.body && (
                    <div className="whitespace-pre-wrap text-sm text-muted-foreground">{message.body}</div>
                  )}
                  {message.ack_scope === 'per_user' && (
                    <div className="text-xs italic text-muted-foreground">
                      Each person must acknowledge this message individually.
                    </div>
                  )}

                  <div className="flex flex-wrap items-center gap-2">
                    {message.dismissible && (
                      <Button onClick={() => act(message.id, 'dismiss')} disabled={busy}>
                        <CheckIcon size={14} />
                        {message.ack_scope === 'per_user' ? 'Acknowledge' : 'Dismiss'}
                      </Button>
                    )}
                    {message.snoozable && (
                      <span className="inline-flex items-center gap-1.5">
                        <span className="text-sm text-muted-foreground">Snooze:</span>
                        {SNOOZE_OPTIONS.map(opt => (
                          <Button
                            key={opt.minutes}
                            variant="secondary"
                            size="sm"
                            onClick={() => act(message.id, 'snooze', { minutes: opt.minutes })}
                            disabled={busy}
                          >
                            {opt.label}
                          </Button>
                        ))}
                      </span>
                    )}
                    {!message.dismissible && (
                      <span className="text-xs text-muted-foreground">
                        Clears automatically when the underlying condition is resolved.
                      </span>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default MessagesModal;
