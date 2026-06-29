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
import { AlertIcon, CheckIcon, ClockIcon, HeartIcon } from '../Icons';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Alert } from '@/components/ui/alert';
import { cn } from '@/lib/utils';

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

  // Theme-aware severity styling: Tailwind utilities driven by semantic tokens,
  // plus a CSS-var accent for the card's colored left border.
  const SEVERITY = {
    active:         { label: 'Active',         icon: <AlertIcon size={14} />, badge: 'bg-destructive/10 text-destructive border-destructive/30', accent: 'var(--destructive)' },
    unacknowledged: { label: 'Unacknowledged', icon: <ClockIcon size={14} />, badge: 'bg-warning/10 text-warning border-warning/30',             accent: 'var(--warning)' },
    acknowledged:   { label: 'Acknowledged',   icon: <CheckIcon size={14} />, badge: 'bg-success/10 text-success border-success/30',             accent: 'var(--success)' },
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
    <div className="tw flex flex-col gap-4">
      {/* Controls bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card px-3.5 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" onClick={fetchAlerts} disabled={loading}>
            {loading ? 'Loading…' : 'Refresh'}
          </Button>
          <Button onClick={acknowledgeAllAlerts} disabled={acknowledgeAllLoading || loading}>
            <CheckIcon size={14} />
            {acknowledgeAllLoading ? 'Acknowledging…' : 'Acknowledge All'}
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <Checkbox
            id="show-acknowledged"
            checked={showAcknowledged}
            onCheckedChange={() => setShowAcknowledged(!showAcknowledged)}
          />
          <Label htmlFor="show-acknowledged" className="cursor-pointer">Show Acknowledged</Label>
        </div>
      </div>

      {error && <Alert variant="destructive">{error}</Alert>}

      {loading ? (
        <div className="py-10 text-center text-muted-foreground">Loading alerts…</div>
      ) : alerts.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border py-10 text-center text-muted-foreground">
          <CheckIcon size={28} />
          No alerts to show.
        </div>
      ) : (
        <div className="flex flex-col gap-2.5">
          {alerts.map(alert => {
            const severity = getAlertSeverity(alert);
            const sev = SEVERITY[severity];
            const alarms = triggeredAlarms(alert);
            return (
              <div
                key={alert.id}
                style={{ borderLeftWidth: 4, borderLeftColor: sev.accent }}
                className={cn(
                  'flex flex-col gap-3 rounded-xl border border-border bg-card p-4 shadow-sm',
                  severity === 'acknowledged' && 'opacity-75'
                )}
              >
                {/* Top row: status + timestamp */}
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className={cn(
                    'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-bold',
                    sev.badge
                  )}>
                    {sev.icon} {sev.label}
                  </span>
                  <span className="text-xs font-medium text-muted-foreground">
                    {formatDateTime(alert.start_time)}
                  </span>
                </div>

                {/* Metric row: SpO2, BPM, Duration */}
                <div className="grid gap-2.5" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))' }}>
                  <div className="rounded-lg border border-success/20 bg-success/10 px-3 py-2">
                    <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-success">
                      SpO₂
                    </div>
                    <div className="mt-0.5 text-base font-bold text-foreground">
                      {alert.spo2_min !== null && alert.spo2_max !== null
                        ? (alert.spo2_min === alert.spo2_max
                            ? `${alert.spo2_min}%`
                            : `${alert.spo2_min}–${alert.spo2_max}%`)
                        : '—'}
                    </div>
                  </div>
                  <div className="rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2">
                    <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-destructive">
                      <HeartIcon size={12} /> BPM
                    </div>
                    <div className="mt-0.5 text-base font-bold text-foreground">
                      {alert.bpm_min !== null && alert.bpm_max !== null
                        ? (alert.bpm_min === alert.bpm_max
                            ? alert.bpm_min
                            : `${alert.bpm_min}–${alert.bpm_max}`)
                        : '—'}
                    </div>
                  </div>
                  <div className="rounded-lg border border-ring/20 bg-ring/10 px-3 py-2">
                    <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-ring">
                      <ClockIcon size={12} /> Duration
                    </div>
                    <div className="mt-0.5 text-base font-bold text-foreground">
                      {formatDuration(alert.start_time, alert.end_time)}
                    </div>
                  </div>
                </div>

                {/* Alarms */}
                {alarms.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-xs font-medium text-muted-foreground">Alarms:</span>
                    {alarms.map(a => (
                      <span key={a} className="rounded-full border border-destructive/40 bg-destructive/15 px-2 py-0.5 text-[11px] font-semibold text-destructive">
                        {a}
                      </span>
                    ))}
                  </div>
                )}

                {/* Actions */}
                <div className="flex justify-end gap-2 border-t border-border pt-2.5">
                  <Button variant="secondary" size="sm" onClick={() => handleViewDetails(alert)}>
                    View Details
                  </Button>
                  {!alert.acknowledged && (
                    <Button size="sm" onClick={() => handleAcknowledge(alert.id)}>
                      <CheckIcon size={14} /> Acknowledge
                    </Button>
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
