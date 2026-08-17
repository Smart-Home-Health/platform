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
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import config from '../config';

export const CHART_RANGES = [
  { key: '15m', label: '15 min', minutes: 15 },
  { key: '1h', label: '1 hr', minutes: 60 },
  { key: '6h', label: '6 hr', minutes: 360 },
  { key: '24h', label: '24 hr', minutes: 1440 },
];

const RANGE_KEY = 'dash_chart_range';
const LIVE_RING_MAX = 1000;
const STALL_MS = 5000;

// sessionStorage can throw in some embedded / private-browsing contexts.
const readStoredRange = () => {
  try { return sessionStorage.getItem(RANGE_KEY); } catch { return null; }
};
const writeStoredRange = (key) => {
  try { sessionStorage.setItem(RANGE_KEY, key); } catch { /* non-critical */ }
};

/* Live chart buffer for the /live dashboard: server-side downsampled backfill
 * (/api/monitoring/history/recent) merged with raw WebSocket ticks. Bucketed
 * ranges re-fetch every 60 s so the canonical buckets absorb the raw live
 * tail and client state stays bounded. */
export default function useLiveVitalsBuffer(patientId, enabled) {
  const [range, setRangeState] = useState(() => {
    const stored = readStoredRange();
    return CHART_RANGES.some(r => r.key === stored) ? stored : '15m';
  });
  const [backfill, setBackfill] = useState([]);
  const [liveTicks, setLiveTicks] = useState([]);
  // Tick arrival times for the streaming indicator (wall clock, not sample ts).
  const arrivalsRef = useRef([]);
  const [lastTickAt, setLastTickAt] = useState(null);
  // Wall clock refreshed at 1 Hz; the memos below read it (not Date.now())
  // so the window trim and stall detection advance even when no ticks arrive.
  const [now, setNow] = useState(() => Date.now());

  const setRange = useCallback((key) => {
    setRangeState(key);
    writeStoredRange(key);
  }, []);

  const rangeDef = CHART_RANGES.find(r => r.key === range) || CHART_RANGES[0];

  // Backfill fetch — on mount, patient change, range change; then every 60 s
  // for bucketed ranges so buckets stay canonical.
  useEffect(() => {
    // Any patient/enabled change invalidates the live tail and the streaming
    // history — otherwise a cleared patient (or a switch) leaks stale data.
    setLiveTicks([]);
    setLastTickAt(null);
    arrivalsRef.current = [];
    if (!enabled || !patientId) {
      setBackfill([]);
      return;
    }
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch(
          `${config.apiUrl}/api/monitoring/history/recent?patient_id=${patientId}&minutes=${rangeDef.minutes}`,
          { credentials: 'include' }
        );
        if (!res.ok || cancelled) return;
        const data = await res.json();
        if (!cancelled) setBackfill(data.points || []);
      } catch {
        // Non-critical: charts fall back to live ticks only.
      }
    };
    load();
    const interval = rangeDef.minutes > 15 ? setInterval(load, 60000) : null;
    return () => {
      cancelled = true;
      if (interval) clearInterval(interval);
    };
  }, [enabled, patientId, rangeDef.minutes]);

  // Called from the dashboard's WS handler (via ref) on every sensor_update.
  // Ticks carrying no vital values (e.g. environment-sensor rebroadcasts)
  // don't count as "streaming" — the indicator would lie otherwise.
  const pushTick = useCallback((tick) => {
    if (tick.spo2 == null && tick.bpm == null && tick.perfusion == null) return;
    const now = Date.now();
    arrivalsRef.current = [...arrivalsRef.current.slice(-9), now];
    setLastTickAt(now);
    setLiveTicks(prev => [...prev.slice(-(LIVE_RING_MAX - 1)), tick]);
  }, []);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const series = useMemo(() => {
    const windowStart = now - rangeDef.minutes * 60 * 1000;
    const lastBackfillT = backfill.length ? backfill[backfill.length - 1].t : 0;
    const merged = backfill
      .concat(liveTicks.filter(p => p.t > lastBackfillT))
      .filter(p => p.t >= windowStart);
    const pick = (key) => merged
      .filter(p => p[key] != null)
      .map(p => ({ x: p.t, y: p[key] }));
    return { spo2: pick('spo2'), bpm: pick('bpm'), perfusion: pick('perfusion') };
  }, [backfill, liveTicks, rangeDef.minutes, now]);

  const streaming = useMemo(() => {
    const arrivals = arrivalsRef.current;
    if (!lastTickAt || now - lastTickAt > STALL_MS) {
      return { status: lastTickAt ? 'stalled' : 'offline', rateHz: null };
    }
    if (arrivals.length < 3) return { status: 'streaming', rateHz: null };
    const deltas = arrivals.slice(1).map((t, i) => t - arrivals[i]).sort((a, b) => a - b);
    const median = deltas[Math.floor(deltas.length / 2)];
    const rateHz = median > 0 ? 1000 / median : null;
    return { status: 'streaming', rateHz };
  }, [lastTickAt, now]);

  return { range, setRange, rangeDef, series, pushTick, streaming, lastTickAt };
}
