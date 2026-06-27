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
import React, { useEffect, useRef, useState } from 'react';
import config from '../../../config';
import { CheckIcon, ClockIcon, RefreshIcon } from '../../../components/Icons';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/field';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';

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

  // Unmount entirely when closed — also tears down the calibration sub-dialog.
  if (!open) return null;

  return (
    <>
      <Dialog open onOpenChange={(o) => { if (!o) onClose?.(); }}>
        <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-[760px]" aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>{integrationName} — Log Imports</DialogTitle>
          </DialogHeader>

          {error && <Alert variant="destructive">{error}</Alert>}

          {/* Upload form */}
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-secondary/50 p-3">
            <Input
              ref={fileInputRef}
              type="file"
              accept=".tar,.tar.gz,.tgz"
              onChange={e => setSelectedFile(e.target.files?.[0] || null)}
              disabled={uploading}
              className="min-w-[200px] flex-1 cursor-pointer"
            />
            <Button
              onClick={handleUpload}
              disabled={uploading || !selectedFile}
            >
              {uploading ? 'Uploading…' : 'Upload'}
            </Button>
            <Button
              variant="secondary"
              size="icon"
              onClick={fetchImports}
              disabled={loading}
              title="Refresh"
            >
              <RefreshIcon size={14} className={loading ? 'spinning' : ''} />
            </Button>
            <Button
              variant="secondary"
              className="border-[#a371f7]/50 bg-[#a371f7]/10 font-semibold text-[#d2a8ff] hover:bg-[#a371f7]/20"
              onClick={openCalibrationModal}
              title="Calibrate the vent's clock vs. real time"
            >
              <ClockIcon size={14} /> Calibrate Clock
            </Button>
          </div>

          {/* Imports list */}
          {imports.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border p-8 text-center text-muted-foreground">
              No imports yet. Upload a tar/tar.gz export above.
            </div>
          ) : (
            <div className="flex flex-col gap-2.5">
              {imports.map(row => {
                const st = STATUS_COLORS[row.status] || STATUS_COLORS.queued;
                const inProgress = PROGRESS_STATUSES.has(row.status);
                const fileCount = row.summary?.file_count;
                return (
                  <div key={row.id} style={{
                    background: 'var(--background)',
                    border: '1px solid color-mix(in srgb, var(--foreground) 8%, transparent)',
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
                      <span style={{ color: 'var(--muted-foreground)', fontSize: 12 }}>
                        {fmtDate(row.uploaded_at)}
                      </span>
                    </div>

                    <div style={{ color: 'var(--foreground)', fontSize: 14, fontWeight: 600, wordBreak: 'break-all' }}>
                      {row.file_name}
                      <span style={{ color: 'var(--muted-foreground)', fontWeight: 400, marginLeft: 8, fontSize: 12 }}>
                        {fmtBytes(row.file_size_bytes)}
                      </span>
                    </div>

                    {row.status === 'completed' && (
                      <div style={{ color: 'var(--foreground)', fontSize: 13, display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
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
                          <span style={{ color: 'var(--muted-foreground)', fontSize: 12 }}>
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
                          <span style={{
                            display: 'inline-block', padding: '2px 8px', borderRadius: 10,
                            background: 'rgba(167,113,247,0.15)', color: '#d2a8ff',
                            border: '1px solid rgba(167,113,247,0.4)',
                            fontSize: 11, fontWeight: 700,
                          }}>clock anchored ({Math.round(row.summary.calibration.offset_seconds)}s)</span>
                        )}
                        {row.summary?.calibration && row.summary.calibration.status !== 'anchored' && (
                          <span style={{
                            display: 'inline-block', padding: '2px 8px', borderRadius: 10,
                            background: 'rgba(240,180,0,0.12)', color: '#f0b400',
                            border: '1px solid rgba(240,180,0,0.4)',
                            fontSize: 11, fontWeight: 700,
                          }}>
                            {row.summary.calibration.status === 'archive_predates_mark'
                              ? 'clock not anchored — file exported before mark event'
                              : 'clock not anchored — no mark event in file'}
                          </span>
                        )}
                      </div>
                    )}
                    {row.status === 'completed' && row.summary?.earliest_sample_raw && (
                      <div style={{ color: 'var(--muted-foreground)', fontSize: 12 }}>
                        {fmtDate(row.summary.earliest_sample_raw)} → {fmtDate(row.summary.latest_sample_raw)} (vent time)
                      </div>
                    )}

                    {row.status === 'failed' && row.error && (
                      <div style={{ color: '#feb2b2', fontSize: 13 }}>
                        {row.error}
                      </div>
                    )}

                    <div className="mt-0.5 flex justify-end gap-2 border-t border-border pt-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 border border-destructive/50 px-3 text-xs text-[#feb2b2] hover:bg-destructive/10"
                        onClick={() => handleDelete(row.id)}
                      >
                        Delete
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Calibration sub-modal */}
      <Dialog open={calModalOpen} onOpenChange={(o) => { if (!o) closeCalibrationModal(); }}>
        <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-[480px]" aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>Calibrate Vent Clock</DialogTitle>
          </DialogHeader>

          {calibration.loading && (
            <p className="py-4 text-center text-muted-foreground">Loading…</p>
          )}
          {calibration.error && <Alert variant="destructive">{calibration.error}</Alert>}

          {!calibration.loading && calibration.settings && (() => {
            const s = calibration.settings || {};
            const off = s.clock_offset_seconds;
            const pending = s.clock_calibration_pending_at;
            return (
              <>
                {/* Status banner */}
                {off != null ? (
                  <Alert variant="success">
                    <AlertTitle>Offset: {fmtOffset(off)} ({Math.round(off)}s)</AlertTitle>
                    <AlertDescription>
                      Anchored at {fmtDate(s.clock_calibrated_at)} against vent time {fmtDate(s.clock_calibration_anchor)}.
                    </AlertDescription>
                  </Alert>
                ) : pending ? (() => {
                  // If an upload already tried (and failed) to anchor this
                  // pending calibration, say why instead of just "waiting".
                  const lastCal = imports.find(i =>
                    i.status === 'completed' && i.summary?.calibration &&
                    i.summary.calibration.status !== 'anchored'
                  )?.summary?.calibration;
                  return (
                    <Alert variant="warning">
                      <AlertTitle className="text-[#f0b400]">Calibration pending</AlertTitle>
                      <AlertDescription>
                        Waiting for an upload containing the manual-mark event you paired with the tap
                        at {fmtDate(pending)}.
                        {lastCal?.status === 'archive_predates_mark' && (
                          <> The last upload's data ends at vent
                          time {fmtDate(lastCal.archive_end_vent_time)} — it was exported <em>before</em> you
                          marked the event. Export a fresh file from the vent and upload it.</>
                        )}
                        {lastCal?.status === 'no_mark_events_in_archive' && (
                          <> The last upload contained no mark events at all — make sure to press the
                          manual-mark (event) button on the vent, then export and upload again.</>
                        )}
                      </AlertDescription>
                    </Alert>
                  );
                })() : (
                  <Alert>
                    Not calibrated. Vent sample timestamps reflect the vent's clock as-is.
                  </Alert>
                )}

                {/* Tap-in-unison */}
                <div>
                  <div className="mb-1 text-sm font-semibold">Tap-in-unison</div>
                  <p className="mb-2.5 text-xs text-muted-foreground">
                    Press the manual-mark button on your VOCSN <em>at the same time</em> as tapping below.
                    The next upload will anchor the offset to that event automatically.
                  </p>
                  <Button
                    type="button"
                    onPointerDown={submitTapUnison}
                    className={`h-auto w-full py-5 text-base font-bold text-white transition-colors ${
                      tapFlash
                        ? 'bg-[#3fb950] hover:bg-[#3fb950]'
                        : 'bg-[#6f42c1] hover:bg-[#6f42c1]/90'
                    }`}
                  >
                    {tapFlash ? '✓ Tap recorded' : 'Tap Now'}
                  </Button>
                </div>

                {/* Manual entry */}
                <div>
                  <Button
                    type="button"
                    variant="link"
                    className="h-auto p-0 text-[13px] font-medium text-[#93c5fd]"
                    onClick={() => setShowManual(v => !v)}
                  >
                    {showManual ? '▾' : '▸'} Or enter the vent's current time manually
                  </Button>
                  {showManual && (
                    <div className="mt-2.5 flex flex-col gap-3 rounded-lg border border-border bg-secondary/50 p-3">
                      <Field label="Your phone time now">
                        <Input
                          type="datetime-local"
                          value={manualForm.real_time}
                          onChange={e => setManualForm(f => ({ ...f, real_time: e.target.value }))}
                        />
                      </Field>
                      <Field label="Vent's currently-displayed time">
                        <Input
                          type="datetime-local"
                          value={manualForm.vent_time}
                          onChange={e => setManualForm(f => ({ ...f, vent_time: e.target.value }))}
                        />
                      </Field>
                      <Button onClick={submitManualCalibration} className="w-full">
                        Save Offset
                      </Button>
                    </div>
                  )}
                </div>

                {(off != null || pending) && (
                  <div className="flex justify-end border-t border-border pt-3">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="border border-destructive/50 text-[#feb2b2] hover:bg-destructive/10"
                      onClick={clearCalibration}
                    >
                      Clear calibration
                    </Button>
                  </div>
                )}
              </>
            );
          })()}
        </DialogContent>
      </Dialog>
    </>
  );
};

export default VentImportPanel;
