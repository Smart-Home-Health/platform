import React, { useEffect, useRef, useState } from 'react';
import config from '../../../config';
import { XIcon, CheckIcon, ClockIcon, RefreshIcon } from '../../../components/Icons';

const PROGRESS_STATUSES = new Set(['queued', 'extracting', 'parsing']);

const STATUS_COLORS = {
  queued:     { color: '#f0b400', bg: 'rgba(240,180,0,0.12)', label: 'Queued' },
  extracting: { color: '#3b82f6', bg: 'rgba(59,130,246,0.12)', label: 'Extracting' },
  parsing:    { color: '#3b82f6', bg: 'rgba(59,130,246,0.12)', label: 'Parsing' },
  completed:  { color: '#3fb950', bg: 'rgba(63,185,80,0.12)', label: 'Completed' },
  failed:     { color: '#dc3545', bg: 'rgba(220,53,69,0.12)', label: 'Failed' },
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
 * integration. Used by AdminV2Integrations when the user clicks "Logs" on a
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

  if (!open) return null;

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0,
        backgroundColor: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(6px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 1060,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: '#1a2332',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 12, padding: 24,
          maxWidth: 760, width: '92%', maxHeight: '88vh',
          overflow: 'auto',
          boxShadow: '0 20px 40px rgba(0,0,0,0.3)',
          color: '#e6edf3',
        }}
      >
        {/* Header */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          marginBottom: 16, paddingBottom: 12,
          borderBottom: '1px solid rgba(255,255,255,0.08)',
        }}>
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>
            {integrationName} — Log Imports
          </h3>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#a0aec0', padding: 0 }}
            aria-label="Close"
          >
            <XIcon size={20} />
          </button>
        </div>

        {error && (
          <div role="alert" style={{
            padding: '10px 12px', borderRadius: 6, marginBottom: 14,
            background: 'rgba(220,53,69,0.15)',
            border: '1px solid rgba(220,53,69,0.5)',
            color: '#f8d7da', fontSize: 13,
          }}>{error}</div>
        )}

        {/* Upload form */}
        <div style={{
          display: 'flex', gap: 8, alignItems: 'center',
          padding: 14, marginBottom: 16,
          background: 'rgba(255,255,255,0.04)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 8,
          flexWrap: 'wrap',
        }}>
          <input
            ref={fileInputRef}
            type="file"
            accept=".tar,.tar.gz,.tgz"
            onChange={e => setSelectedFile(e.target.files?.[0] || null)}
            disabled={uploading}
            style={{
              flex: 1, minWidth: 200,
              color: '#e6edf3', fontSize: 13,
            }}
          />
          <button
            onClick={handleUpload}
            disabled={uploading || !selectedFile}
            style={{
              padding: '8px 16px', borderRadius: 6, border: 'none',
              background: '#3fb950', color: '#0d1117',
              cursor: (uploading || !selectedFile) ? 'not-allowed' : 'pointer',
              fontSize: 14, fontWeight: 600,
              opacity: (uploading || !selectedFile) ? 0.6 : 1,
            }}
          >
            {uploading ? 'Uploading…' : 'Upload'}
          </button>
          <button
            onClick={fetchImports}
            disabled={loading}
            title="Refresh"
            style={{
              padding: '8px 12px', borderRadius: 6,
              border: '1px solid rgba(255,255,255,0.15)',
              background: 'transparent', color: '#e6edf3',
              cursor: loading ? 'not-allowed' : 'pointer',
              fontSize: 13,
            }}
          >
            <RefreshIcon size={14} className={loading ? 'spinning' : ''} />
          </button>
          <button
            onClick={openCalibrationModal}
            title="Calibrate the vent's clock vs. real time"
            style={{
              padding: '8px 12px', borderRadius: 6,
              border: '1px solid rgba(167,113,247,0.5)',
              background: 'rgba(167,113,247,0.12)', color: '#d2a8ff',
              cursor: 'pointer', fontSize: 13, fontWeight: 600,
              display: 'inline-flex', alignItems: 'center', gap: 6,
            }}
          >
            <ClockIcon size={14} /> Calibrate Clock
          </button>
        </div>

        {/* Imports list */}
        {imports.length === 0 ? (
          <div style={{
            textAlign: 'center', padding: 30,
            background: 'rgba(255,255,255,0.04)',
            border: '1px dashed rgba(255,255,255,0.15)',
            borderRadius: 8, color: '#a0aec0',
          }}>
            No imports yet. Upload a tar/tar.gz export above.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {imports.map(row => {
              const st = STATUS_COLORS[row.status] || STATUS_COLORS.queued;
              const inProgress = PROGRESS_STATUSES.has(row.status);
              const counts = row.summary?.classifications || {};
              const fileCount = row.summary?.file_count;
              return (
                <div key={row.id} style={{
                  background: '#0d1117',
                  border: '1px solid rgba(255,255,255,0.08)',
                  borderLeft: `5px solid ${st.color}`,
                  borderRadius: 10, padding: '12px 14px',
                  display: 'flex', flexDirection: 'column', gap: 8,
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                    <span style={{
                      display: 'inline-flex', alignItems: 'center', gap: 6,
                      padding: '3px 10px', borderRadius: 12,
                      background: st.bg, color: st.color,
                      border: `1px solid ${st.color}40`,
                      fontSize: 12, fontWeight: 700,
                    }}>
                      {inProgress ? <ClockIcon size={12} /> : (row.status === 'completed' ? <CheckIcon size={12} /> : null)}
                      {st.label}
                    </span>
                    <span style={{ color: '#a0aec0', fontSize: 12 }}>
                      {fmtDate(row.uploaded_at)}
                    </span>
                  </div>

                  <div style={{ color: '#e6edf3', fontSize: 14, fontWeight: 600, wordBreak: 'break-all' }}>
                    {row.file_name}
                    <span style={{ color: '#a0aec0', fontWeight: 400, marginLeft: 8, fontSize: 12 }}>
                      {fmtBytes(row.file_size_bytes)}
                    </span>
                  </div>

                  {row.status === 'completed' && (
                    <div style={{ color: '#cbd5e0', fontSize: 13, display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                      {row.summary?.sample_count != null && (
                        <span style={{
                          display: 'inline-block', padding: '2px 8px', borderRadius: 10,
                          background: 'rgba(63,185,80,0.15)', color: '#9ae6b4',
                          border: '1px solid rgba(63,185,80,0.4)',
                          fontSize: 11, fontWeight: 700,
                        }}>{(row.summary.sample_count).toLocaleString()} samples</span>
                      )}
                      {row.summary?.dictionary_count != null && (
                        <span style={{
                          display: 'inline-block', padding: '2px 8px', borderRadius: 10,
                          background: 'rgba(96,165,250,0.15)', color: '#93c5fd',
                          border: '1px solid rgba(96,165,250,0.4)',
                          fontSize: 11, fontWeight: 700,
                        }}>{row.summary.dictionary_count} params</span>
                      )}
                      {row.summary?.batch_files_parsed != null && (
                        <span style={{ color: '#a0aec0', fontSize: 12 }}>
                          {row.summary.batch_files_parsed}/{fileCount} files
                        </span>
                      )}
                      {row.summary?.calibration?.status === 'anchored' && (
                        <span style={{
                          display: 'inline-block', padding: '2px 8px', borderRadius: 10,
                          background: 'rgba(167,113,247,0.15)', color: '#d2a8ff',
                          border: '1px solid rgba(167,113,247,0.4)',
                          fontSize: 11, fontWeight: 700,
                        }}>clock anchored ({Math.round(row.summary.calibration.offset_seconds)}s)</span>
                      )}
                    </div>
                  )}
                  {row.status === 'completed' && row.summary?.earliest_sample_raw && (
                    <div style={{ color: '#8b949e', fontSize: 12 }}>
                      {fmtDate(row.summary.earliest_sample_raw)} → {fmtDate(row.summary.latest_sample_raw)} (vent time)
                    </div>
                  )}

                  {row.status === 'failed' && row.error && (
                    <div style={{ color: '#feb2b2', fontSize: 13 }}>
                      {row.error}
                    </div>
                  )}

                  <div style={{
                    display: 'flex', justifyContent: 'flex-end', gap: 8,
                    borderTop: '1px solid rgba(255,255,255,0.06)',
                    paddingTop: 8, marginTop: 2,
                  }}>
                    <button
                      onClick={() => handleDelete(row.id)}
                      style={{
                        padding: '6px 12px', borderRadius: 6,
                        border: '1px solid rgba(220,53,69,0.5)',
                        background: 'transparent', color: '#feb2b2',
                        cursor: 'pointer', fontSize: 12, fontWeight: 500,
                      }}
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

      {/* Calibration sub-modal */}
      {calModalOpen && (
        <div
          onClick={closeCalibrationModal}
          style={{
            position: 'fixed', inset: 0,
            backgroundColor: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(6px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 1070,
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: '#1a2332',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 12, padding: 24,
              maxWidth: 480, width: '92%', maxHeight: '88vh',
              overflow: 'auto',
              boxShadow: '0 20px 40px rgba(0,0,0,0.3)',
              color: '#e6edf3',
            }}
          >
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              marginBottom: 16, paddingBottom: 12,
              borderBottom: '1px solid rgba(255,255,255,0.08)',
            }}>
              <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>
                Calibrate Vent Clock
              </h3>
              <button
                onClick={closeCalibrationModal}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#a0aec0', padding: 0 }}
                aria-label="Close"
              ><XIcon size={20} /></button>
            </div>

            {calibration.loading && (
              <div style={{ color: '#a0aec0', textAlign: 'center', padding: 20 }}>Loading…</div>
            )}
            {calibration.error && (
              <div role="alert" style={{
                padding: '10px 12px', borderRadius: 6, marginBottom: 14,
                background: 'rgba(220,53,69,0.15)',
                border: '1px solid rgba(220,53,69,0.5)',
                color: '#f8d7da', fontSize: 13,
              }}>{calibration.error}</div>
            )}

            {!calibration.loading && calibration.settings && (() => {
              const s = calibration.settings || {};
              const off = s.clock_offset_seconds;
              const pending = s.clock_calibration_pending_at;
              return (
                <>
                  {/* Status banner */}
                  <div style={{
                    padding: '10px 12px', borderRadius: 8, marginBottom: 16,
                    background: off != null
                      ? 'rgba(63,185,80,0.10)'
                      : pending ? 'rgba(240,180,0,0.10)' : 'rgba(255,255,255,0.04)',
                    border: `1px solid ${off != null
                      ? 'rgba(63,185,80,0.40)'
                      : pending ? 'rgba(240,180,0,0.40)' : 'rgba(255,255,255,0.12)'}`,
                    fontSize: 13, color: '#cbd5e0',
                  }}>
                    {off != null ? (
                      <>
                        <div style={{ color: '#9ae6b4', fontWeight: 700, marginBottom: 4 }}>
                          Offset: {fmtOffset(off)} ({Math.round(off)}s)
                        </div>
                        <div style={{ fontSize: 12 }}>
                          Anchored at {fmtDate(s.clock_calibrated_at)} against vent time {fmtDate(s.clock_calibration_anchor)}.
                        </div>
                      </>
                    ) : pending ? (
                      <>
                        <div style={{ color: '#f0b400', fontWeight: 700, marginBottom: 4 }}>
                          Calibration pending
                        </div>
                        <div style={{ fontSize: 12 }}>
                          Waiting for next upload to anchor against the manual-mark event you pressed at {fmtDate(pending)}.
                        </div>
                      </>
                    ) : (
                      <span>Not calibrated. Vent sample timestamps reflect the vent's clock as-is.</span>
                    )}
                  </div>

                  {/* Tap-in-unison */}
                  <div style={{ marginBottom: 14 }}>
                    <div style={{ color: '#e6edf3', fontWeight: 600, fontSize: 14, marginBottom: 4 }}>
                      Tap-in-unison
                    </div>
                    <div style={{ color: '#a0aec0', fontSize: 12, marginBottom: 10 }}>
                      Press the manual-mark button on your VOCSN <em>at the same time</em> as tapping below.
                      The next upload will anchor the offset to that event automatically.
                    </div>
                    <button
                      type="button"
                      onPointerDown={submitTapUnison}
                      style={{
                        width: '100%', padding: '20px 14px', borderRadius: 10, border: 'none',
                        background: tapFlash ? '#3fb950' : '#6f42c1',
                        color: '#fff',
                        fontSize: 16, fontWeight: 700,
                        cursor: 'pointer',
                        transition: 'background-color 0.2s',
                      }}
                    >
                      {tapFlash ? '✓ Tap recorded' : 'Tap Now'}
                    </button>
                  </div>

                  {/* Manual entry */}
                  <div style={{ marginTop: 12 }}>
                    <button
                      type="button"
                      onClick={() => setShowManual(v => !v)}
                      style={{
                        background: 'none', border: 'none', cursor: 'pointer',
                        color: '#93c5fd', fontSize: 13, fontWeight: 500,
                        padding: 0,
                      }}
                    >
                      {showManual ? '▾' : '▸'} Or enter the vent's current time manually
                    </button>
                    {showManual && (
                      <div style={{
                        marginTop: 10, padding: 12,
                        background: 'rgba(255,255,255,0.04)',
                        border: '1px solid rgba(255,255,255,0.08)',
                        borderRadius: 8,
                      }}>
                        <div style={{ marginBottom: 10 }}>
                          <label style={{ display: 'block', fontSize: 12, color: '#a0aec0', marginBottom: 4 }}>
                            Your phone time now
                          </label>
                          <input
                            type="datetime-local"
                            value={manualForm.real_time}
                            onChange={e => setManualForm(f => ({ ...f, real_time: e.target.value }))}
                            style={{
                              width: '100%', padding: 8, fontSize: 13,
                              background: '#2d3748', color: '#fff',
                              border: '1px solid rgba(255,255,255,0.15)', borderRadius: 6,
                              boxSizing: 'border-box',
                            }}
                          />
                        </div>
                        <div style={{ marginBottom: 12 }}>
                          <label style={{ display: 'block', fontSize: 12, color: '#a0aec0', marginBottom: 4 }}>
                            Vent's currently-displayed time
                          </label>
                          <input
                            type="datetime-local"
                            value={manualForm.vent_time}
                            onChange={e => setManualForm(f => ({ ...f, vent_time: e.target.value }))}
                            style={{
                              width: '100%', padding: 8, fontSize: 13,
                              background: '#2d3748', color: '#fff',
                              border: '1px solid rgba(255,255,255,0.15)', borderRadius: 6,
                              boxSizing: 'border-box',
                            }}
                          />
                        </div>
                        <button
                          onClick={submitManualCalibration}
                          style={{
                            width: '100%', padding: '10px 14px', borderRadius: 6, border: 'none',
                            background: '#3fb950', color: '#0d1117',
                            cursor: 'pointer', fontSize: 14, fontWeight: 600,
                          }}
                        >Save Offset</button>
                      </div>
                    )}
                  </div>

                  {(off != null || pending) && (
                    <div style={{
                      marginTop: 16, paddingTop: 12,
                      borderTop: '1px solid rgba(255,255,255,0.08)',
                      textAlign: 'right',
                    }}>
                      <button
                        onClick={clearCalibration}
                        style={{
                          padding: '6px 12px', borderRadius: 6,
                          border: '1px solid rgba(220,53,69,0.5)',
                          background: 'transparent', color: '#feb2b2',
                          cursor: 'pointer', fontSize: 12, fontWeight: 500,
                        }}
                      >Clear calibration</button>
                    </div>
                  )}
                </>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
};

export default VentImportPanel;
