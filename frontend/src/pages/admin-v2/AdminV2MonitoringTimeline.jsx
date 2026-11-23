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
// Day timeline — one patient, one local day, bedside-monitor aesthetic.
//
// SpO2 and heart rate are separate stacked charts rather than one chart with
// two y-axes. Two axes forced both series into a shared vertical space where
// neither could be read at its own scale, and capped the page at two signals.
// Split, each gets its own scale — and they still read as one instrument
// because three things are shared: the time window, the scrubbed instant, and
// the horizontal plot box (see PLOT_GUTTER).
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import Chart from 'chart.js/auto';
import 'chartjs-adapter-date-fns';
import annotationPlugin from 'chartjs-plugin-annotation';
import zoomPlugin from 'chartjs-plugin-zoom';
import config, { apiFetch } from '../../config';
import { useAdminPatient } from '../../contexts/AdminPatientContext';
import { useThemeTokens } from '../../hooks/useThemeTokens';
import { readToken } from '../../utils/themeTokens';
import { signalMinutes, tracePoints, sampleAt } from './timelineSignals';
import { alarmsFor } from './reports/dayOverDay';
import {
  PLOT_GUTTER, PLOT_RPAD, chartChrome, niceScale, thresholdLine, stackedChartOptions,
} from './monitoringChart';
import {
  ENV_LANES, ENV_METRIC_KEYS, buildEnvSpans, worstStatus, describeSpan,
  severityOf, directionOf,
} from './timelineEnv';
import {
  NotesIcon,
  CalendarIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronDownIcon,
  FilterIcon,
  AlertIcon,
  PillIcon,
  CheckCircleIcon,
  DropletIcon,
  ToiletIcon,
  VitalsIcon,
} from '../../components/Icons';
import './monitoring-timeline.css';

Chart.register(annotationPlugin, zoomPlugin);

/* Series colours are the vc-derived ramp the reports already use for these
 * same two vitals (reports/weekly.js), not the mockup's crimson/indigo: red on
 * a resting SpO2 trace spends the one colour this palette reserves for
 * clinical concern, and the alert bands underneath it need that colour to
 * mean something. */
const SIGNALS = {
  spo2: {
    label: 'SpO2', axisLabel: 'SPO2 %', color: 'var(--vc-series-spo2)', token: '--vc-series-spo2',
    alarmKey: 'spo2', unit: '%', decimals: 1,
    defaultMin: 86, defaultMax: 100, minPad: 2, clampMax: 100,
  },
  bpm: {
    label: 'Heart Rate', axisLabel: 'HEART RATE BPM', color: 'var(--vc-series-hr)', token: '--vc-series-hr',
    alarmKey: 'heart_rate', unit: 'bpm', decimals: 0,
    defaultMin: 55, defaultMax: 120, minPad: 4, clampMax: null,
  },
};
const SIGNAL_KEYS = ['spo2', 'bpm'];

/* Event lanes. Alerts keep the alert red because that is the role; the rest
 * take the categorical ramp so a lane colour never reads as a state. */
const LANES = {
  alerts: { label: 'Alerts', color: 'var(--vc-state-alert)', Icon: AlertIcon },
  medications: { label: 'Meds', color: 'var(--vc-series-5)', Icon: PillIcon },
  care_tasks: { label: 'Care', color: 'var(--vc-series-4)', Icon: CheckCircleIcon },
  nutrition_intake: { label: 'Feeds', color: 'var(--vc-series-7)', Icon: DropletIcon },
  nutrition_output: { label: 'Output', color: 'var(--vc-series-6)', Icon: ToiletIcon },
  vitals: { label: 'Vitals', color: 'var(--vc-series-3)', Icon: VitalsIcon },
};
const LANE_KEYS = Object.keys(LANES);
const DIARY_LANE = { label: 'Diary', color: 'var(--vc-data-live)', Icon: NotesIcon };
const DIARY_LANE_KEYS = ['diary', ...LANE_KEYS];
const ENTRY_LANES = { observation: 'diary', medication: 'medications', nutrition: 'nutrition_intake' };
const COLLAPSED_LANES = 4;

/* 1M is the floor because the timeline endpoint averages pulse-ox into
 * one-minute buckets, so a narrower window cannot resolve anything further —
 * it would just magnify the same points. Reading below a minute means going
 * to /api/monitoring/history/raw, which is a different request. */
const RANGES = [
  { label: '24H', minutes: 1440 },
  { label: '6H', minutes: 360 },
  { label: '1H', minutes: 60 },
  { label: '30M', minutes: 30 },
  { label: '5M', minutes: 5 },
  { label: '1M', minutes: 1 },
];
const MIN_RANGE_MS = 60_000;

/* Room readings are bucketed server-side; 15m is fine enough to place an
 * excursion on a day view and coarse enough to stay one request. */
const ENV_BUCKET = '15m';
const ENV_BUCKET_MS = 15 * 60_000;
const ENV_UNITS = {
  temperature: '°C', relative_humidity: '%', co2: ' ppm', pm25: ' µg/m³',
};

/* Local calendar date, not the UTC one. toISOString() rolls over at UTC
 * midnight, so west of Greenwich an evening visit asked the API for
 * tomorrow and got an empty day. */
const toApiDate = (d) => {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};
const formatDuration = (ms) => {
  const total = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h) return `${h}h ${m}m`;
  if (m) return `${m}m ${s}s`;
  return `${s}s`;
};

