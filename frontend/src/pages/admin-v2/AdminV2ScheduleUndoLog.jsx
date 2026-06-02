import React, { useState, useEffect, useCallback } from 'react';
import AdminV2Layout from './AdminV2Layout';
import config from '../../config';
import { useAuth } from '../../contexts/AuthContext';
import { useAdminPatient } from '../../contexts/AdminPatientContext';
import { HistoryIcon, RefreshIcon, UndoIcon } from '../../components/Icons';
import './AdminV2.css';

// Maps the backend item_type to a friendly label.
const TYPE_LABELS = {
  medication: 'Medication',
  nutrition_intake: 'Nutrition (intake)',
  nutrition_output: 'Nutrition (output)',
  care_task: 'Care task',
};

const AdminV2ScheduleUndoLog = () => {
  const { user } = useAuth();
  const { patients } = useAdminPatient();

  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const hasPermission = (permission) => {
    if (!user) return false;
    if (user.is_system_admin) return true;
    return user.permissions?.includes(permission) || false;
  };
  const canView = hasPermission('audit.read');

  const patientName = (id) => {
    const p = patients.find((x) => x.id === id);
    return p ? `${p.first_name} ${p.last_name}` : (id != null ? `Patient #${id}` : '—');
  };

  const formatDateTime = (iso) => {
    if (!iso) return '—';
    const d = new Date(iso);
    if (isNaN(d)) return iso;
    return d.toLocaleString(undefined, {
      month: 'short', day: 'numeric', year: 'numeric',
      hour: 'numeric', minute: '2-digit',
    });
  };

  const fetchEntries = useCallback(async () => {
    if (!canView) return;
    try {
      setLoading(true);
      setError(null);
      const response = await fetch(`${config.apiUrl}/api/schedule/undo-log?limit=200`, {
        credentials: 'include',
      });
      if (response.ok) {
        const data = await response.json();
        setEntries(data.entries || []);
      } else if (response.status === 403) {
        setError('You do not have permission to view the undo log.');
      } else {
        setError('Failed to load undo log');
      }
    } catch (err) {
      console.error('Error fetching undo log:', err);
      setError('Error connecting to server');
    } finally {
      setLoading(false);
    }
  }, [canView]);

  useEffect(() => {
    fetchEntries();
  }, [fetchEntries]);

  return (
    <AdminV2Layout>
      <div className="admin-v2-page">
        <div className="admin-v2-page-header">
          <div>
            <h1 className="schedule-section-title">Undo Log</h1>
            <p className="admin-v2-text-muted">
              Every undone dose, feed, or care task — who reversed it and when. Undone items
              are kept (soft-deleted), not erased.
            </p>
          </div>
          <button
            className="admin-v2-btn admin-v2-btn-secondary"
            onClick={fetchEntries}
            disabled={loading || !canView}
            title="Refresh"
          >
            <RefreshIcon size={16} /> Refresh
          </button>
        </div>

        {!canView ? (
          <div className="admin-v2-empty-container">
            <HistoryIcon size={48} className="admin-v2-empty-icon" />
            <p>You do not have permission to view the undo log (requires audit access).</p>
          </div>
        ) : error ? (
          <div className="admin-v2-empty-container">
            <p>{error}</p>
            <button className="admin-v2-btn admin-v2-btn-secondary" onClick={fetchEntries}>Retry</button>
          </div>
        ) : loading ? (
          <div className="admin-v2-loading">Loading undo log...</div>
        ) : entries.length === 0 ? (
          <div className="admin-v2-empty-container">
            <UndoIcon size={48} className="admin-v2-empty-icon" />
            <p>No undos recorded yet.</p>
          </div>
        ) : (
          <table className="admin-v2-table">
            <thead>
              <tr>
                <th>Undone At</th>
                <th>Type</th>
                <th>Item</th>
                <th>Patient</th>
                <th>Originally Scheduled</th>
                <th>Undone By</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.id}>
                  <td className="history-datetime">{formatDateTime(e.undone_at)}</td>
                  <td>{TYPE_LABELS[e.item_type] || e.item_type}</td>
                  <td>
                    <span className="history-med-name">{e.item_name || '—'}</span>
                    {e.dose_amount != null && (
                      <span className="history-dose"> · {e.dose_amount}</span>
                    )}
                    {e.quantity_restored != null && (
                      <span className="admin-v2-text-muted"> (restored {e.quantity_restored})</span>
                    )}
                  </td>
                  <td>{patientName(e.patient_id)}</td>
                  <td className="history-datetime">
                    {e.scheduled_time ? formatDateTime(e.scheduled_time) : <span className="history-unscheduled">As Needed</span>}
                  </td>
                  <td>{e.undone_by || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </AdminV2Layout>
  );
};

export default AdminV2ScheduleUndoLog;
