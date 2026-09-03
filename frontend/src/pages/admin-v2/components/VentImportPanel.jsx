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
import { useEffect, useRef, useState } from 'react';
import config from '../../../config';
import { CheckIcon, ChevronDownIcon, ChevronRightIcon, ClockIcon, RefreshIcon } from '../../../components/Icons';
import EntityModal, { EmField } from '../../../components/vc/EntityModal';
import { CfgBadge } from '../settings/CfgSection';
import '../vc-schedule.css';
import './vent-import.css';

const PROGRESS_STATUSES = new Set(['queued', 'extracting', 'parsing']);

// Status → cfg-badge tone; the colour rides on the badge, never a stripe.
const STATUS_BADGE = {
  queued:     { tone: 'warn', label: 'Queued' },
  extracting: { tone: 'live', label: 'Extracting' },
  parsing:    { tone: 'live', label: 'Parsing' },
  completed:  { tone: 'ok', label: 'Completed' },
  failed:     { tone: 'alert', label: 'Failed' },
};

const fmtBytes = (n) => {
  if (n == null) return '—';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
};

const fmtDate = (iso) => {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: 'short', day: 'numeric',
      hour: 'numeric', minute: '2-digit', hour12: true,
    });
  } catch {
    return iso;
  }
};

/**
 * Modal-style panel for uploading + tracking imports for a single configured
 * integration. Used by AdminV2Connections when the user clicks "Logs" on a
 * ventilator integration row. Self-contained — owns its own polling loop.
 *
 * Props:
 *   open            — boolean
 *   onClose         — () => void
 *   patientId       — number
 *   integrationId   — number (PatientIntegration.id)
 *   integrationName — string for the header
 */
