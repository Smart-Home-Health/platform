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
import useConnectionStatus from '../../hooks/useConnectionStatus';

const ageLabel = (ms) => {
  if (ms == null) return '—';
  if (ms < 1500) return 'now';
  if (ms < 60000) return `${Math.round(ms / 1000)}s ago`;
  if (ms < 3600000) return `${Math.round(ms / 60000)}m ago`;
  return `${Math.round(ms / 3600000)}h ago`;
};

function Segment({ label, value, tone }) {
  return (
    <div className="ld-strip-seg">
      <span className="ld-strip-label">{label}</span>
      <span className={`ld-strip-value ld-tone-${tone}`}>
        <span className="ld-strip-dot" aria-hidden="true" />
        {value}
      </span>
    </div>
  );
}

/* Slim full-width status strip: link (WS), data age, reader, API. */
export default function StatusStrip({ wsStatus, lastTickAt, sensorOffline, patientId }) {
  const { connected: apiOnline } = useConnectionStatus();
  const [reader, setReader] = useState(null);
  // 1 Hz rerender so the data-age readout counts up.
  const [, setBeat] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setBeat(b => b + 1), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!patientId) { setReader(null); return; }
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch(`${config.apiUrl}/api/readers`, { credentials: 'include' });
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled) return;
        const list = data.readers || data || [];
        setReader(list.find(r => r.patient_id === patientId) || null);
      } catch {
        // non-critical
      }
    };
    load();
    const interval = setInterval(load, 30000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [patientId]);

  const wsValue = { open: 'Connected', reconnecting: 'Reconnecting', closed: 'Offline' }[wsStatus] || 'Offline';
  const wsTone = wsStatus === 'open' ? 'ok' : wsStatus === 'reconnecting' ? 'due' : 'alert';

  const age = lastTickAt ? Date.now() - lastTickAt : null;
  const dataStale = age == null || age > 10000;
  const dataValue = sensorOffline ? 'Sensor offline' : ageLabel(age);
  const dataTone = sensorOffline ? 'alert' : dataStale ? 'due' : 'ok';

  return (
    <div className="ld-strip">
      <Segment label="Link" value={wsValue} tone={wsTone} />
      {reader && (
        <Segment
          label={reader.name || 'Reader'}
          value={reader.connected ? 'Connected' : 'Disconnected'}
          tone={reader.connected ? 'ok' : 'alert'}
        />
      )}
      <Segment label="API" value={apiOnline ? 'Online' : 'Unreachable'} tone={apiOnline ? 'ok' : 'alert'} />
      {/* Data age last: it's the segment that changes every second */}
      <Segment label="Data" value={dataValue} tone={dataTone} />
    </div>
  );
}
