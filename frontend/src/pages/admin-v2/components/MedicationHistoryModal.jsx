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
// Dose history for one medication, shown as a modal from the Overview card's
// history arrow. Filters by medication_id (exact), not medication_name (a
// substring match) — see backend/routes/medications.py's docstring on why.
import { useEffect, useState } from 'react';
import config from '../../../config';
import EntityModal from '../../../components/vc/EntityModal';
import '../vc-schedule.css';

const STATUS_INFO = {
  'on-time': { label: 'On Time', className: 'success' },
  early: { label: 'Early', className: 'warning' },
  late: { label: 'Late', className: 'danger' },
  skipped: { label: 'Skipped', className: 'muted' },
};

const formatDateTime = (iso) => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
};

const MedicationHistoryModal = ({ open, onClose, patientId, medication }) => {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!open || !medication || !patientId) return undefined;
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setError(null);
        const res = await fetch(
          `${config.apiUrl}/api/medications/history?patient_id=${patientId}&medication_id=${medication.id}&limit=50`,
          { credentials: 'include' }
        );
        if (cancelled) return;
        if (res.ok) {
          const data = await res.json();
          setHistory(data.history || []);
        } else {
          setError('Failed to load history');
        }
      } catch {
        if (!cancelled) setError('Error connecting to server');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open, medication, patientId]);

  return (
    <EntityModal
      open={open}
      onOpenChange={(o) => { if (!o) onClose(); }}
      title={medication ? `History: ${medication.name}` : 'History'}
      wide
    >
      <div className="em-form">
        {loading ? (
          <div className="ec-empty">Loading history…</div>
        ) : error ? (
          <div className="em-error">{error}</div>
        ) : history.length === 0 ? (
          <div className="ec-empty">No doses recorded yet.</div>
        ) : (
          <div className="sch-hist">
            {history.map((record) => {
              const info = STATUS_INFO[record.status] || { label: record.status, className: 'muted' };
              return (
                <div key={record.id} className="sch-hist-row">
                  <div className="sch-hist-top">
                    <span className="sch-hist-when">{formatDateTime(record.administered_at)}</span>
                    <span className={`sch-hist-badge ${info.className}`}>{info.label}</span>
                  </div>
                  <div className="sch-hist-meta">
                    <div className="sch-hist-item">
                      <span className="sch-hist-label">Dose</span>
                      <span className="sch-hist-val">
                        {record.dose_amount > 0 ? `${record.dose_amount} ${record.dose_unit || 'units'}` : 'Skipped'}
                      </span>
                    </div>
                    <div className="sch-hist-item">
                      <span className="sch-hist-label">Scheduled</span>
                      {record.is_scheduled && record.scheduled_time ? (
                        <span className="sch-hist-val">{formatDateTime(record.scheduled_time)}</span>
                      ) : (
                        <span className="sch-hist-val dim">As Needed</span>
                      )}
                    </div>
                  </div>
                  {record.notes && <div className="sch-hist-note">{record.notes}</div>}
                </div>
              );
            })}
          </div>
        )}

        <div className="em-footer">
          <button type="button" className="em-cancel" onClick={onClose}>Close</button>
        </div>
      </div>
    </EntityModal>
  );
};

export default MedicationHistoryModal;
