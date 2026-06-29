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
import React, { useState, useEffect, useCallback } from 'react';
import AdminV2Layout from './AdminV2Layout';
import config, { apiFetch } from '../../config';
import { PlusIcon, TrashIcon } from '../../components/Icons';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Alert } from '@/components/ui/alert';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Field, FormRow } from '@/components/ui/field';
import './AdminV2.css';

const SEVERITY_COLORS = {
  critical: '#e53e3e',
  warning: '#dd6b20',
  info: '#4299e1',
};

const STATUS_TABS = [
  { value: 'active', label: 'Active' },
  { value: 'dismissed', label: 'Dismissed' },
  { value: 'resolved', label: 'Resolved' },
];

const EMPTY_FORM = {
  title: '',
  body: '',
  severity: 'info',
  ack_scope: 'anyone',
  dismissible: true,
  snoozable: true,
};

const AdminV2Messages = () => {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const [statusFilter, setStatusFilter] = useState('active');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [total, setTotal] = useState(0);

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [formData, setFormData] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState(null);
  const [saving, setSaving] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const fetchMessages = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const url = `${config.apiUrl}/api/messages?status=${statusFilter}&page=${page}&page_size=20`;
      const response = await apiFetch(url);
      if (!response.ok) throw new Error('Failed to load messages');
      const data = await response.json();
      setMessages(data.items || []);
      setTotalPages(data.total_pages || 0);
      setTotal(data.total || 0);
    } catch (err) {
      console.error('Error fetching messages:', err);
      setError('Failed to load messages');
    } finally {
      setLoading(false);
    }
  }, [statusFilter, page]);

  useEffect(() => {
    fetchMessages();
  }, [fetchMessages]);

  const handleCreate = async (e) => {
    e.preventDefault();
    setFormError(null);
    setSaving(true);
    try {
      const response = await apiFetch(`${config.apiUrl}/api/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(
          Array.isArray(data.detail)
            ? data.detail.map(err => err.msg).join(', ')
            : data.detail || 'Failed to create message'
        );
      }
      setShowCreateModal(false);
      setFormData(EMPTY_FORM);
      setStatusFilter('active');
      setPage(1);
      fetchMessages();
    } catch (err) {
      setFormError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      setDeleting(true);
      const response = await apiFetch(`${config.apiUrl}/api/messages/${deleteTarget.id}`, {
        method: 'DELETE',
      });
      if (!response.ok) throw new Error('Failed to delete message');
      setDeleteTarget(null);
      fetchMessages();
    } catch (err) {
      console.error('Error deleting message:', err);
      setError('Failed to delete message');
      setDeleteTarget(null);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <AdminV2Layout>
      <div className="admin-v2-page">
        {error && (
          <div className="tw mb-4">
            <Alert variant="destructive">{error}</Alert>
          </div>
        )}

        <div className="admin-v2-controls-bar">
          <div className="admin-v2-tabs">
            {STATUS_TABS.map(tab => (
              <button
                key={tab.value}
                className={`admin-v2-tab ${statusFilter === tab.value ? 'active' : ''}`}
                onClick={() => { setStatusFilter(tab.value); setPage(1); }}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <div className="tw">
            <Button onClick={() => { setFormData(EMPTY_FORM); setFormError(null); setShowCreateModal(true); }}>
              <PlusIcon size={16} />
              New Message
            </Button>
          </div>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--muted-foreground)' }}>Loading messages…</div>
        ) : messages.length === 0 ? (
          <div className="admin-v2-empty-state-small" style={{ textAlign: 'center', padding: 40 }}>
            No {statusFilter} messages.
          </div>
        ) : (
          <div className="admin-v2-table-container">
            <table className="admin-v2-table">
              <thead>
                <tr>
                  <th>Severity</th>
                  <th>Title</th>
                  <th>Type</th>
                  <th>Clearing</th>
                  <th>Created</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {messages.map(message => (
                  <tr key={message.id}>
                    <td>
                      <span style={{
                        fontSize: 12, fontWeight: 700, letterSpacing: '0.05em',
                        textTransform: 'uppercase',
                        color: SEVERITY_COLORS[message.severity] || SEVERITY_COLORS.info,
                      }}>
                        {message.severity}
                      </span>
                    </td>
                    <td>
                      <div style={{ fontWeight: 600 }}>{message.title}</div>
                      {message.body && (
                        <div style={{ fontSize: 13, color: 'var(--muted-foreground)', maxWidth: 420, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {message.body}
                        </div>
                      )}
                    </td>
                    <td>{message.type}</td>
                    <td>{message.ack_scope === 'per_user' ? 'Each person' : 'Anyone'}</td>
                    <td>{message.created_at ? new Date(message.created_at).toLocaleString() : '—'}</td>
                    <td className="admin-v2-table-actions">
                      <div className="tw">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setDeleteTarget(message)}
                          aria-label="Delete message"
                        >
                          <TrashIcon size={16} />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {totalPages > 1 && (
          <div className="tw" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 12, marginTop: 16 }}>
            <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
              Previous
            </Button>
            <span style={{ color: 'var(--muted-foreground)', fontSize: 14 }}>
              Page {page} of {totalPages} ({total} total)
            </span>
            <Button variant="secondary" size="sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
              Next
            </Button>
          </div>
        )}

        {/* Create modal */}
        <Dialog open={showCreateModal} onOpenChange={(open) => !open && setShowCreateModal(false)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>New Message</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCreate}>
              <div className="flex flex-col gap-4">
                {formError && <Alert variant="destructive">{formError}</Alert>}

                <Field label="Title" required htmlFor="msg-title">
                  <Input
                    id="msg-title"
                    value={formData.title}
                    onChange={e => setFormData({ ...formData, title: e.target.value })}
                    required
                    maxLength={255}
                    placeholder="e.g., Doctor appointment moved to Friday"
                  />
                </Field>

                <Field label="Details" htmlFor="msg-body">
                  <Textarea
                    id="msg-body"
                    value={formData.body}
                    onChange={e => setFormData({ ...formData, body: e.target.value })}
                    rows={3}
                    placeholder="Optional additional details"
                  />
                </Field>

                <FormRow>
                  <Field label="Severity">
                    <Select
                      value={formData.severity}
                      onValueChange={(v) => setFormData({ ...formData, severity: v })}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="info">Info</SelectItem>
                        <SelectItem value="warning">Warning</SelectItem>
                        <SelectItem value="critical">Critical</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="Who can clear it">
                    <Select
                      value={formData.ack_scope}
                      onValueChange={(v) => setFormData({ ...formData, ack_scope: v })}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="anyone">Anyone clears it for everyone</SelectItem>
                        <SelectItem value="per_user">Each person must acknowledge</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                </FormRow>

                <div className="flex items-center gap-6">
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="msg-dismissible"
                      checked={formData.dismissible}
                      onCheckedChange={(v) => setFormData({ ...formData, dismissible: !!v })}
                    />
                    <Label htmlFor="msg-dismissible" className="cursor-pointer">Can be cleared</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="msg-snoozable"
                      checked={formData.snoozable}
                      onCheckedChange={(v) => setFormData({ ...formData, snoozable: !!v })}
                    />
                    <Label htmlFor="msg-snoozable" className="cursor-pointer">Can be snoozed</Label>
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button type="button" variant="secondary" onClick={() => setShowCreateModal(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={saving || !formData.title.trim()}>
                  {saving ? 'Creating…' : 'Create Message'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        {/* Delete confirmation */}
        <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Delete Message</DialogTitle>
            </DialogHeader>
            <p>
              Permanently delete “{deleteTarget?.title}”? Users will no longer see it,
              and any acknowledgement history is removed.
            </p>
            <DialogFooter>
              <Button variant="secondary" onClick={() => setDeleteTarget(null)}>Cancel</Button>
              <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
                {deleting ? 'Deleting…' : 'Delete'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AdminV2Layout>
  );
};

export default AdminV2Messages;
