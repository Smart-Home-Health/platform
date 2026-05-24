import { useState, useEffect, useMemo } from 'react';
import SimpleEventChart from './SimpleEventChart';
import config from '../config';
import ModalBase from './ModalBase';
import { AlertIcon, CheckIcon, ClockIcon, HeartIcon } from './Icons';

const AlertDetailModal = ({ alert, onClose, onAcknowledge, initiateAcknowledge = false }) => {
  const [eventData, setEventData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showOxygenForm, setShowOxygenForm] = useState(initiateAcknowledge);
  const [oxygenUsed, setOxygenUsed] = useState(false);
  const [oxygenValue, setOxygenValue] = useState('');
  const [oxygenUnit, setOxygenUnit] = useState('L/min');
  const [acknowledgingAlert, setAcknowledgingAlert] = useState(false);
  const [submitError, setSubmitError] = useState(null);

  useEffect(() => { fetchEventData(); }, [alert.id]);

  useEffect(() => {
    if (initiateAcknowledge) setShowOxygenForm(true);
  }, [initiateAcknowledge]);

  // Inject keyframes once
  useEffect(() => {
    if (document.getElementById('alert-detail-modal-styles')) return;
    const style = document.createElement('style');
    style.id = 'alert-detail-modal-styles';
    style.textContent = `
      @keyframes alertModalFade { 0% { opacity: 0; } 100% { opacity: 1; } }
      @keyframes alertModalSlide { 0% { opacity: 0; transform: translateY(20px); } 100% { opacity: 1; transform: translateY(0); } }
    `;
    document.head.appendChild(style);
  }, []);

  const fetchEventData = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch(`${config.apiUrl}/api/monitoring/alerts/${alert.id}/data`, { credentials: 'include' });
      if (!response.ok) throw new Error(`Error fetching alert data: ${response.statusText}`);
      setEventData(await response.json());
    } catch (err) {
      console.error(`Error fetching data for alert ${alert.id}:`, err);
      setError('Failed to load event data. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleAcknowledgeClick = () => setShowOxygenForm(true);

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
      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || `Failed (${response.status})`);
      }
      onAcknowledge(alert.id);
      onClose();
    } catch (err) {
      console.error('Error acknowledging alert:', err);
      setSubmitError(err.message);
    } finally {
      setAcknowledgingAlert(false);
    }
  };

  const handleCancelOxygenForm = () => {
    setShowOxygenForm(false);
    setOxygenUsed(false);
    setOxygenValue('');
    setOxygenUnit('L/min');
    setSubmitError(null);
  };

  const formatDateTime = (isoString) => {
    if (!isoString) return 'N/A';
    return new Date(isoString).toLocaleString(undefined, {
      month: 'short', day: 'numeric', year: 'numeric',
      hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true,
    });
  };

  const formatDuration = (start, end) => {
    if (!start) return '—';
    const endTime = end ? new Date(end) : new Date();
    const ms = endTime - new Date(start);
    if (ms < 0) return 'Ongoing';
    const total = Math.floor(ms / 1000);
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    if (h > 0) return `${h}h ${m}m`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
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
    active:         { color: '#dc3545', bg: 'rgba(220,53,69,0.12)', label: 'Active', icon: <AlertIcon size={14} /> },
    unacknowledged: { color: '#f0883e', bg: 'rgba(240,136,62,0.12)', label: 'Unacknowledged', icon: <ClockIcon size={14} /> },
    acknowledged:   { color: '#3fb950', bg: 'rgba(63,185,80,0.12)', label: 'Acknowledged', icon: <CheckIcon size={14} /> },
  }[severity];

  const triggeredAlarms = [];
  if (alert.alarm1_triggered) triggeredAlarms.push('Alarm 1');
  if (alert.alarm2_triggered) triggeredAlarms.push('Alarm 2');
  if (alert.spo2_alarm_triggered) triggeredAlarms.push('SpO₂');
  if (alert.hr_alarm_triggered) triggeredAlarms.push('BPM');

  const infoItem = (label, value) => (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: 4,
      padding: '10px 12px',
      background: 'rgba(255,255,255,0.04)',
      border: '1px solid rgba(255,255,255,0.08)',
      borderRadius: 8, minWidth: 0,
    }}>
      <span style={{ color: '#a0aec0', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>
        {label}
      </span>
      <span style={{ color: '#e6edf3', fontSize: 14, fontWeight: 500, wordBreak: 'break-word' }}>
        {value}
      </span>
    </div>
  );

  return (
    <ModalBase isOpen={true} onClose={onClose} title="Alert Event Details">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, color: '#e6edf3' }}>
        {/* Status banner */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px',
          background: SEV.bg, border: `1px solid ${SEV.color}40`,
          borderRadius: 8,
        }}>
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '4px 10px', borderRadius: 12,
            background: SEV.color, color: '#0d1117',
            fontSize: 12, fontWeight: 700,
          }}>
            {SEV.icon} {SEV.label}
          </span>
          {triggeredAlarms.length > 0 && (
            <span style={{ color: '#cbd5e0', fontSize: 13 }}>
              Alarms: <strong>{triggeredAlarms.join(', ')}</strong>
            </span>
          )}
        </div>

        {/* Info grid */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: 10,
        }}>
          {infoItem('Start Time', formatDateTime(alert.start_time))}
          {infoItem('End Time', alert.end_time ? formatDateTime(alert.end_time) : 'Ongoing')}
          {infoItem('Duration', formatDuration(alert.start_time, alert.end_time))}
        </div>

        {/* Metric cards */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: 12,
        }}>
          <div style={{
            background: 'rgba(72,187,120,0.1)',
            border: '1px solid rgba(72,187,120,0.3)',
            borderRadius: 10, padding: '14px 16px',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <span style={{ color: '#9ae6b4', fontSize: 13, fontWeight: 600 }}>SpO₂ Range</span>
              {alert.spo2_alarm_triggered && (
                <span style={{
                  background: '#f56565', color: '#fff',
                  padding: '2px 8px', borderRadius: 10,
                  fontSize: 10, fontWeight: 700,
                }}>ALARM</span>
              )}
            </div>
            <div style={{ color: '#e6edf3', fontSize: 22, fontWeight: 700 }}>
              {alert.spo2_min !== null && alert.spo2_max !== null
                ? (alert.spo2_min === alert.spo2_max
                    ? `${alert.spo2_min}%`
                    : `${alert.spo2_min} – ${alert.spo2_max}%`)
                : 'N/A'}
            </div>
          </div>

          <div style={{
            background: 'rgba(245,101,101,0.1)',
            border: '1px solid rgba(245,101,101,0.3)',
            borderRadius: 10, padding: '14px 16px',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#feb2b2', fontSize: 13, fontWeight: 600 }}>
                <HeartIcon size={14} /> Heart Rate Range
              </span>
              {alert.hr_alarm_triggered && (
                <span style={{
                  background: '#f56565', color: '#fff',
                  padding: '2px 8px', borderRadius: 10,
                  fontSize: 10, fontWeight: 700,
                }}>ALARM</span>
              )}
            </div>
            <div style={{ color: '#e6edf3', fontSize: 22, fontWeight: 700 }}>
              {alert.bpm_min !== null && alert.bpm_max !== null
                ? (alert.bpm_min === alert.bpm_max
                    ? `${alert.bpm_min} BPM`
                    : `${alert.bpm_min} – ${alert.bpm_max} BPM`)
                : 'N/A'}
            </div>
          </div>
        </div>

        {/* Charts */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: 30, color: '#a0aec0' }}>Loading data…</div>
        ) : error ? (
          <div role="alert" style={{
            padding: '12px 14px', borderRadius: 8,
            background: 'rgba(220,53,69,0.15)',
            border: '1px solid rgba(220,53,69,0.5)',
            color: '#f8d7da', fontSize: 13,
          }}>{error}</div>
        ) : !eventData || eventData.length === 0 ? (
          <div style={{
            textAlign: 'center', padding: 24,
            background: 'rgba(255,255,255,0.04)',
            border: '1px dashed rgba(255,255,255,0.15)',
            borderRadius: 8, color: '#a0aec0',
          }}>No data available for this event</div>
        ) : (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
            gap: 12,
          }}>
            <div style={{ background: '#1a202c', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, padding: 12 }}>
              <SimpleEventChart title="Blood Oxygen" color="#48BB78" unit="SpO₂ (%)" data={spo2ChartData} />
            </div>
            <div style={{ background: '#1a202c', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, padding: 12 }}>
              <SimpleEventChart title="Pulse Rate" color="#F56565" unit="BPM" data={bpmChartData} />
            </div>
          </div>
        )}

        {/* Footer actions */}
        <div style={{
          display: 'flex', justifyContent: 'flex-end', gap: 10,
          paddingTop: 12,
          borderTop: '1px solid rgba(255,255,255,0.08)',
        }}>
          <button onClick={onClose} style={{
            padding: '9px 18px', borderRadius: 6,
            border: '1px solid rgba(255,255,255,0.15)',
            background: 'transparent', color: '#e6edf3',
            cursor: 'pointer', fontSize: 14, fontWeight: 500,
          }}>Close</button>
          {!alert.acknowledged && (
            <button onClick={handleAcknowledgeClick} style={{
              padding: '9px 18px', borderRadius: 6, border: 'none',
              background: '#3fb950', color: '#0d1117',
              cursor: 'pointer', fontSize: 14, fontWeight: 600,
              display: 'flex', alignItems: 'center', gap: 6,
            }}>
              <CheckIcon size={14} /> Acknowledge
            </button>
          )}
        </div>
      </div>

      {/* Acknowledge form modal-over-modal */}
      {showOxygenForm && (
        <div
          style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(6px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 1100, animation: 'alertModalFade 0.2s ease-out',
          }}
          onClick={handleCancelOxygenForm}
        >
          <div
            style={{
              backgroundColor: '#1a2332', borderRadius: 12, padding: 24,
              maxWidth: 440, width: '90%',
              boxShadow: '0 20px 40px rgba(0,0,0,0.3)',
              border: '1px solid rgba(255,255,255,0.08)',
              animation: 'alertModalSlide 0.25s ease-out',
              color: '#e6edf3',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{
              display: 'flex', alignItems: 'center', gap: 10,
              marginBottom: 16, paddingBottom: 12,
              borderBottom: '1px solid rgba(255,255,255,0.08)',
            }}>
              <div style={{
                width: 32, height: 32, borderRadius: 8,
                backgroundColor: 'rgba(63,185,80,0.2)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#3fb950',
              }}><CheckIcon size={18} /></div>
              <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>Acknowledge Alert</h3>
            </div>

            <p style={{ margin: '0 0 16px 0', color: '#cbd5e0', fontSize: 14, lineHeight: 1.4 }}>
              Confirm if oxygen was administered during this alert.
            </p>

            <label style={{
              display: 'flex', alignItems: 'center', gap: 10,
              cursor: 'pointer', padding: '10px 12px',
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 8, marginBottom: 12,
              userSelect: 'none',
            }}>
              <input
                type="checkbox"
                checked={oxygenUsed}
                onChange={(e) => setOxygenUsed(e.target.checked)}
                style={{ width: 18, height: 18, cursor: 'pointer', accentColor: '#3fb950' }}
              />
              <span style={{ fontSize: 14 }}>Oxygen was administered</span>
            </label>

            {oxygenUsed && (
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', marginBottom: 6, fontSize: 13, fontWeight: 600 }}>
                  Highest flow / concentration
                </label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    type="number"
                    value={oxygenValue}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (v === '' || (!isNaN(parseFloat(v)) && parseFloat(v) >= 0)) setOxygenValue(v);
                    }}
                    step="0.1" min="0" placeholder="Enter value"
                    style={{
                      flex: 1, padding: 10, fontSize: 14,
                      background: '#2d3748', color: '#fff',
                      border: '1px solid rgba(255,255,255,0.15)',
                      borderRadius: 6, boxSizing: 'border-box',
                    }}
                  />
                  <select
                    value={oxygenUnit}
                    onChange={(e) => setOxygenUnit(e.target.value)}
                    style={{
                      padding: 10, fontSize: 14,
                      background: '#2d3748', color: '#fff',
                      border: '1px solid rgba(255,255,255,0.15)',
                      borderRadius: 6,
                    }}
                  >
                    <option value="L/min">L/min</option>
                    <option value="%">%</option>
                  </select>
                </div>
              </div>
            )}

            {submitError && (
              <div role="alert" style={{
                padding: '10px 12px', borderRadius: 6,
                background: 'rgba(220,53,69,0.15)',
                border: '1px solid rgba(220,53,69,0.5)',
                color: '#f8d7da', fontSize: 13, marginBottom: 12,
              }}>{submitError}</div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button
                onClick={handleCancelOxygenForm}
                disabled={acknowledgingAlert}
                style={{
                  padding: '9px 18px', borderRadius: 6,
                  border: '1px solid rgba(255,255,255,0.15)',
                  background: 'transparent', color: '#e6edf3',
                  cursor: acknowledgingAlert ? 'not-allowed' : 'pointer',
                  fontSize: 14, fontWeight: 500,
                }}
              >Cancel</button>
              <button
                onClick={handleSubmitAcknowledge}
                disabled={acknowledgingAlert || (oxygenUsed && !oxygenValue)}
                style={{
                  padding: '9px 18px', borderRadius: 6, border: 'none',
                  background: '#3fb950', color: '#0d1117',
                  cursor: (acknowledgingAlert || (oxygenUsed && !oxygenValue)) ? 'not-allowed' : 'pointer',
                  fontSize: 14, fontWeight: 600,
                  opacity: (acknowledgingAlert || (oxygenUsed && !oxygenValue)) ? 0.6 : 1,
                }}
              >{acknowledgingAlert ? 'Submitting…' : 'Submit'}</button>
            </div>
          </div>
        </div>
      )}
    </ModalBase>
  );
};

export default AlertDetailModal;
