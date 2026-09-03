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
import './vc/entity-card.css';
import config from '../config';
import ZoomableVideo from './ZoomableVideo';
import { EmSelect } from './vc/EntityModal';
import { CheckIcon, HeartIcon, CameraIcon } from './Icons';

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
  // Colour comes from the al-status / al-badge severity classes.
  const SEV = {
    active: { label: 'Active' },
    unacknowledged: { label: 'Unacknowledged' },
    acknowledged: { label: 'Acknowledged' },
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
    <div className="al-detail">
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
        <div className="al-loading">Loading data…</div>
      ) : error ? (
        <div className="al-error" role="alert">{error}</div>
      ) : !eventData || eventData.length === 0 ? (
        <div className="al-nodata">No data available for this event</div>
      ) : (
        <div className="al-charts">
          <div className="al-chart">
            <SimpleEventChart title="Blood Oxygen" color="#4da7bd" unit="SpO₂ (%)" data={spo2ChartData} />
          </div>
          <div className="al-chart">
            <SimpleEventChart title="Pulse Rate" color="#3fbf6a" unit="BPM" data={bpmChartData} />
          </div>
        </div>
      )}

      {/* Frigate event footage — hidden when patient has no integration */}
      {clipStatus && !clipStatus.noIntegration && (
        <div className="al-footage">
          <div className="al-footage-head">
            <span className="al-footage-title">
              <CameraIcon size={16} />
              Event Footage{clipStatus.camera ? ` — ${clipStatus.camera}` : ''}
              {clipStatus.saved && clipStatus.file_size && (
                <span className="al-footage-size">
                  &middot; {(clipStatus.file_size / (1024 * 1024)).toFixed(1)} MB
                </span>
              )}
            </span>
            {clipStatus.saved && (
              <a className="al-btn ghost" href={clipFileUrl(true)} download>Download to device</a>
            )}
          </div>
          {clipError && <div className="al-error" role="alert">{clipError}</div>}
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
            <div className="al-noclip">
              <span>No clip saved for this event yet</span>
              <button type="button" className="al-btn primary" onClick={handleSaveClip} disabled={savingClip}>
                {savingClip ? 'Saving from Frigate...' : 'Save clip to server'}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Actions */}
      {!showOxygenForm ? (
        !alert.acknowledged && (
          <div className="al-detail-actions">
            <button type="button" className="al-btn primary" onClick={() => setShowOxygenForm(true)}>
              <CheckIcon size={14} /> Acknowledge
            </button>
          </div>
        )
      ) : (
        <div className="al-ack">
          <h4>Acknowledge Alert</h4>
          <p className="al-ack-desc">
            Confirm if oxygen was administered during this alert.
          </p>
          <label className="em-check-row">
            <input
              type="checkbox"
              className="em-check"
              checked={oxygenUsed}
              onChange={(e) => setOxygenUsed(e.target.checked)}
            />
            <span className="em-check-label">Oxygen was administered</span>
          </label>
          {oxygenUsed && (
            <div className="em-field">
              <label className="em-label" htmlFor="al-o2-value">
                Highest flow / concentration
              </label>
              <div className="al-ack-o2row">
                <input
                  id="al-o2-value"
                  className="em-input"
                  type="number"
                  value={oxygenValue}
                  onChange={e => { const v = e.target.value; if (v === '' || parseFloat(v) >= 0) setOxygenValue(v); }}
                  step="0.1"
                  min="0"
                  placeholder="Enter value"
                />
                <EmSelect
                  aria-label="Oxygen unit"
                  value={oxygenUnit}
                  onChange={(e) => setOxygenUnit(e.target.value)}
                >
                  <option value="L/min">L/min</option>
                  <option value="%">%</option>
                </EmSelect>
              </div>
            </div>
          )}
          {submitError && <div className="al-error" role="alert">{submitError}</div>}
          <div className="al-detail-actions">
            <button
              type="button"
              className="al-btn ghost"
              onClick={() => { setShowOxygenForm(false); setSubmitError(null); }}
              disabled={acknowledgingAlert}
            >
              Cancel
            </button>
            <button
              type="button"
              className="al-btn primary"
              onClick={handleSubmitAcknowledge}
              disabled={acknowledgingAlert || (oxygenUsed && !oxygenValue)}
            >
              {acknowledgingAlert ? 'Submitting…' : 'Submit'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default AlertDetailInline;