const VentImportPanel = ({ open, onClose, patientId, integrationId, integrationName }) => {
  const [imports, setImports] = useState([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);
  const [selectedFile, setSelectedFile] = useState(null);
  const fileInputRef = useRef(null);
  const pollRef = useRef(null);

  // Calibration sub-modal
  const [calModalOpen, setCalModalOpen] = useState(false);
  const [calibration, setCalibration] = useState({ loading: false, settings: null, error: null });
  const [tapFlash, setTapFlash] = useState(false);
  const [manualForm, setManualForm] = useState({ vent_time: '', real_time: '' });
  const [showManual, setShowManual] = useState(false);

  // Initial fetch + polling cleanup when open changes.
  useEffect(() => {
    if (!open) return;
    fetchImports();
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, patientId, integrationId]);

  // Auto-poll while anything is in flight.
  useEffect(() => {
    if (!open) return;
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    if (imports.some(i => PROGRESS_STATUSES.has(i.status))) {
      pollRef.current = setInterval(fetchImports, 2000);
    }
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imports, open]);

  const fetchImports = async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `${config.apiUrl}/api/integrations/patient/${patientId}/${integrationId}/imports`,
        { credentials: 'include' }
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || `Failed to load imports (${res.status})`);
      }
      setImports(await res.json());
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) return;
    setUploading(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append('file', selectedFile);
      const res = await fetch(
        `${config.apiUrl}/api/integrations/patient/${patientId}/${integrationId}/import`,
        { method: 'POST', credentials: 'include', body: fd }
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || `Upload failed (${res.status})`);
      }
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      await fetchImports();
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (importId) => {
    if (!window.confirm('Delete this import? The archive + extracted files will be removed.')) return;
    try {
      const res = await fetch(
        `${config.apiUrl}/api/integrations/imports/${importId}`,
        { method: 'DELETE', credentials: 'include' }
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || `Delete failed (${res.status})`);
      }
      await fetchImports();
    } catch (err) {
      setError(err.message);
    }
  };

  // ---- Calibration helpers ----

  const fmtIsoLocal = (d) => {
    // datetime-local input expects YYYY-MM-DDTHH:mm
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  const openCalibrationModal = async () => {
    setCalModalOpen(true);
    setCalibration({ loading: true, settings: null, error: null });
    setShowManual(false);
    const now = new Date();
    setManualForm({ vent_time: fmtIsoLocal(now), real_time: fmtIsoLocal(now) });
    try {
      // Re-fetch the integration list to get the current settings JSON.
      const res = await fetch(
        `${config.apiUrl}/api/integrations/patient/${patientId}?include_disabled=true`,
        { credentials: 'include' }
      );
      if (!res.ok) throw new Error('Failed to load integration settings');
      const list = await res.json();
      const me = list.find(i => i.id === integrationId);
      setCalibration({ loading: false, settings: me?.settings || {}, error: null });
    } catch (err) {
      setCalibration({ loading: false, settings: null, error: err.message });
    }
  };

  const closeCalibrationModal = () => {
    setCalModalOpen(false);
    setCalibration({ loading: false, settings: null, error: null });
    setTapFlash(false);
  };

  const submitTapUnison = async () => {
    const pressed = new Date().toISOString();
    setTapFlash(true);
    setTimeout(() => setTapFlash(false), 600);
    try {
      const res = await fetch(
        `${config.apiUrl}/api/integrations/patient/${patientId}/${integrationId}/clock/calibrate-start`,
        {
          method: 'POST', credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pressed_at: pressed }),
        }
      );
      if (!res.ok) throw new Error('Failed to start calibration');
      const data = await res.json();
      setCalibration(c => ({ ...c, settings: data.settings }));
    } catch (err) {
      setCalibration(c => ({ ...c, error: err.message }));
    }
  };

  const submitManualCalibration = async () => {
    const toIso = (val) => {
      // datetime-local lacks a timezone; treat as local and convert to ISO with offset.
      const d = new Date(val);
      return d.toISOString();
    };
    try {
      const res = await fetch(
        `${config.apiUrl}/api/integrations/patient/${patientId}/${integrationId}/clock/calibrate-manual`,
        {
          method: 'POST', credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            vent_time: toIso(manualForm.vent_time),
            real_time: toIso(manualForm.real_time),
          }),
        }
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || 'Failed to save calibration');
      }
      const data = await res.json();
      setCalibration(c => ({ ...c, settings: data.settings, error: null }));
      setShowManual(false);
    } catch (err) {
      setCalibration(c => ({ ...c, error: err.message }));
    }
  };

  const clearCalibration = async () => {
    if (!window.confirm('Clear the saved offset? Existing sample timestamps will reset to vent time.')) return;
    try {
      const res = await fetch(
        `${config.apiUrl}/api/integrations/patient/${patientId}/${integrationId}/clock`,
        { method: 'DELETE', credentials: 'include' }
      );
      if (!res.ok) throw new Error('Failed to clear calibration');
      const data = await res.json();
      setCalibration(c => ({ ...c, settings: data.settings, error: null }));
    } catch (err) {
      setCalibration(c => ({ ...c, error: err.message }));
    }
  };

  const fmtOffset = (s) => {
    if (s == null) return null;
    const abs = Math.abs(s);
    const h = Math.floor(abs / 3600);
    const m = Math.floor((abs % 3600) / 60);
    const sec = Math.round(abs % 60);
    const parts = [];
    if (h) parts.push(`${h}h`);
    if (m) parts.push(`${m}m`);
    if (sec || (!h && !m)) parts.push(`${sec}s`);
    return `${parts.join(' ')} ${s >= 0 ? 'behind' : 'ahead'}`;
  };

  // Unmount entirely when closed — also tears down the calibration sub-dialog.
  if (!open) return null;

  return (
    <>
      <EntityModal
        open
        onOpenChange={(o) => { if (!o) onClose?.(); }}
        title={`${integrationName} — Log Imports`}
        wide
      >
        <div className="em-form">
          {error && <div className="em-error" role="alert">{error}</div>}

          {/* Upload form */}
          <div className="vent-upload">
            <input
              ref={fileInputRef}
              className="em-input"
              type="file"
              accept=".tar,.tar.gz,.tgz"
              onChange={e => setSelectedFile(e.target.files?.[0] || null)}
              disabled={uploading}
            />
            <button
              type="button"
              className="em-submit"
              onClick={handleUpload}
              disabled={uploading || !selectedFile}
            >
              {uploading ? 'Uploading…' : 'Upload'}
            </button>
            <button
              type="button"
              className="cfg-iconbtn"
              onClick={fetchImports}
              disabled={loading}
              title="Refresh"
              aria-label="Refresh"
            >
              <RefreshIcon size={14} className={loading ? 'spinning' : ''} />
            </button>
            <button
              type="button"
              className="cfg-ghost"
              onClick={openCalibrationModal}
              title="Calibrate the vent's clock vs. real time"
            >
              <ClockIcon size={14} /> Calibrate Clock
            </button>
          </div>

          {/* Imports list */}
          {imports.length === 0 ? (
            <p className="cfg-empty">No imports yet. Upload a tar/tar.gz export above.</p>
          ) : (
            <div className="vent-rows">
              {imports.map(row => {
                const st = STATUS_BADGE[row.status] || STATUS_BADGE.queued;
                const fileCount = row.summary?.file_count;
                return (
                  <div key={row.id} className="cfg-card pad">
                    <div className="vent-row-head">
                      <CfgBadge tone={st.tone}>{st.label}</CfgBadge>
                      <span className="vent-when">{fmtDate(row.uploaded_at)}</span>
                    </div>

                    <div className="vent-file">
                      {row.file_name}
                      <span className="vent-size">{fmtBytes(row.file_size_bytes)}</span>
                    </div>

                    {row.status === 'completed' && (
                      <div className="cfg-crumb-tags">
                        {row.summary?.sample_count != null && (
                          <CfgBadge tone="ok">{(row.summary.sample_count).toLocaleString()} samples</CfgBadge>
                        )}
                        {row.summary?.dictionary_count != null && (
                          <CfgBadge tone="live">{row.summary.dictionary_count} params</CfgBadge>
                        )}
                        {row.summary?.batch_files_parsed != null && (
                          <span className="vent-range">
                            {row.summary.batch_files_parsed}/{fileCount} files
                            {row.summary.batch_files_skipped_existing > 0 && (
                              <> · {row.summary.batch_files_skipped_existing} already imported</>
                            )}
                            {row.summary.batch_files_appended > 0 && (
                              <> · {row.summary.batch_files_appended} appended</>
                            )}
                          </span>
                        )}
                        {row.summary?.calibration?.status === 'anchored' && (
                          <CfgBadge tone="ok">
                            clock anchored ({Math.round(row.summary.calibration.offset_seconds)}s)
                          </CfgBadge>
                        )}
                        {row.summary?.calibration && row.summary.calibration.status !== 'anchored' && (
                          <CfgBadge tone="warn">
                            {row.summary.calibration.status === 'archive_predates_mark'
                              ? 'clock not anchored — file exported before mark event'
                              : 'clock not anchored — no mark event in file'}
                          </CfgBadge>
                        )}
                      </div>
                    )}
                    {row.status === 'completed' && row.summary?.earliest_sample_raw && (
                      <div className="vent-range">
                        {fmtDate(row.summary.earliest_sample_raw)} → {fmtDate(row.summary.latest_sample_raw)} (vent time)
                      </div>
                    )}

                    {row.status === 'failed' && row.error && (
                      <div className="em-error" role="alert">{row.error}</div>
                    )}

                    <div className="vent-row-foot">
                      <button
                        type="button"
                        className="cfg-ghost danger"
                        onClick={() => handleDelete(row.id)}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </EntityModal>

      {/* Calibration sub-modal */}
      <EntityModal
        open={calModalOpen}
        onOpenChange={(o) => { if (!o) closeCalibrationModal(); }}
        title="Calibrate Vent Clock"
      >
        <div className="em-form">
          {calibration.loading && <p className="cfg-empty">Loading…</p>}
          {calibration.error && <div className="em-error" role="alert">{calibration.error}</div>}

          {!calibration.loading && calibration.settings && (() => {
            const s = calibration.settings || {};
            const off = s.clock_offset_seconds;
            const pending = s.clock_calibration_pending_at;
            return (
              <>
                {/* Status banner */}
                {off != null ? (
                  <div className="em-success" role="status">
                    <strong>Offset: {fmtOffset(off)} ({Math.round(off)}s)</strong>{' '}
                    — anchored at {fmtDate(s.clock_calibrated_at)} against vent
                    time {fmtDate(s.clock_calibration_anchor)}.
                  </div>
                ) : pending ? (() => {
                  // If an upload already tried (and failed) to anchor this
                  // pending calibration, say why instead of just "waiting".
                  const lastCal = imports.find(i =>
                    i.status === 'completed' && i.summary?.calibration &&
                    i.summary.calibration.status !== 'anchored'
                  )?.summary?.calibration;
                  return (
                    <div className="sch-warn" role="alert">
                      <p className="sch-warn-title">Calibration pending</p>
                      <p className="sch-warn-body">
                        Waiting for an upload containing the manual-mark event you paired with the tap
                        at {fmtDate(pending)}.
                        {lastCal?.status === 'archive_predates_mark' && (
                          <> The last upload&apos;s data ends at vent
                          time {fmtDate(lastCal.archive_end_vent_time)} — it was exported <em>before</em> you
                          marked the event. Export a fresh file from the vent and upload it.</>
                        )}
                        {lastCal?.status === 'no_mark_events_in_archive' && (
                          <> The last upload contained no mark events at all — make sure to press the
                          manual-mark (event) button on the vent, then export and upload again.</>
                        )}
                      </p>
                    </div>
                  );
                })() : (
                  <p className="cfg-note">
                    Not calibrated. Vent sample timestamps reflect the vent&apos;s clock as-is.
                  </p>
                )}

                {/* Tap-in-unison */}
                <div>
                  <h4 className="vent-section-title">Tap-in-unison</h4>
                  <p className="em-hint">
                    Press the manual-mark button on your VOCSN <em>at the same time</em> as tapping below.
                    The next upload will anchor the offset to that event automatically.
                  </p>
                  <button
                    type="button"
                    className={`em-submit vent-tap${tapFlash ? ' flash' : ''}`}
                    onPointerDown={submitTapUnison}
                  >
                    {tapFlash ? <><CheckIcon size={18} /> Tap recorded</> : 'Tap Now'}
                  </button>
                </div>

                {/* Manual entry */}
                <div>
                  <button
                    type="button"
                    className="vent-manual-toggle"
                    onClick={() => setShowManual(v => !v)}
                  >
                    {showManual ? <ChevronDownIcon size={12} /> : <ChevronRightIcon size={12} />}
                    {' '}Or enter the vent&apos;s current time manually
                  </button>
                  {showManual && (
                    <div className="vent-manual">
                      <EmField label="Your phone time now" htmlFor="vent-cal-real">
                        <input
                          id="vent-cal-real"
                          className="em-input"
                          type="datetime-local"
                          value={manualForm.real_time}
                          onChange={e => setManualForm(f => ({ ...f, real_time: e.target.value }))}
                        />
                      </EmField>
                      <EmField label="Vent's currently-displayed time" htmlFor="vent-cal-vent">
                        <input
                          id="vent-cal-vent"
                          className="em-input"
                          type="datetime-local"
                          value={manualForm.vent_time}
                          onChange={e => setManualForm(f => ({ ...f, vent_time: e.target.value }))}
                        />
                      </EmField>
                      <button type="button" className="em-submit" onClick={submitManualCalibration}>
                        Save Offset
                      </button>
                    </div>
                  )}
                </div>

                {(off != null || pending) && (
                  <div className="vent-row-foot">
                    <button type="button" className="cfg-ghost danger" onClick={clearCalibration}>
                      Clear calibration
                    </button>
                  </div>
                )}
              </>
            );
          })()}
        </div>
      </EntityModal>
    </>
  );
};

export default VentImportPanel;
