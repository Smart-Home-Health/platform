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
import { useState, useEffect, useMemo } from 'react';
import SimpleEventChart from './SimpleEventChart';
import './alerts/alerts-panel.css';
import config from '../config';
import ZoomableVideo from './ZoomableVideo';
import { AlertIcon, CheckIcon, ClockIcon, HeartIcon, CameraIcon } from './Icons';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Alert } from '@/components/ui/alert';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';

const AlertDetailInline = ({ alert, onClose, onAcknowledge, initiateAcknowledge = false }) => {
  const [eventData, setEventData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showOxygenForm, setShowOxygenForm] = useState(initiateAcknowledge);
  const [oxygenUsed, setOxygenUsed] = useState(false);
  const [oxygenValue, setOxygenValue] = useState('');
  const [oxygenUnit, setOxygenUnit] = useState('L/min');
  const [acknowledgingAlert, setAcknowledgingAlert] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const [clipStatus, setClipStatus] = useState(null);
  const [clipError, setClipError] = useState(null);
  const [savingClip, setSavingClip] = useState(false);

  // eslint-disable-next-line react-hooks/exhaustive-deps -- fetchEventData is recreated each render; effect is intentionally keyed on the alert id only
  useEffect(() => { fetchEventData(); }, [alert.id]);

  const clipWindow = useMemo(() => {
    if (!alert.patient_id || !alert.start_time) return null;
    const start = Math.floor(new Date(alert.start_time).getTime() / 1000);
    const endIso = alert.end_time || new Date().toISOString();
    const end = Math.floor(new Date(endIso).getTime() / 1000);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null;
    return { patientId: alert.patient_id, start, end };
  }, [alert.patient_id, alert.start_time, alert.end_time]);

  const fetchClipStatus = async () => {
    if (!clipWindow) return;
    try {
      const { patientId, start, end } = clipWindow;
      const res = await fetch(
        `${config.apiUrl}/api/integrations/frigate/patient/${patientId}/clips/status?start=${start}&end=${end}`,
        { credentials: 'include' }
      );
      if (res.status === 404) { setClipStatus({ noIntegration: true }); return; }
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || `Failed to load clip status (${res.status})`);
      }
      setClipStatus(await res.json());
      setClipError(null);
    } catch (err) {
      setClipError(err.message);
    }
  };

  useEffect(() => {
    setClipStatus(null);
    setClipError(null);
    fetchClipStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clipWindow]);

  const handleSaveClip = async () => {
    if (!clipWindow || savingClip) return;
    setSavingClip(true);
    setClipError(null);
    try {
      const { patientId, start, end } = clipWindow;
      const res = await fetch(
        `${config.apiUrl}/api/integrations/frigate/patient/${patientId}/clips?start=${start}&end=${end}`,
        { method: 'POST', credentials: 'include' }
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || `Save failed (${res.status})`);
      }
      setClipStatus(await res.json());
    } catch (err) {
      setClipError(err.message);
    } finally {
      setSavingClip(false);
    }
  };

  const clipFileUrl = (dl) => {
    if (!clipWindow) return '';
    const { patientId, start, end } = clipWindow;
    return `${config.apiUrl}/api/integrations/frigate/patient/${patientId}/clips/file?start=${start}&end=${end}${dl ? '&dl=1' : ''}`;
  };


  useEffect(() => {
    if (initiateAcknowledge) setShowOxygenForm(true);
  }, [initiateAcknowledge]);

  const fetchEventData = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch(`${config.apiUrl}/api/monitoring/alerts/${alert.id}/data`, { credentials: 'include' });
      if (!response.ok) throw new Error(`Error fetching alert data: ${response.statusText}`);
      setEventData(await response.json());
    } catch {
      setError('Failed to load event data.');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmitAcknowledge = async () => {
    try {
      setAcknowledgingAlert(true);
      setSubmitError(null);
      const payload = {
        oxygen_used: oxygenUsed ? 1 : 0,
        oxygen_highest: oxygenUsed && oxygenValue ? parseFloat(oxygenValue) : null,
        oxygen_unit: oxygenUsed && oxygenValue ? oxygenUnit : null,
      };
      const response = await fetch(`${config.apiUrl}/api/monitoring/alerts/${alert.id}/acknowledge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        credentials: 'include',
      });
      if (!response.ok) throw new Error(await response.text() || `Failed (${response.status})`);
      onAcknowledge(alert.id);
      onClose();
    } catch (err) {
      setSubmitError(err.message);
    } finally {
      setAcknowledgingAlert(false);
    }
  };

  const formatDateTime = (isoString) => {
    if (!isoString) return 'N/A';
    return new Date(isoString).toLocaleString(undefined, {
      month: 'short', day: 'numeric', year: 'numeric',
      hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true,
    });
  };

  const adjustedEnd = (end) => {
    if (!end) return null;
    return new Date(new Date(end).getTime() - 30000);
  };

  const spo2ChartData = useMemo(() => {
    if (!eventData || eventData.length === 0) return [];
    return eventData.map(p => ({ x: new Date(p.timestamp).toLocaleTimeString(), y: p.spo2 }));
  }, [eventData]);

  const bpmChartData = useMemo(() => {
    if (!eventData || eventData.length === 0) return [];
    return eventData.map(p => ({ x: new Date(p.timestamp).toLocaleTimeString(), y: p.bpm }));
  }, [eventData]);

  const severity = !alert.end_time ? 'active' : alert.acknowledged ? 'acknowledged' : 'unacknowledged';
  const SEV = {
    active:         { label: 'Active',         icon: <AlertIcon size={14} />, badge: 'bg-destructive/10 text-destructive border-destructive/30', accent: 'var(--destructive)' },
    unacknowledged: { label: 'Unacknowledged', icon: <ClockIcon size={14} />, badge: 'bg-warning/10 text-warning border-warning/30',             accent: 'var(--warning)' },
    acknowledged:   { label: 'Acknowledged',   icon: <CheckIcon size={14} />, badge: 'bg-success/10 text-success border-success/30',             accent: 'var(--success)' },
  }[severity];

  const triggeredAlarms = [];
  if (alert.alarm1_triggered) triggeredAlarms.push('Alarm 1');
  if (alert.alarm2_triggered) triggeredAlarms.push('Alarm 2');
  if (alert.spo2_alarm_triggered) triggeredAlarms.push('SpO₂');
  if (alert.hr_alarm_triggered) triggeredAlarms.push('BPM');

  const infoItem = (label, value) => (
    <div className="al-info">
      <span className="al-info-label">{label}</span>
      <span className="al-info-value">{value}</span>
    </div>
  );

  return (
    <div className="al-detail tw text-foreground">
      {/* No back control here: the host renders one above the detail when it
          replaces the list, and beside the list there is nowhere to go. */}
      <div className="al-detail-head">
        <h3 className="al-detail-title">Episode detail</h3>
      </div>

      {/* Status banner */}
      <div className={`al-status ${severity}`}>
        <span className={`al-badge ${severity}`}>{SEV.label}</span>
        {triggeredAlarms.length > 0 && (
          <span className="al-status-alarms">
            Alarms <strong>{triggeredAlarms.join(', ')}</strong>
          </span>
        )}
      </div>

      {/* Info grid */}
      <div className="al-grid">
        {infoItem('Start Time', formatDateTime(alert.start_time))}
        {infoItem('End Time', alert.end_time ? formatDateTime(adjustedEnd(alert.end_time)) : 'Ongoing')}
      </div>

      {/* Metric cards — the two numbers the episode is about. */}
      <div className="al-grid">
        <div className="al-metric spo2">
          <div className="al-metric-head">
            <span className="al-metric-label">SpO₂ range</span>
            {alert.spo2_alarm_triggered && <span className="al-alarm">Alarm</span>}
          </div>
          <div className="al-metric-value">
            {alert.spo2_min !== null && alert.spo2_max !== null
              ? (alert.spo2_min === alert.spo2_max ? `${alert.spo2_min}%` : `${alert.spo2_min}–${alert.spo2_max}%`)
              : 'N/A'}
          </div>
        </div>

        <div className="al-metric hr">
          <div className="al-metric-head">
            <span className="al-metric-label"><HeartIcon size={13} /> Heart rate range</span>
            {alert.hr_alarm_triggered && <span className="al-alarm">Alarm</span>}
          </div>
          <div className="al-metric-value">
            {alert.bpm_min !== null && alert.bpm_max !== null
              ? (alert.bpm_min === alert.bpm_max ? `${alert.bpm_min} BPM` : `${alert.bpm_min}–${alert.bpm_max} BPM`)
              : 'N/A'}
          </div>
        </div>
      </div>

      {/* Charts */}
      {loading ? (
        <div className="py-8 text-center text-muted-foreground">Loading data…</div>
      ) : error ? (
        <Alert variant="destructive">{error}</Alert>
      ) : !eventData || eventData.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border py-6 text-center text-muted-foreground">
          No data available for this event
        </div>
      ) : (
        <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}>
          <div className="h-64 rounded-xl border border-border bg-card p-3">
            <SimpleEventChart title="Blood Oxygen" color="#4da7bd" unit="SpO₂ (%)" data={spo2ChartData} />
          </div>
          <div className="h-64 rounded-xl border border-border bg-card p-3">
            <SimpleEventChart title="Pulse Rate" color="#3fbf6a" unit="BPM" data={bpmChartData} />
          </div>
        </div>
      )}

      {/* Frigate event footage — hidden when patient has no integration */}
      {clipStatus && !clipStatus.noIntegration && (
        <div className="flex flex-col gap-2 rounded-xl border border-border bg-card p-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="inline-flex items-center gap-2 text-sm font-semibold text-foreground">
              <CameraIcon size={16} />
              Event Footage{clipStatus.camera ? ` — ${clipStatus.camera}` : ''}
              {clipStatus.saved && clipStatus.file_size && (
                <span className="font-normal text-muted-foreground">
                  &middot; {(clipStatus.file_size / (1024 * 1024)).toFixed(1)} MB
                </span>
              )}
            </span>
            {clipStatus.saved && (
              <Button asChild variant="outline" size="sm">
                <a href={clipFileUrl(true)} download>Download to device</a>
              </Button>
            )}
          </div>
          {clipError && <Alert variant="destructive">{clipError}</Alert>}
          {clipStatus.saved ? (
            <ZoomableVideo
              key={clipFileUrl(false)}
              src={clipFileUrl(false)}
              crossOrigin="use-credentials"
              controls
              playsInline
              preload="metadata"
              containerStyle={{ maxHeight: '50vh' }}
            />
          ) : (
            <div className="flex flex-col items-center gap-2.5 rounded-lg border border-dashed border-border bg-muted/40 p-6">
              <span className="text-sm text-muted-foreground">
                No clip saved for this event yet
              </span>
              <Button onClick={handleSaveClip} disabled={savingClip}>
                {savingClip ? 'Saving from Frigate...' : 'Save clip to server'}
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Actions */}
      {!showOxygenForm ? (
        !alert.acknowledged && (
          <div className="flex justify-end gap-2.5 border-t border-border pt-3">
            <Button onClick={() => setShowOxygenForm(true)}>
              <CheckIcon size={14} /> Acknowledge
            </Button>
          </div>
        )
      ) : (
        <div className="rounded-xl border border-border bg-card p-4">
          <h4 className="m-0 mb-3 text-base font-semibold">Acknowledge Alert</h4>
          <p className="m-0 mb-3 text-sm text-muted-foreground">
            Confirm if oxygen was administered during this alert.
          </p>
          <label className="mb-3 flex cursor-pointer select-none items-center gap-2.5 rounded-lg border border-border bg-muted/40 px-3 py-2.5">
            <Checkbox checked={oxygenUsed} onCheckedChange={(v) => setOxygenUsed(!!v)} />
            <span className="text-sm">Oxygen was administered</span>
          </label>
          {oxygenUsed && (
            <div className="mb-3">
              <Label className="mb-1.5 block text-xs font-semibold">
                Highest flow / concentration
              </Label>
              <div className="flex gap-2">
                <Input
                  type="number"
                  value={oxygenValue}
                  onChange={e => { const v = e.target.value; if (v === '' || parseFloat(v) >= 0) setOxygenValue(v); }}
                  step="0.1"
                  min="0"
                  placeholder="Enter value"
                  className="flex-1"
                />
                <Select value={oxygenUnit} onValueChange={setOxygenUnit}>
                  <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="L/min">L/min</SelectItem>
                    <SelectItem value="%">%</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
          {submitError && <div className="mb-3"><Alert variant="destructive">{submitError}</Alert></div>}
          <div className="flex justify-end gap-2.5">
            <Button
              variant="secondary"
              onClick={() => { setShowOxygenForm(false); setSubmitError(null); }}
              disabled={acknowledgingAlert}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSubmitAcknowledge}
              disabled={acknowledgingAlert || (oxygenUsed && !oxygenValue)}
            >
              {acknowledgingAlert ? 'Submitting…' : 'Submit'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

export default AlertDetailInline;
