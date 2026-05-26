import { useState, useEffect } from 'react';
import config from '../../config';
import AlertDetailInline from '../AlertDetailInline';
import { AlertIcon, CheckIcon, ClockIcon, HeartIcon } from '../Icons';

const AlertsList = ({ onAlertAcknowledge, patientId }) => {
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showAcknowledged, setShowAcknowledged] = useState(false);
  const [selectedAlert, setSelectedAlert] = useState(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [showAcknowledgeForm, setShowAcknowledgeForm] = useState(false);
  const [acknowledgeAllLoading, setAcknowledgeAllLoading] = useState(false);

  useEffect(() => {
    fetchAlerts();
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
    setSelectedAlert(alert);
    setShowDetailModal(true);
  };

  const closeDetailModal = () => {
    setShowDetailModal(false);
    setSelectedAlert(null);
  };

  const handleAcknowledge = async (alertId) => {
    setSelectedAlert(alerts.find(a => a.id === alertId));
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

  const SEVERITY = {
    active:         { color: '#dc3545', bg: 'rgba(220,53,69,0.12)', label: 'Active', icon: <AlertIcon size={14} /> },
    unacknowledged: { color: '#f0883e', bg: 'rgba(240,136,62,0.12)', label: 'Unacknowledged', icon: <ClockIcon size={14} /> },
    acknowledged:   { color: '#3fb950', bg: 'rgba(63,185,80,0.12)', label: 'Acknowledged', icon: <CheckIcon size={14} /> },
  };

  const triggeredAlarms = (alert) => {
    const out = [];
    if (alert.alarm1_triggered) out.push('Alarm 1');
    if (alert.alarm2_triggered) out.push('Alarm 2');
    if (alert.spo2_alarm_triggered) out.push('SpO₂');
    if (alert.hr_alarm_triggered) out.push('BPM');
    return out;
  };

  if (selectedAlert) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <AlertDetailInline
          alert={selectedAlert}
          onClose={() => {
            setSelectedAlert(null);
            setShowAcknowledgeForm(false);
          }}
          onAcknowledge={acknowledgeAlert}
          initiateAcknowledge={showAcknowledgeForm}
        />
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Controls bar */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        flexWrap: 'wrap', gap: 12,
        padding: '12px 14px',
        background: 'rgba(255,255,255,0.04)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 8,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <button
            onClick={fetchAlerts}
            disabled={loading}
            style={{
              padding: '8px 16px', borderRadius: 6,
              border: '1px solid rgba(255,255,255,0.15)',
              background: 'transparent', color: '#e6edf3',
              cursor: loading ? 'not-allowed' : 'pointer',
              fontSize: 13, fontWeight: 500,
              opacity: loading ? 0.6 : 1,
            }}
          >
            {loading ? 'Loading…' : 'Refresh'}
          </button>
          <button
            onClick={acknowledgeAllAlerts}
            disabled={acknowledgeAllLoading || loading}
            style={{
              padding: '8px 16px', borderRadius: 6, border: 'none',
              background: '#3fb950', color: '#0d1117',
              cursor: (acknowledgeAllLoading || loading) ? 'not-allowed' : 'pointer',
              fontSize: 13, fontWeight: 600,
              opacity: (acknowledgeAllLoading || loading) ? 0.6 : 1,
              display: 'flex', alignItems: 'center', gap: 6,
            }}
          >
            <CheckIcon size={14} />
            {acknowledgeAllLoading ? 'Acknowledging…' : 'Acknowledge All'}
          </button>
        </div>
        <label style={{
          display: 'flex', alignItems: 'center', gap: 8,
          cursor: 'pointer', fontSize: 13, color: '#cbd5e0',
          userSelect: 'none',
        }}>
          <input
            type="checkbox"
            checked={showAcknowledged}
            onChange={() => setShowAcknowledged(!showAcknowledged)}
            style={{ width: 16, height: 16, cursor: 'pointer', accentColor: '#3fb950' }}
          />
          Show Acknowledged
        </label>
      </div>

      {error && (
        <div role="alert" style={{
          padding: '12px 14px', borderRadius: 8,
          background: 'rgba(220,53,69,0.15)',
          border: '1px solid rgba(220,53,69,0.5)',
          color: '#f8d7da', fontSize: 13,
        }}>{error}</div>
      )}

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#a0aec0' }}>Loading alerts…</div>
      ) : alerts.length === 0 ? (
        <div style={{
          textAlign: 'center', padding: 40,
          background: 'rgba(255,255,255,0.04)',
          border: '1px dashed rgba(255,255,255,0.15)',
          borderRadius: 8, color: '#a0aec0',
        }}>
          <div style={{ marginBottom: 8 }}><CheckIcon size={28} /></div>
          No alerts to show.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {alerts.map(alert => {
            const severity = getAlertSeverity(alert);
            const sev = SEVERITY[severity];
            const alarms = triggeredAlarms(alert);
            return (
              <div
                key={alert.id}
                style={{
                  position: 'relative',
                  background: '#1a2332',
                  border: '1px solid rgba(255,255,255,0.08)',
                  borderLeft: `5px solid ${sev.color}`,
                  borderRadius: 10,
                  padding: '14px 16px',
                  display: 'flex', flexDirection: 'column', gap: 12,
                  boxShadow: '0 2px 6px rgba(0,0,0,0.25)',
                  opacity: severity === 'acknowledged' ? 0.75 : 1,
                }}
              >
                {/* Top row: status + timestamp */}
                <div style={{
                  display: 'flex', justifyContent: 'space-between',
                  alignItems: 'center', flexWrap: 'wrap', gap: 8,
                }}>
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    padding: '4px 10px', borderRadius: 12,
                    background: sev.bg, color: sev.color,
                    fontSize: 12, fontWeight: 700,
                    border: `1px solid ${sev.color}40`,
                  }}>
                    {sev.icon} {sev.label}
                  </span>
                  <span style={{ color: '#a0aec0', fontSize: 12, fontWeight: 500 }}>
                    {formatDateTime(alert.start_time)}
                  </span>
                </div>

                {/* Metric row: SpO2, BPM, Duration */}
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
                  gap: 10,
                }}>
                  <div style={{
                    background: 'rgba(72,187,120,0.1)',
                    border: '1px solid rgba(72,187,120,0.3)',
                    borderRadius: 8, padding: '8px 12px',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#9ae6b4', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                      SpO₂
                    </div>
                    <div style={{ color: '#e6edf3', fontSize: 16, fontWeight: 700, marginTop: 2 }}>
                      {alert.spo2_min !== null && alert.spo2_max !== null
                        ? (alert.spo2_min === alert.spo2_max
                            ? `${alert.spo2_min}%`
                            : `${alert.spo2_min}–${alert.spo2_max}%`)
                        : '—'}
                    </div>
                  </div>
                  <div style={{
                    background: 'rgba(245,101,101,0.1)',
                    border: '1px solid rgba(245,101,101,0.3)',
                    borderRadius: 8, padding: '8px 12px',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#feb2b2', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                      <HeartIcon size={12} /> BPM
                    </div>
                    <div style={{ color: '#e6edf3', fontSize: 16, fontWeight: 700, marginTop: 2 }}>
                      {alert.bpm_min !== null && alert.bpm_max !== null
                        ? (alert.bpm_min === alert.bpm_max
                            ? alert.bpm_min
                            : `${alert.bpm_min}–${alert.bpm_max}`)
                        : '—'}
                    </div>
                  </div>
                  <div style={{
                    background: 'rgba(96,165,250,0.1)',
                    border: '1px solid rgba(96,165,250,0.3)',
                    borderRadius: 8, padding: '8px 12px',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#93c5fd', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                      <ClockIcon size={12} /> Duration
                    </div>
                    <div style={{ color: '#e6edf3', fontSize: 16, fontWeight: 700, marginTop: 2 }}>
                      {formatDuration(alert.start_time, alert.end_time)}
                    </div>
                  </div>
                </div>

                {/* Alarms */}
                {alarms.length > 0 && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <span style={{ color: '#a0aec0', fontSize: 12, fontWeight: 500 }}>Alarms:</span>
                    {alarms.map(a => (
                      <span key={a} style={{
                        padding: '2px 8px', borderRadius: 10,
                        background: 'rgba(245,101,101,0.15)',
                        color: '#feb2b2', fontSize: 11, fontWeight: 600,
                        border: '1px solid rgba(245,101,101,0.4)',
                      }}>{a}</span>
                    ))}
                  </div>
                )}

                {/* Actions */}
                <div style={{
                  display: 'flex', justifyContent: 'flex-end', gap: 8,
                  borderTop: '1px solid rgba(255,255,255,0.06)',
                  paddingTop: 10,
                }}>
                  <button
                    onClick={() => handleViewDetails(alert)}
                    style={{
                      padding: '7px 14px', borderRadius: 6,
                      border: '1px solid rgba(255,255,255,0.15)',
                      background: 'transparent', color: '#e6edf3',
                      cursor: 'pointer', fontSize: 13, fontWeight: 500,
                    }}
                  >
                    View Details
                  </button>
                  {!alert.acknowledged && (
                    <button
                      onClick={() => handleAcknowledge(alert.id)}
                      style={{
                        padding: '7px 14px', borderRadius: 6, border: 'none',
                        background: '#3fb950', color: '#0d1117',
                        cursor: 'pointer', fontSize: 13, fontWeight: 600,
                        display: 'flex', alignItems: 'center', gap: 6,
                      }}
                    >
                      <CheckIcon size={14} /> Acknowledge
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

    </div>
  );
};

export default AlertsList;