const eventLabel = (type, item) => {
  if (item.entry) return item.entry.source === 'observation' ? item.entry.label : item.entry.note || item.entry.label;
  switch (type) {
    case 'medications': return `${item.name} ${item.dose}`.trim();
    case 'care_tasks': return item.name;
    case 'nutrition_intake':
      return `${item.item_name}${item.amount ? ` ${item.amount}${item.amount_unit || ''}` : ''}`;
    case 'nutrition_output': {
      const parts = [item.output_type];
      if (item.is_diaper) {
        if (item.diaper_wetness) parts.push(item.diaper_wetness);
        if (item.diaper_soiled) parts.push('soiled');
      }
      if (item.consistency) parts.push(item.consistency);
      return parts.filter(Boolean).join(' · ');
    }
    case 'vitals': return `${item.vital_type} ${item.value}${item.unit || ''}`;
    default: return '';
  }
};

const alertLabel = (a) => {
  if (a.spo2_alarm && a.hr_alarm) return 'SpO2 + HR alert';
  if (a.spo2_alarm) return 'Low SpO2 alert';
  if (a.hr_alarm) return 'Heart rate alert';
  return 'Monitoring alert';
};

export function PatientDayTimeline({ patient: selectedPatient, diaryPath, diaryEntries, onEditObservation, refresh = 0 }) {
  const laneKeys = diaryPath ? DIARY_LANE_KEYS : LANE_KEYS;
  // An empty target asks the server for today in the patient's account timezone.
  const [selection, setSelection] = useState({ date: null });
  const [loaded, setLoaded] = useState(null);
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const [activeSignals, setActiveSignals] = useState(SIGNAL_KEYS);
  const [lanesExpanded, setLanesExpanded] = useState(false);
  const [rangeLabel, setRangeLabel] = useState('24H');
  const [selectedView, setView] = useState(null); // { min, max } epoch ms
  const [cursor, setCursor] = useState(null);   // scrubbed instant, epoch ms

  const stackRef = useRef(null);
  const pointers = useRef(new Set());

  /* ---------------- data ---------------- */

  const params = new URLSearchParams();
  if (!diaryPath && selectedPatient) params.set('patient_id', selectedPatient.id);
  if (selection.date) params.set('target_date', selection.date);
  const endpoint = diaryPath ? diaryPath + '/day' : '/api/monitoring/timeline';
  const url = config.apiUrl + endpoint + (params.size ? '?' + params : '');
  const patientId = selectedPatient?.id;
  useEffect(() => {
    if (!patientId) return undefined;
    const controller = new AbortController();
    let pending = false;
    let live = true;
    async function load() {
      if (pending) return;
      pending = true;
      setLoading(true);
      try {
        const res = await apiFetch(url, { signal: controller.signal });
        if (!res.ok) throw new Error('Could not load the timeline for this day.');
        const body = await res.json();
        live = body.date === body.today && (!body.window_end || Date.parse(body.window_end) > Date.now())
          || body.first_day > body.today;
        if (!controller.signal.aborted) { setLoaded({ url, body }); setError(null); }
      } catch (err) {
        if (!controller.signal.aborted) setError(err.message);
      } finally {
        pending = false;
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    setError(null);
    load();
    const timer = diaryPath ? setInterval(() => {
      if (live && !document.hidden) load();
    }, 60_000) : null;
    return () => { controller.abort(); clearInterval(timer); };
  }, [url, patientId, diaryPath, selection, refresh]);

  const day = loaded?.url === url ? loaded.body : null;
  const data = useMemo(() => {
    if (!diaryPath || !day) return day;
    const combined = { ...day, diary: [], medications: [], nutrition_intake: [] };
    const start = Date.parse(day.day_start);
    const end = Date.parse(day.day_end);
    for (const entry of diaryEntries || []) {
      const ts = Date.parse(entry.at);
      const lane = ENTRY_LANES[entry.source];
      if (lane && ts >= start && ts < end) combined[lane].push({ ts: entry.at, entry });
    }
    return combined;
  }, [day, diaryPath, diaryEntries]);

  // Alarm limits for the threshold lines — the same account settings the live
  // monitor alarms on. A failure just means no threshold line.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await apiFetch(`${config.apiUrl}/api/settings`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const body = await res.json();
        if (!cancelled) setSettings(body);
      } catch {
        if (!cancelled) setSettings({});
      }
    })();
    return () => { cancelled = true; };
  }, []);

  /* ---------------- derived ---------------- */

  const today = loaded?.body.today ?? toApiDate(new Date());
  const selectedDay = data?.date ?? selection.date ?? today;
  const firstDay = loaded?.body.first_day;
  const lastDay = loaded?.body.last_day ?? today;
  const zone = data?.timezone;
  const clocks = useMemo(() => {
    const options = { timeZone: zone, hour: 'numeric', minute: '2-digit' };
    return {
      minute: new Intl.DateTimeFormat('en-US', options).format,
      second: new Intl.DateTimeFormat('en-US', { ...options, second: '2-digit' }).format,
    };
  }, [zone]);
  const clockTime = clocks.minute;

  // The API uses [midnight, next midnight). The chart's max is inclusive.
  const bounds = useMemo(() => {
    if (data?.day_start && data?.day_end) {
      return { start: Date.parse(data.day_start), end: Date.parse(data.day_end) - 1 };
    }
    return { start: Date.parse(`${selectedDay}T00:00:00`), end: Date.parse(`${selectedDay}T23:59:59.999`) };
  }, [data?.day_start, data?.day_end, selectedDay]);
  const view = selectedView && selectedView.min >= bounds.start && selectedView.max <= bounds.end ? selectedView : null;

  // Reset the window whenever the day changes.
  useEffect(() => {
    setView({ min: bounds.start, max: bounds.end });
    setRangeLabel('24H');
    setCursor(null);
  }, [bounds.start, bounds.end]);

  /* ---------------- room conditions ---------------- */

  const [envRanges, setEnvRanges] = useState(null);
  const [envSeries, setEnvSeries] = useState({});
  const [roomLocations, setRoomLocations] = useState([]);
  const [roomLocation, setRoomLocation] = useState(null);

  useEffect(() => {
    if (!selectedPatient) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const res = await apiFetch(
          `${config.apiUrl}/api/environment/ranges?patient_id=${selectedPatient.id}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const body = await res.json();
        if (!cancelled) {
          setEnvRanges(Object.fromEntries((body.ranges || []).map((r) => [r.metric, r])));
        }
      } catch {
        if (!cancelled) setEnvRanges({});
      }
    })();
    return () => { cancelled = true; };
  }, [selectedPatient]);

  // Rooms that actually have readings. "" is a real location (unspecified
  // room) and is offered as one.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await apiFetch(`${config.apiUrl}/api/environment/locations`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const rows = await res.json();
        const rooms = [...new Set(rows.filter((r) => r.scope === 'room')
                                      .map((r) => r.location ?? ''))];
        if (cancelled) return;
        setRoomLocations(rooms);
        // Follow the patient's configured care area when it has data, else
        // keep a still-valid manual pick, else guess at a bedroom.
        const careArea = selectedPatient?.care_area;
        setRoomLocation((prev) => {
          if (careArea && rooms.includes(careArea)) return careArea;
          if (prev !== null && rooms.includes(prev)) return prev;
          return rooms.find((l) => /bed|care/i.test(l)) ?? rooms[0] ?? null;
        });
      } catch {
        if (!cancelled) setRoomLocations([]);
      }
    })();
    return () => { cancelled = true; };
  }, [selectedPatient?.id, selectedPatient?.care_area]);

  useEffect(() => {
    if (roomLocation === null || !data?.date) { setEnvSeries({}); return undefined; }
    let cancelled = false;
    const dayStart = data.window_start ?? new Date(bounds.start).toISOString();
    const dayEnd = data.window_end ?? new Date(bounds.end).toISOString();
    (async () => {
      const next = {};
      await Promise.all(ENV_METRIC_KEYS.map(async (metric) => {
        try {
          const params = new URLSearchParams({
            metric, scope: 'room', location: roomLocation,
            bucket: ENV_BUCKET, limit: '500', from: dayStart, to: dayEnd,
          });
          const res = await apiFetch(
            `${config.apiUrl}/api/environment/observations?${params}`);
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const rows = await res.json();
          // Newest-first from the API; spans need ascending.
          next[metric] = rows.slice().reverse()
            .map((r) => ({ ts: new Date(r.ts).getTime(), value: r.avg }));
        } catch {
          next[metric] = [];
        }
      }));
      if (!cancelled) setEnvSeries(next);
    })();
    return () => { cancelled = true; };
  }, [roomLocation, bounds.start, bounds.end, data?.date, data?.window_start, data?.window_end]);

  const roomStart = data?.window_start ? Date.parse(data.window_start) : bounds.start;
  const roomEnd = data?.window_end ? Date.parse(data.window_end) : bounds.end;
  const envLanes = useMemo(() => ENV_LANES.map((lane) => {
    const spans = buildEnvSpans(
      envSeries[lane.metric] || [], envRanges?.[lane.metric], ENV_BUCKET_MS,
      { keepOk: lane.banded, start: roomStart, end: roomEnd },
    );
    return { ...lane, spans, worst: worstStatus(spans) };
  }), [envSeries, envRanges, roomStart, roomEnd]);

  const envFlagged = envLanes.filter((l) => l.worst !== 'ok').length;
  const hasEnvData = ENV_METRIC_KEYS.some((k) => (envSeries[k] || []).length > 0);

  const series = useMemo(() => {
    const rows = day?.pulse_ox || [];
    return Object.fromEntries([...SIGNAL_KEYS, 'perfusion'].map(key => [key, signalMinutes(rows, key)]));
  }, [day]);
  const lastReadingTimes = Object.values(series).filter(points => points.length).map(points => points.at(-1).end);
  const lastSample = lastReadingTimes.length ? Math.max(...lastReadingTimes) : null;
  const alarmLimits = useMemo(() => Object.fromEntries(
    SIGNAL_KEYS.map(key => [key, alarmsFor(SIGNALS[key].alarmKey, settings)]),
  ), [settings]);

  const stats = useMemo(() => {
    const val = (key) => series[key]?.map((p) => p.y) ?? [];
    const spo2 = val('spo2');
    const bpm = val('bpm');
    const avg = (a) => (a.length ? a.reduce((s, n) => s + n, 0) / a.length : null);
    const eventTotal = laneKeys
      .filter((k) => k !== 'alerts')
      .reduce((n, k) => n + (data?.[k]?.length || 0), 0);
    return {
      spo2Avg: avg(spo2), spo2Low: spo2.length ? Math.min(...spo2) : null,
      bpmAvg: avg(bpm), bpmHigh: bpm.length ? Math.max(...bpm) : null,
      alerts: data?.alerts?.length || 0,
      events: eventTotal,
    };
  }, [series, data, laneKeys]);

  // Every marker on every lane, normalised to one shape.
  const laneItems = useMemo(() => {
    const out = {};
    laneKeys.forEach((key) => {
      if (key === 'alerts') {
        out.alerts = (data?.alerts || [])
          .filter((a) => a.start)
          .map((a, i) => {
            const start = new Date(a.start).getTime();
            const end = a.end ? new Date(a.end).getTime() : null;
            return {
              id: `alerts-${i}`, type: 'alerts', ts: start, end,
              label: alertLabel(a), alert: a,
            };
          });
      } else {
        out[key] = (data?.[key] || [])
          .filter((it) => it.ts)
          .map((it, i) => ({
            id: `${key}-${i}`, type: key, ts: new Date(it.ts).getTime(),
            label: eventLabel(key, it), item: it,
          }));
      }
    });
    return out;
  }, [data, laneKeys]);

  const lanesWithData = laneKeys.filter((k) => (laneItems[k]?.length || 0) > 0);
  const visibleLanes = lanesExpanded ? laneKeys : laneKeys.slice(0, COLLAPSED_LANES);
  const hiddenWithData = lanesWithData.filter((k) => !visibleLanes.includes(k)).length;

  // Everything on one ordered list, for the activity panel.
  const allEvents = useMemo(
    () => laneKeys.flatMap((k) => laneItems[k] || []).sort((a, b) => b.ts - a.ts),
    [laneItems, laneKeys],
  );

  // The alert covering the scrubbed instant, if any.
  const cursorAlert = useMemo(() => {
    if (cursor == null) return null;
    return (laneItems.alerts || []).find((a) => {
      const end = a.end ?? Date.now();
      return cursor >= a.ts && cursor <= end;
    }) || null;
  }, [cursor, laneItems]);

  const cursorSamples = useMemo(() => Object.fromEntries(
    Object.entries(series).map(([key, minutes]) => [key, sampleAt(minutes, cursor)]),
  ), [series, cursor]);
  const hasCursorSample = Object.values(cursorSamples).some(Boolean);
  const selectedObservations = laneItems.diary?.filter(item => item.ts === cursor) ?? [];

  const nearbyEvents = useMemo(() => {
    if (cursor == null) return [];
    return [...allEvents]
      .sort((a, b) => Math.abs(a.ts - cursor) - Math.abs(b.ts - cursor))
      .slice(0, 5)
      .sort((a, b) => b.ts - a.ts);
  }, [allEvents, cursor]);

  /* ---------------- interaction ---------------- */

  const applyRange = useCallback((minutes, label) => {
    setRangeLabel(label);
    if (minutes >= 1440) {
      setView({ min: bounds.start, max: bounds.end });
      return;
    }
    const span = minutes * 60_000;
    // Centre on the cursor if one is set, else the newest data, else now.
    const centre = cursor ?? lastSample ?? Math.min(Date.now(), bounds.end);
    let min = centre - span / 2;
    let max = centre + span / 2;
    if (min < bounds.start) { min = bounds.start; max = min + span; }
    if (max > bounds.end) { max = bounds.end; min = Math.max(bounds.start, max - span); }
    setView({ min, max });
  }, [bounds, cursor, lastSample]);

  // One finger scrubs; two are left to the zoom plugin's pinch.
  const tsFromClientX = useCallback((clientX) => {
    const el = stackRef.current;
    if (!el || !view) return null;
    const rect = el.getBoundingClientRect();
    const width = rect.width - PLOT_GUTTER - PLOT_RPAD;
    if (width <= 0) return null;
    const frac = Math.min(1, Math.max(0, (clientX - rect.left - PLOT_GUTTER) / width));
    return Math.round(view.min + frac * (view.max - view.min));
  }, [view]);

  const onPointerDown = (e) => {
    if (e.target.closest('button, select')) return;
    pointers.current.add(e.pointerId);
    if (pointers.current.size > 1) return;
    const ts = tsFromClientX(e.clientX);
    if (ts != null) setCursor(ts);
  };
  const onPointerMove = (e) => {
    if (pointers.current.size !== 1 || !pointers.current.has(e.pointerId)) return;
    if (e.pointerType === 'mouse' && e.buttons === 0) return;
    const ts = tsFromClientX(e.clientX);
    if (ts != null) setCursor(ts);
  };
  const endPointer = (e) => { pointers.current.delete(e.pointerId); };

  function inspectEvent(ts) {
    setCursor(ts);
    if (!view || (ts >= view.min && ts <= view.max)) return;
    const span = view.max - view.min;
    const min = Math.max(bounds.start, Math.min(ts - span / 2, bounds.end - span));
    setView({ min, max: min + span });
  }

  const toggleSignal = (key) => {
    setActiveSignals((prev) => {
      if (!prev.includes(key)) return SIGNAL_KEYS.filter((k) => prev.includes(k) || k === key);
      // Never leave the card with nothing in it.
      if (prev.length === 1) return prev;
      return prev.filter((k) => k !== key);
    });
  };

  const shownSignals = SIGNAL_KEYS.filter((k) => activeSignals.includes(k));
  const cursorFrac = cursor != null && view && view.max > view.min
    ? (cursor - view.min) / (view.max - view.min)
    : null;
  const cursorVisible = cursorFrac != null && cursorFrac >= 0 && cursorFrac <= 1;

  /* ---------------- render ---------------- */

  if (!selectedPatient) {
    return <div className="mtl"><p className="mtl-empty">Select a patient to see their day.</p></div>;
  }

  const onToday = selectedDay === today;
  const periodStart = data?.window_start ? clockTime(Date.parse(data.window_start)) : '12:00 AM';
  const windowEnd = Date.parse(data?.window_end);
  const periodEnd = windowEnd <= bounds.end && (!onToday || windowEnd <= Date.now())
    ? clockTime(windowEnd) : (onToday ? 'now' : '11:59 PM');
  const shiftDay = (days) => {
    const next = new Date(selectedDay + 'T00:00:00Z');
    next.setUTCDate(next.getUTCDate() + days);
    const date = next.toISOString().slice(0, 10);
    if ((!firstDay || date >= firstDay) && date <= lastDay) setSelection({ date });
  };

  return (
    <div className="mtl">
      <div className="mtl-datenav">
        <button type="button" className="mtl-navbtn" onClick={() => shiftDay(-1)} disabled={selectedDay === firstDay} aria-label="Previous day">
          <ChevronLeftIcon size={18} />
        </button>
        <button
          type="button"
          className={`mtl-navbtn${selectedDay === lastDay ? ' on' : ''}`}
          onClick={() => setSelection({ date: null })}
        >
          {diaryPath && lastDay !== today ? 'Latest day' : 'Today'}
        </button>
        <button
          type="button"
          className="mtl-navbtn"
          onClick={() => shiftDay(1)}
          disabled={selectedDay >= lastDay}
          aria-label="Next day"
        >
          <ChevronRightIcon size={18} />
        </button>
        <span className="mtl-datepill">
          {new Date(selectedDay + 'T00:00:00Z').toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric' })}
          <CalendarIcon size={16} />
          <input
            type="date"
            aria-label="Pick a date"
            min={firstDay}
            max={lastDay}
            value={selectedDay}
            onChange={(e) => {
              if (!e.target.validity.valid || !e.target.value) return;
              setSelection({ date: e.target.value });
            }}
          />
        </span>
      </div>

      <div className="mtl-head">
        <h2>Day timeline</h2>
        <p>
          {periodStart} &mdash; {periodEnd}
          {zone && ` (${zone})`}
          {lastSample != null && ` · Live data through ${clockTime(new Date(lastSample))}`}
          {data && lastSample == null && !loading && ' · No pulse-ox data this day'}
        </p>
      </div>

      <div className="mtl-stats">
        <div className="mtl-stat">
          <span className="mtl-stat-head" style={{ color: SIGNALS.spo2.color }}>SpO2</span>
          <dl className="mtl-stat-rows">
            <div className="mtl-stat-row">
              <dt>Avg</dt>
              <dd>{stats.spo2Avg == null ? <span className="mtl-stat-empty">—</span>
                : <>{stats.spo2Avg.toFixed(1)}<small>%</small></>}</dd>
            </div>
            <div className="mtl-stat-row">
              <dt>Low</dt>
              <dd>{stats.spo2Low == null ? <span className="mtl-stat-empty">—</span>
                : <>{stats.spo2Low}<small>%</small></>}</dd>
            </div>
          </dl>
        </div>
        <div className="mtl-stat">
          <span className="mtl-stat-head" style={{ color: SIGNALS.bpm.color }}>Heart rate</span>
          <dl className="mtl-stat-rows">
            <div className="mtl-stat-row">
              <dt>Avg</dt>
              <dd>{stats.bpmAvg == null ? <span className="mtl-stat-empty">—</span>
                : <>{Math.round(stats.bpmAvg)}<small>bpm</small></>}</dd>
            </div>
            <div className="mtl-stat-row">
              <dt>High</dt>
              <dd>{stats.bpmHigh == null ? <span className="mtl-stat-empty">—</span>
                : <>{Math.round(stats.bpmHigh)}</>}</dd>
            </div>
          </dl>
        </div>
        <div className="mtl-stat">
          <span className="mtl-stat-head" style={{ color: LANES.alerts.color }}>Alerts</span>
          <span className="mtl-stat-big" style={{ color: LANES.alerts.color }}>{stats.alerts}</span>
        </div>
        <div className="mtl-stat">
          <span className="mtl-stat-head" style={{ color: 'var(--vc-data-live)' }}>Events</span>
          <span className="mtl-stat-big" style={{ color: 'var(--vc-data-live)' }}>{stats.events}</span>
        </div>
      </div>

      <div className="mtl-controls">
        <span className="mtl-chip" aria-disabled="true">
          <FilterIcon size={15} />
          Signals
          <span className="mtl-chip-count">{shownSignals.length}</span>
        </span>
        {SIGNAL_KEYS.map((key) => (
          <button
            key={key}
            type="button"
            className="mtl-sig"
            style={{ '--sig': SIGNALS[key].color }}
            aria-pressed={activeSignals.includes(key)}
            onClick={() => toggleSignal(key)}
          >
            <span className="mtl-sig-dot" />
            {SIGNALS[key].label}
          </button>
        ))}
        <span className="mtl-spacer" />
        <button
          type="button"
          className="mtl-chip accent"
          onClick={() => setLanesExpanded((v) => !v)}
          aria-expanded={lanesExpanded}
        >
          Events
          <span className="mtl-chip-count">{lanesWithData.length}</span>
          <ChevronDownIcon size={15} style={{ transform: lanesExpanded ? 'rotate(180deg)' : 'none' }} />
        </button>
      </div>

      <div className="mtl-ranges" role="group" aria-label="Time range">
        {RANGES.map((r) => (
          <button
            key={r.label}
            type="button"
            className={`mtl-range${rangeLabel === r.label ? ' on' : ''}`}
            aria-pressed={rangeLabel === r.label}
            onClick={() => applyRange(r.minutes, r.label)}
          >
            {r.label}
          </button>
        ))}
      </div>

      {error && <p role="alert" className="mtl-error">{error}</p>}

      {loading && !data && <p className="mtl-empty">Loading the day…</p>}

      {data && (
        <>
          <section className="mtl-card">
            <div className="mtl-card-head"><h3>Signals</h3></div>
            <div
              className="mtl-stack"
              ref={stackRef}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={endPointer}
              onPointerCancel={endPointer}
              onPointerLeave={endPointer}
            >
              {shownSignals.map((key, i) => (
                <SignalChart
                  key={key}
                  signalKey={key}
                  clocks={clocks}
                  points={series[key]}
                  view={view}
                  bounds={bounds}
                  alerts={laneItems.alerts}
                  alarms={alarmLimits[key]}
                  cursor={cursor}
                  sample={cursorSamples[key]}
                  showAxis={i === shownSignals.length - 1}
                  onViewChange={(next) => { setView(next); setRangeLabel(null); }}
                />
              ))}

              <div className="mtl-lanes">
                <div className="mtl-lanes-title">Event lanes</div>
                {visibleLanes.map((key) => (
                  <EventLane
                    key={key}
                    laneKey={key}
                    clockTime={clockTime}
                    items={laneItems[key] || []}
                    view={view}
                    cursor={cursor}
                    onPick={inspectEvent}
                  />
                ))}
                {(hiddenWithData > 0 || lanesExpanded) && (
                  <button type="button" className="mtl-more" onClick={() => setLanesExpanded((v) => !v)}>
                    <ChevronDownIcon
                      size={14}
                      style={{ transform: lanesExpanded ? 'rotate(180deg)' : 'none' }}
                    />
                    {lanesExpanded ? 'Fewer lanes' : `+${laneKeys.length - COLLAPSED_LANES} more`}
                  </button>
                )}
              </div>

              <div className="mtl-lanes mtl-envlanes">
                <div className="mtl-lanes-title">
                  <span>Room conditions</span>
                  {roomLocations.length > 1 && (
                    <select
                      className="mtl-roompick"
                      aria-label="Room"
                      value={roomLocation ?? ''}
                      onChange={(e) => setRoomLocation(e.target.value)}
                    >
                      {roomLocations.map((loc) => (
                        <option key={loc || '__none__'} value={loc}>
                          {loc || 'Unspecified room'}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
                {!hasEnvData ? (
                  <p className="mtl-lane-note">No room readings for this day.</p>
                ) : (
                  <>
                    {envLanes.map((lane) => (
                      <EnvLane key={lane.metric} lane={lane} view={view} clockTime={clockTime} />
                    ))}
                    <p className="mtl-lane-note">
                      {envFlagged === 0
                        ? 'In range all day.'
                        : `${envFlagged} of ${envLanes.length} out of range at some point.`}
                    </p>
                  </>
                )}
              </div>


              {cursorVisible && (
                <div className="mtl-plotbox">
                  <div className="mtl-scrub" style={{ left: `${cursorFrac * 100}%` }}>
                    <span className="mtl-scrub-pill">{clockTime(new Date(cursor))}</span>
                  </div>
                </div>
              )}
            </div>
          </section>

          <p className="mtl-hint">Drag to inspect · pinch or scroll to zoom</p>

          <section className="mtl-detail">
            <div className="mtl-detail-main">
              <div className="mtl-detail-top">
                <span className="mtl-detail-time">
                  {cursor == null ? '—' : clockTime(new Date(cursor))}
                </span>
                {cursorAlert && (
                  <span className={`mtl-badge${cursorAlert.end ? '' : ' ongoing'}`}>
                    {cursorAlert.end ? alertLabel(cursorAlert.alert) : 'Alert ongoing'}
                  </span>
                )}
              </div>

              {cursor == null ? (
                <p className="mtl-detail-foot" style={{ border: 'none', margin: 0, paddingTop: 0 }}>
                  Drag across the charts to read a moment.
                </p>
              ) : (
                <>
                  <dl className="mtl-readout">
                    <div>
                      <dt style={{ color: SIGNALS.spo2.color }}>SpO2</dt>
                      <dd>{cursorSamples.spo2
                        ? <>{cursorSamples.spo2.y}<small>%</small></>
                        : <span className="mtl-stat-empty">—</span>}</dd>
                    </div>
                    <div>
                      <dt style={{ color: SIGNALS.bpm.color }}>Heart rate</dt>
                      <dd>{cursorSamples.bpm
                        ? <>{Math.round(cursorSamples.bpm.y)}<small>bpm</small></>
                        : <span className="mtl-stat-empty">—</span>}</dd>
                    </div>
                    <div>
                      <dt style={{ color: 'var(--vc-text-secondary)' }}>Perfusion</dt>
                      <dd>{cursorSamples.perfusion
                        ? cursorSamples.perfusion.y
                        : <span className="mtl-stat-empty">—</span>}</dd>
                    </div>
                  </dl>
                  {selectedObservations.map(({ item: { entry } }) => (
                    <div key={entry.id} className="mtl-diary-observation">
                      <strong>{entry.label}</strong>
                      {entry.note && <p>{entry.note}</p>}
                      {entry.question && <p>{entry.question} {entry.answer || 'Not recorded'}</p>}
                      {onEditObservation && <button type="button" className="cfg-ghost"
                        onClick={() => onEditObservation(entry)} aria-label={`Edit ${entry.label}`}>Edit</button>}
                    </div>
                  ))}
                  {cursorAlert && (
                    <p className="mtl-detail-foot">
                      {cursorAlert.end
                        ? <>Duration <b>{formatDuration(cursorAlert.end - cursorAlert.ts)}</b></>
                        : <>Started <b>{clockTime(new Date(cursorAlert.ts))}</b> · still open</>}
                      {cursorAlert.alert.spo2_min != null && <> · low <b>{cursorAlert.alert.spo2_min}%</b></>}
                      {cursorAlert.alert.oxygen_used && <> · oxygen used</>}
                    </p>
                  )}
                  {!hasCursorSample && (
                    <p className="mtl-detail-foot">No pulse-ox reading at this time.</p>
                  )}
                </>
              )}
            </div>

            <div className="mtl-detail-side">
              <span className="mtl-label">Around this time</span>
              {cursor == null ? (
                <p className="mtl-detail-foot" style={{ border: 'none', paddingTop: '0.4rem' }}>
                  Nothing selected yet.
                </p>
              ) : nearbyEvents.length === 0 ? (
                <p className="mtl-detail-foot" style={{ border: 'none', paddingTop: '0.4rem' }}>
                  No events logged this day.
                </p>
              ) : (
                <p className="mtl-detail-foot" style={{ border: 'none', paddingTop: '0.4rem' }}>
                  <b>{nearbyEvents.length}</b> nearest {nearbyEvents.length === 1 ? 'entry' : 'entries'} listed below.
                </p>
              )}
            </div>
          </section>

          <section className="mtl-activity">
            <div className="mtl-activity-head">
              <h3>{cursor == null ? 'Activity' : `Activity around ${clockTime(new Date(cursor))}`}</h3>
              <span className="mtl-label">{allEvents.length} total</span>
            </div>
            {allEvents.length === 0 ? (
              <p className="mtl-empty">Nothing was logged on this day.</p>
            ) : (
              (cursor == null ? allEvents.slice(0, 8) : nearbyEvents).map((ev) => {
                const lane = ev.type === 'diary' ? DIARY_LANE : LANES[ev.type];
                const Icon = lane.Icon;
                const on = cursor != null && Math.abs(ev.ts - cursor) < 60_000;
                return (
                  <button
                    key={ev.id}
                    type="button"
                    className={`mtl-row${on ? ' on' : ''}`}
                    style={{ '--lane': lane.color }}
                    onClick={() => inspectEvent(ev.ts)}
                  >
                    <span className="mtl-row-icon"><Icon size={16} /></span>
                    <span className="mtl-row-time">{clockTime(new Date(ev.ts))}</span>
                    <span className="mtl-row-text">{ev.label}</span>
                  </button>
                );
              })
            )}
          </section>
        </>
      )}
    </div>
  );
}

/* One signal, one scale. Every chart on the page is this component, so the
 * two can never drift apart in axis geometry or option shape. */
const SignalChart = ({
  signalKey, points, view, bounds, alerts, alarms, cursor, sample, showAxis, onViewChange, clocks,
}) => {
  const cfg = SIGNALS[signalKey];
  // Canvas needs literal colours; `version` bumps when the palette changes.
  const { version } = useThemeTokens();
  const canvasRef = useRef(null);
  const chartRef = useRef(null);
  const onViewChangeRef = useRef(onViewChange);
  onViewChangeRef.current = onViewChange;

  /* Y is fixed for the whole day rather than refitted to each window, so
   * panning and zooming move across a stable scale instead of rescaling under
   * the reader. niceScale only rounds the bounds outward, which is what keeps
   * the ticks reading 85 / 90 / 95 instead of 85.8. */
  const yRange = useMemo(() => {
    if (!points.length) {
      return niceScale(cfg.defaultMin, cfg.defaultMax, cfg.minPad, cfg.clampMax);
    }
    const ys = points.map((p) => p.y);
    return niceScale(Math.min(...ys), Math.max(...ys), cfg.minPad, cfg.clampMax);
  }, [points, cfg]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;

    const annotations = {};
    const chrome = chartChrome();
    (alerts || []).forEach((a, i) => {
      annotations[`band${i}`] = {
        type: 'box',
        xMin: a.ts,
        xMax: a.end ?? bounds.end,
        backgroundColor: chrome.band,
        borderColor: chrome.bandEdge,
        borderWidth: 0,
        drawTime: 'beforeDatasetsDraw',
      };
    });
    if (alarms?.low != null) annotations.low = thresholdLine(alarms.low, `LOW ${alarms.low}`);
    if (alarms?.high != null) annotations.high = thresholdLine(alarms.high, `HIGH ${alarms.high}`);

    const chart = new Chart(canvas.getContext('2d'), {
      type: 'line',
      data: {
        datasets: [{
          label: cfg.axisLabel,
          data: tracePoints(points),
          parsing: false,
          borderColor: readToken(cfg.token),
          pointBackgroundColor: readToken(cfg.token),
          borderWidth: 1.4,
          pointRadius: ({ raw }) => raw?.isolated ? 2 : 0,
          pointHitRadius: 0,
          tension: 0.15,
          spanGaps: false,
        }],
      },
      options: stackedChartOptions({
        view, bounds, yRange, showAxis, annotations,
        minRangeMs: MIN_RANGE_MS,
        formatTimeTick(value) {
          return this.max - this.min <= 5 * 60_000 ? clocks.second(value) : clocks.minute(value);
        },
        onViewChange: (next) => onViewChangeRef.current(next),
      }),
    });
    chartRef.current = chart;
    return () => { chart.destroy(); chartRef.current = null; };
    // View is applied imperatively below so a pan doesn't rebuild the chart.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [points, alerts, alarms, bounds, showAxis, cfg, yRange, version, clocks]);

  // Both charts follow one window. Guarded so the chart that raised the zoom
  // doesn't get re-set to the value it just reported.
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || !view) return;
    if (chart.scales.x.min === view.min && chart.scales.x.max === view.max) return;
    chart.zoomScale('x', { min: view.min, max: view.max }, 'none');
  }, [view]);

  // The scrubbed point, drawn as a dot on this series.
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    const anns = chart.options.plugins.annotation.annotations;
    delete anns.cursor;
    if (sample) {
      anns.cursor = {
        type: 'point',
        xValue: Math.min(sample.end, Math.max(sample.x, cursor)),
        yValue: sample.y,
        radius: 4,
        backgroundColor: readToken(cfg.token),
        borderColor: chartChrome().grid,
        borderWidth: 1,
      };
    }
    chart.update('none');
  }, [cursor, sample, cfg, version, alerts, alarms, bounds, showAxis, yRange, clocks]);

  return (
    <div className={`mtl-chart${showAxis ? ' tall' : ''}`}>
      <span className="mtl-chart-title" style={{ color: cfg.color }}>{cfg.axisLabel}</span>
      <canvas ref={canvasRef} aria-label={`${cfg.label} over time`} />
    </div>
  );
};

/* One row of markers, sharing the charts' time window and plot box. */
const EventLane = ({ laneKey, items, view, cursor, onPick, clockTime }) => {
  const lane = laneKey === 'diary' ? DIARY_LANE : LANES[laneKey];
  const span = view ? view.max - view.min : 0;
  const inWindow = span > 0
    ? items.filter((it) => it.ts >= view.min && it.ts <= view.max)
    : [];

  return (
    <div className="mtl-lane" style={{ '--lane': lane.color }}>
      <span className="mtl-lane-name">{lane.label}</span>
      <div className="mtl-lane-track">
        {inWindow.length === 0 && <span className="mtl-lane-empty">—</span>}
        {inWindow.map((it) => (
          <button
            key={it.id}
            type="button"
            className={`mtl-lane-mark${laneKey === 'alerts' ? ' alert' : ''}`
              + (cursor != null && Math.abs(it.ts - cursor) < 60_000 ? ' on' : '')}
            style={{ left: `${((it.ts - view.min) / span) * 100}%` }}
            title={`${clockTime(new Date(it.ts))} — ${it.label}`}
            aria-label={`${clockTime(new Date(it.ts))} ${it.label}`}
            onClick={() => onPick(it.ts)}
          />
        ))}
      </div>
    </div>
  );
};

/* One room metric across the window.
 *
 * Severity is the colour; direction is the position. A high excursion draws in
 * the top half of the lane and a low one in the bottom half, so "too hot" and
 * "too cold" are distinguishable without reading a glyph or relying on the
 * colour alone. Banded lanes (PM2.5) fill the whole height because every band
 * including the good one is worth seeing. */
const EnvLane = ({ lane, view, clockTime }) => {
  const span = view ? view.max - view.min : 0;
  const unit = ENV_UNITS[lane.metric] || '';
  const visible = span > 0
    ? lane.spans.filter((s) => s.to > view.min && s.from < view.max)
    : [];

  return (
    <div className="mtl-lane">
      <span className="mtl-lane-name">{lane.label}</span>
      <div className="mtl-lane-track">
        {visible.length === 0 && <span className="mtl-lane-empty">—</span>}
        {visible.map((s) => {
          const from = Math.max(s.from, view.min);
          const to = Math.min(s.to, view.max);
          const dir = directionOf(s.status);
          const sev = severityOf(s.status);
          return (
            <span
              key={`${s.from}-${s.status}`}
              className={`mtl-env-span sev-${sev}${lane.banded ? ' banded' : ` dir-${dir}`}`}
              style={{
                left: `${((from - view.min) / span) * 100}%`,
                width: `${Math.max(((to - from) / span) * 100, 0.4)}%`,
              }}
              title={`${clockTime(new Date(s.from))} — ${describeSpan(lane.label, s, unit)}`}
            >
              <span className="sr-only">{describeSpan(lane.label, s, unit)}</span>
            </span>
          );
        })}
      </div>
    </div>
  );
};

export default function AdminV2MonitoringTimeline() {
  const { selectedPatient } = useAdminPatient();
  return <PatientDayTimeline key={selectedPatient?.id} patient={selectedPatient} />;
}
