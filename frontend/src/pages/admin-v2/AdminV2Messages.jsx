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
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import AdminV2Layout from './AdminV2Layout';
import config, { apiFetch } from '../../config';
import { PlusIcon } from '../../components/Icons';
import MessagesBoard from '../../components/messages/MessagesBoard';
import ComposeMessageSheet from '../../components/messages/ComposeMessageSheet';
import ConfirmSheet from '../../components/messages/ConfirmSheet';
import useMessages from '../../components/messages/useMessages';
import './AdminV2.css';

const AdminV2Messages = () => {
  const navigate = useNavigate();
  // 'all': the admin registry shows every open message, including ones this
  // user has snoozed — unlike the dashboard panel, which asks what *I* owe.
  const {
    status, setStatus, page, setPage, items, total, totalPages,
    loading, error, setError, busyId, refresh, dismiss, snooze,
  } = useMessages({ scope: 'all' });

  const [showCompose, setShowCompose] = useState(false);
  const [formError, setFormError] = useState(null);
  const [saving, setSaving] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const handleCreate = async (formData) => {
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
      setShowCompose(false);
      setStatus('active');
      refresh();
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
      refresh();
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
        {/* The list, the tabs and the source filter are the same component the
            dashboard panel renders — one styling for messages wherever they
            are read. The page keeps what only an admin does: creating a
            broadcast, deleting one, and paging back through the archive. */}
        <MessagesBoard
          items={items}
          loading={loading}
          error={error}
          status={status}
          onStatusChange={setStatus}
          statusCount={total}
          busyId={busyId}
          onDismiss={status === 'active' ? dismiss : undefined}
          onSnooze={status === 'active' ? snooze : undefined}
          onDelete={setDeleteTarget}
          onReview={(message, link) => navigate(link.to)}
          headerActions={
            <button
              type="button"
              className="mx-btn primary"
              onClick={() => { setFormError(null); setShowCompose(true); }}
            >
              <PlusIcon size={14} />
              New message
            </button>
          }
          footer={totalPages > 1 ? (
            <div className="mx-foot">
              <button type="button" className="mx-btn ghost sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                Previous
              </button>
              <span className="mx-foot-label">
                Page {page} of {totalPages} · {total} total
              </span>
              <button type="button" className="mx-btn ghost sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
                Next
              </button>
            </div>
          ) : null}
        />

        {/* Compose and confirm both ride the app's bottom sheet, the same one
            the capture surface uses — a form to fill in on a phone. */}
        <ComposeMessageSheet
          open={showCompose}
          onClose={() => { setShowCompose(false); setFormError(null); }}
          onSubmit={handleCreate}
          saving={saving}
          error={formError}
        />

        <ConfirmSheet
          open={!!deleteTarget}
          title="Delete message"
          confirmLabel="Delete permanently"
          busy={deleting}
          onClose={() => setDeleteTarget(null)}
          onConfirm={handleDelete}
        >
          <p>
            Permanently delete <strong>“{deleteTarget?.title}”</strong>? Nobody will see it
            again, and any acknowledgement history goes with it.
          </p>
        </ConfirmSheet>

      </div>
    </AdminV2Layout>
  );
};

export default AdminV2Messages;
