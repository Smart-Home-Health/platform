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
import { useState, useEffect } from 'react';
import config from '../../config';
import AlertDetailInline from '../AlertDetailInline';
import { CheckIcon, ChevronLeftIcon, SearchIcon } from '../Icons';
import { useModalDock } from '../../contexts/ModalDockContext';
import './alerts-panel.css';

const AlertsList = ({ onAlertAcknowledge, patientId }) => {
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showAcknowledged, setShowAcknowledged] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [showAcknowledgeForm, setShowAcknowledgeForm] = useState(false);
  const [acknowledgeAllLoading, setAcknowledgeAllLoading] = useState(false);
  const { expanded } = useModalDock();

  useEffect(() => {
    fetchAlerts();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fetchAlerts is recreated each render; effect is intentionally keyed on the showAcknowledged filter and patient only
  }, [showAcknowledged, patientId]);

  const fetchAlerts = async () => {
    try {
      setLoading(true);
      setError(null);
      let url = `${config.apiUrl}/api/monitoring/alerts?include_acknowledged=${showAcknowledged}`;
      if (patientId != null) {
        url += `&patient_id=${patientId}`;
      }
      const response = await fetch(url, { credentials: 'include' });
      if (!response.ok) throw new Error(`Error fetching alerts: ${response.statusText}`);
      const data = await response.json();
      setAlerts(data);
    } catch (err) {
      console.error('Error fetching alerts:', err);
      setError('Failed to load alerts. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const acknowledgeAlert = async (alertId) => {
    try {
      // Don't directly acknowledge from here anymore - let AlertDetailModal handle it
      // This will be called by the AlertDetailModal after it collects oxygen data
      console.log(`Alert ${alertId} acknowledged successfully via modal`);
      fetchAlerts(); // Refresh the alerts list
      if (onAlertAcknowledge) {
        onAlertAcknowledge(alertId);
      }
    } catch (err) {
      console.error(`Error acknowledging alert ${alertId}:`, err);
      setError('Failed to acknowledge alert. Please try again.');
    }
  };

  const acknowledgeAllAlerts = async () => {
    setAcknowledgeAllLoading(true);
    try {
      // Get all unacknowledged alerts
      let url = `${config.apiUrl}/api/monitoring/alerts?include_acknowledged=false`;
      if (patientId != null) {
        url += `&patient_id=${patientId}`;
      }
      const response = await fetch(url, { credentials: 'include' });
      if (!response.ok) throw new Error('Failed to fetch alerts');
      const alerts = await response.json();
      await Promise.all(alerts.map(alert =>
        fetch(`${config.apiUrl}/api/monitoring/alerts/${alert.id}/acknowledge`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}), // Always send a JSON body
          credentials: 'include'
        })
      ));
      fetchAlerts(); // Refresh the alerts list
      alert('All open alerts acknowledged!');
    } catch (err) {
      console.error('Error acknowledging all alerts:', err);
      alert('Failed to acknowledge all alerts.');
    } finally {
      setAcknowledgeAllLoading(false);
    }
  };

  const handleViewDetails = (alert) => {
    setSelectedId(alert.id);
    setShowAcknowledgeForm(false);
  };

  const handleAcknowledge = async (alertId) => {
    setSelectedId(alertId);
    setShowAcknowledgeForm(true);
  };

  const formatDateTime = (isoString) => {
    if (!isoString) return 'N/A';
    const d = new Date(isoString);
    return d.toLocaleString(undefined, {
      month: 'short', day: 'numeric',
      hour: 'numeric', minute: '2-digit', second: '2-digit',
      hour12: true,
    });
  };

  const adjustedEnd = (end) => {
    if (!end) return null;
    return new Date(new Date(end).getTime() - 30000);
  };

  const formatDuration = (start, end) => {
    if (!start) return '—';
    const endTime = end ? adjustedEnd(end) : new Date();
    const durationMs = endTime - new Date(start);
    if (durationMs < 0) return 'Ongoing';
    const totalSec = Math.floor(durationMs / 1000);
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    if (h > 0) return `${h}h ${m}m`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
  };

  const getAlertSeverity = (alert) => {
    if (!alert.end_time) return 'active';
    if (!alert.acknowledged) return 'unacknowledged';
    return 'acknowledged';
  };

  // An alert is the clinical concern the palette reserves red for: ongoing is
  // red, waiting on a human is amber, reviewed is green. (The schedule panels
  // deliberately never use red — being late is not an emergency.)
  const SEVERITY = {
    active: 'Active',
    unacknowledged: 'Unreviewed',
    acknowledged: 'Reviewed',
  };

  // What the episode actually was, from the alarms it tripped — the API has no
  // event name of its own.
  const eventTitle = (alert) => {
    const parts = [];
    if (alert.spo2_alarm_triggered) parts.push('Low oxygen');
    if (alert.hr_alarm_triggered) parts.push('High heart rate');
    if (!parts.length) return 'Pulse ox alert';
    return parts.join(' + ');
  };

  const range = (min, max, suffix = '') => {
    if (min === null || min === undefined || max === null || max === undefined) return null;
    return min === max ? `${min}${suffix}` : `${min}–${max}${suffix}`;
  };

  const selectedAlert = alerts.find(a => a.id === selectedId) || null;
  const unreviewed = alerts.filter(a => !a.acknowledged).length;

  const detail = selectedAlert ? (
    <AlertDetailInline
      alert={selectedAlert}
      onClose={() => { setSelectedId(null); setShowAcknowledgeForm(false); }}
      onAcknowledge={acknowledgeAlert}
      initiateAcknowledge={showAcknowledgeForm}
    />
  ) : null;

  // Narrow: the detail takes the panel, because there is no room beside the
  // list. Expanded: it sits alongside, so the list stays in view.
  if (!expanded && selectedAlert) {
    return (
      <div className="al-panel stacked">
        <button
          type="button"
          className="al-back"
          onClick={() => { setSelectedId(null); setShowAcknowledgeForm(false); }}
        >
          <ChevronLeftIcon size={16} />
          Back to alerts
        </button>
        {detail}
      </div>
    );
  }

  const list = (
    <>
      <div className="al-head">
        <span className="al-count">
          {alerts.length} shown{unreviewed > 0 && <> · <strong>{unreviewed} unreviewed</strong></>}
        </span>
        <span className="al-head-actions">
          <label className="al-toggle">
            <input
              type="checkbox"
              checked={showAcknowledged}
              onChange={() => setShowAcknowledged(!showAcknowledged)}
            />
            Show reviewed
          </label>
          <button
            type="button"
            className="al-btn ghost"
            onClick={acknowledgeAllAlerts}
            disabled={acknowledgeAllLoading || loading || unreviewed === 0}
          >
            {acknowledgeAllLoading ? 'Working…' : 'Ack all'}
          </button>
        </span>
      </div>

      {error && <div className="al-error" role="alert">{error}</div>}

      {loading ? (
        <div className="al-empty">Loading alerts…</div>
      ) : alerts.length === 0 ? (
        <div className="al-empty">No alerts to show</div>
      ) : expanded ? (
        /* Wide: a table. At this size a column of cards is mostly whitespace,
           and the point of the wide view is scanning many episodes at once. */
        <table className="al-table">
          <thead>
            <tr>
              <th>Time</th>
              <th>Event</th>
              <th>Values</th>
              <th>Duration</th>
              <th>Status</th>
              <th className="al-actions-col">Actions</th>
            </tr>
          </thead>
          <tbody>
            {alerts.map((alert) => {
              const severity = getAlertSeverity(alert);
              const spo2 = range(alert.spo2_min, alert.spo2_max, '%');
              const bpm = range(alert.bpm_min, alert.bpm_max);
              return (
                <tr
                  key={alert.id}
                  className={alert.id === selectedId ? 'selected' : ''}
                  onClick={() => handleViewDetails(alert)}
                >
                  <td className="al-td-time">{formatDateTime(alert.start_time)}</td>
                  <th scope="row">
                    <button type="button" className="al-rowbtn">{eventTitle(alert)}</button>
                  </th>
                  <td className="al-vitals">
                    {spo2 && <>SpO₂ <b className={alert.spo2_alarm_triggered ? 'breach' : ''}>{spo2}</b></>}
                    {spo2 && bpm && <span className="sep">·</span>}
                    {bpm && <>HR <b className={alert.hr_alarm_triggered ? 'breach' : ''}>{bpm}</b></>}
                  </td>
                  <td>{formatDuration(alert.start_time, alert.end_time)}</td>
                  <td><span className={`al-badge ${severity}`}>{SEVERITY[severity]}</span></td>
                  <td className="al-actions-col">
                    {!alert.acknowledged && (
                      <button
                        type="button"
                        className="al-btn primary sm"
                        onClick={(e) => { e.stopPropagation(); handleAcknowledge(alert.id); }}
                      >
                        <CheckIcon size={13} /> Ack
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      ) : (
        <div className="al-list">
          {alerts.map((alert, i) => {
            const severity = getAlertSeverity(alert);
            const spo2 = range(alert.spo2_min, alert.spo2_max, '%');
            const bpm = range(alert.bpm_min, alert.bpm_max);
            return (
              <div
                key={alert.id}
                className={`al-card ${severity}${alert.id === selectedId ? ' selected' : ''}`}
              >
                <button
                  type="button"
                  className="al-card-body"
                  onClick={() => handleViewDetails(alert)}
                  aria-label={`${eventTitle(alert)}, ${SEVERITY[severity]}. Open details.`}
                >
                  <span className="al-card-head">
                    <span className="al-seq">{i + 1}</span>
                    <span className="al-title">{eventTitle(alert)}</span>
                    <span className="al-when">{formatDateTime(alert.start_time)}</span>
                  </span>
                  <span className={`al-badge ${severity}`}>{SEVERITY[severity]}</span>
                  <span className="al-vitals">
                    {spo2 && <>SpO₂ <b className={alert.spo2_alarm_triggered ? 'breach' : ''}>{spo2}</b></>}
                    {spo2 && bpm && <span className="sep">·</span>}
                    {bpm && <>HR <b className={alert.hr_alarm_triggered ? 'breach' : ''}>{bpm}</b></>}
                    <span className="sep">·</span>
                    <span className="ok">{formatDuration(alert.start_time, alert.end_time)}</span>
                  </span>
                </button>
                <div className="al-card-actions">
                  <button
                    type="button"
                    className="al-btn ghost"
                    onClick={(e) => { e.stopPropagation(); handleViewDetails(alert); }}
                  >
                    <SearchIcon size={13} /> Inspect
                  </button>
                  {!alert.acknowledged && (
                    <button
                      type="button"
                      className="al-btn primary"
                      onClick={(e) => { e.stopPropagation(); handleAcknowledge(alert.id); }}
                    >
                      <CheckIcon size={13} /> Acknowledge
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );

  if (expanded) {
    return (
      <div className="al-panel wide">
        <div className="al-main">{list}</div>
        <div className="al-side">
          {detail || <div className="al-empty">Select an alert to see its detail</div>}
        </div>
      </div>
    );
  }

  return <div className="al-panel">{list}</div>;
};


export default AlertsList;
