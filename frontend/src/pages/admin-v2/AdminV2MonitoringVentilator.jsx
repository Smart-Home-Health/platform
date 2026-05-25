import React, { useEffect, useMemo, useState } from 'react';
import {
  ResponsiveContainer, ComposedChart, CartesianGrid, XAxis, YAxis,
  Tooltip, Area, Line,
} from 'recharts';
import config from '../../config';
import { ChevronLeftIcon, ChevronRightIcon, ClockIcon, XIcon } from '../../components/Icons';

const GROUP_COLORS = {
  Ventilation: '#3b82f6',
  Oxygen:      '#3fb950',
  Cough:       '#f0883e',
  Suction:     '#bb8009',
  Nebulizer:   '#a371f7',
  System:      '#6b7280',
  Config:      '#6b7280',
  Other:       '#6b7280',
};

const fmtDateLong = (iso) => {
  if (!iso) return '';
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString(undefined, {
    weekday: 'long', month: 'short', day: 'numeric', year: 'numeric',
  });
};

const fmtTime = (iso) => {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString(undefined, {
    hour: 'numeric', minute: '2-digit', hour12: true,
  });
};

const fmtNum = (v, precision) => {
  if (v == null) return '—';
  const p = (precision != null && precision >= 0) ? Math.min(precision, 4) : 2;
  if (Math.abs(v) >= 1000) return v.toFixed(0);
  return v.toFixed(p);
};

const AdminV2MonitoringVentilator = ({ patientId }) => {
  const [daysLoading, setDaysLoading] = useState(true);
  const [hasIntegration, setHasIntegration] = useState(true);
  const [days, setDays] = useState([]);  // [{date, sample_count}]
  const [selectedDate, setSelectedDate] = useState(null);
  const [dayLoading, setDayLoading] = useState(false);
  const [dayData, setDayData] = useState(null);
  const [error, setError] = useState(null);

  // Drill-down chart modal
  const [detail, setDetail] = useState(null);   // { parameter, accent } when open
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailData, setDetailData] = useState(null);
  const [detailError, setDetailError] = useState(null);

  // Fetch the days list once per patient.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setDaysLoading(true);
      setError(null);
      try {
        const res = await fetch(
          `${config.apiUrl}/api/integrations/patient/${patientId}/vent/days`,
          { credentials: 'include' }
        );
        if (!res.ok) throw new Error(`Failed to load days (${res.status})`);
        const data = await res.json();
        if (cancelled) return;
        setHasIntegration(!!data.has_integration);
        setDays(data.days || []);
        // Default to most recent day with data.
        if ((data.days || []).length > 0) {
          setSelectedDate(data.days[0].date);
        }
      } catch (e) {
        if (!cancelled) setError(e.message);
      } finally {
        if (!cancelled) setDaysLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [patientId]);

  // Fetch the drill-down series when a parameter is picked.
  useEffect(() => {
    if (!detail || !selectedDate) {
      setDetailData(null);
      return;
    }
    let cancelled = false;
    (async () => {
      setDetailLoading(true);
      setDetailError(null);
      try {
        const res = await fetch(
          `${config.apiUrl}/api/integrations/patient/${patientId}/vent/day/${selectedDate}/parameter/${detail.parameter.parameter_key}`,
          { credentials: 'include' }
        );
        if (!res.ok) throw new Error(`Failed to load chart (${res.status})`);
        const data = await res.json();
        if (!cancelled) setDetailData(data);
      } catch (e) {
        if (!cancelled) setDetailError(e.message);
      } finally {
        if (!cancelled) setDetailLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [detail, selectedDate, patientId]);

  // Fetch the selected day's stats.
  useEffect(() => {
    if (!selectedDate) return;
    let cancelled = false;
    (async () => {
      setDayLoading(true);
      setError(null);
      try {
        const res = await fetch(
          `${config.apiUrl}/api/integrations/patient/${patientId}/vent/day/${selectedDate}`,
          { credentials: 'include' }
        );
        if (!res.ok) throw new Error(`Failed to load day (${res.status})`);
        const data = await res.json();
        if (!cancelled) setDayData(data);
      } catch (e) {
        if (!cancelled) setError(e.message);
      } finally {
        if (!cancelled) setDayLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [patientId, selectedDate]);

  // Day-list-aware prev/next/today helpers (skip empty dates).
  const dateIndex = useMemo(() => {
    const idx = days.findIndex(d => d.date === selectedDate);
    return { idx, total: days.length };
  }, [days, selectedDate]);

  const goPrev = () => {
    // newer = lower index (days sorted DESC). "Prev" in calendar sense = older = idx+1.
    if (dateIndex.idx < days.length - 1) setSelectedDate(days[dateIndex.idx + 1].date);
  };
  const goNext = () => {
    if (dateIndex.idx > 0) setSelectedDate(days[dateIndex.idx - 1].date);
  };
  const goNewest = () => {
    if (days.length > 0) setSelectedDate(days[0].date);
  };

  if (daysLoading) {
    return <div style={{ padding: 24, color: '#a0aec0' }}>Loading ventilator data…</div>;
  }
  if (!hasIntegration) {
    return (
      <div style={{
        padding: 30, color: '#a0aec0',
        background: 'rgba(255,255,255,0.04)',
        border: '1px dashed rgba(255,255,255,0.15)',
        borderRadius: 8, textAlign: 'center',
      }}>
        <p style={{ margin: '0 0 8px 0', color: '#e6edf3', fontSize: 16, fontWeight: 600 }}>
          No ventilator integration
        </p>
        <p style={{ margin: 0 }}>
          Configure a Ventilator integration under <em>Configuration → Integrations</em> and upload a log export.
        </p>
      </div>
    );
  }
  if (days.length === 0) {
    return (
      <div style={{
        padding: 30, color: '#a0aec0',
        background: 'rgba(255,255,255,0.04)',
        border: '1px dashed rgba(255,255,255,0.15)',
        borderRadius: 8, textAlign: 'center',
      }}>
        <p style={{ margin: '0 0 8px 0', color: '#e6edf3', fontSize: 16, fontWeight: 600 }}>
          No vent samples yet
        </p>
        <p style={{ margin: 0 }}>
          Upload a log export via the integration's <em>Logs</em> button to populate this view.
        </p>
      </div>
    );
  }

  const selectedCount = days.find(d => d.date === selectedDate)?.sample_count || 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Date controls */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
        padding: '12px 14px',
        background: 'rgba(255,255,255,0.04)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 10,
      }}>
        <button
          onClick={goPrev}
          disabled={dateIndex.idx >= days.length - 1}
          style={navBtn(dateIndex.idx >= days.length - 1)}
          title="Older day with data"
        ><ChevronLeftIcon size={16} /></button>

        <select
          value={selectedDate || ''}
          onChange={e => setSelectedDate(e.target.value)}
          style={{
            padding: '8px 12px', borderRadius: 6,
            background: '#2d3748', color: '#fff',
            border: '1px solid rgba(255,255,255,0.15)',
            fontSize: 14, fontWeight: 600, cursor: 'pointer',
          }}
        >
          {days.map(d => (
            <option key={d.date} value={d.date}>
              {fmtDateLong(d.date)} — {d.sample_count.toLocaleString()} samples
            </option>
          ))}
        </select>

        <button
          onClick={goNext}
          disabled={dateIndex.idx <= 0}
          style={navBtn(dateIndex.idx <= 0)}
          title="Newer day with data"
        ><ChevronRightIcon size={16} /></button>

        <button
          onClick={goNewest}
          disabled={dateIndex.idx === 0}
          style={{
            padding: '8px 14px', borderRadius: 6, border: 'none',
            background: dateIndex.idx === 0 ? 'rgba(255,255,255,0.08)' : '#3b82f6',
            color: dateIndex.idx === 0 ? '#a0aec0' : '#fff',
            cursor: dateIndex.idx === 0 ? 'not-allowed' : 'pointer',
            fontSize: 13, fontWeight: 600,
          }}
        >Newest</button>

        <span style={{ marginLeft: 'auto', color: '#a0aec0', fontSize: 12 }}>
          {dateIndex.idx + 1} of {dateIndex.total}
        </span>
      </div>

      {/* Vendor-encoding caveat — kept small so it doesn't dominate the page. */}
      <div style={{
        padding: '8px 12px', borderRadius: 6,
        background: 'rgba(96,165,250,0.08)',
        border: '1px solid rgba(96,165,250,0.25)',
        color: '#a0aec0', fontSize: 12, lineHeight: 1.4,
      }}>
        <strong style={{ color: '#93c5fd' }}>Note:</strong> headline values use VOCSN's median (50th percentile) aggregate
        to match the device's own report. Some parameters (e.g. PEEP, MAP, ambient pressure) may still
        display in raw vendor units — we apply parameter-specific scaling as it's identified.
      </div>

      {/* Day summary */}
      {dayData?.summary && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: 10,
        }}>
          <SummaryTile label="Date" value={fmtDateLong(dayData.date)} />
          <SummaryTile
            label="Total Samples"
            value={dayData.summary.total_samples.toLocaleString()}
          />
          <SummaryTile
            label="Parameters Active"
            value={dayData.summary.parameter_count}
          />
          <SummaryTile
            label="Time Range"
            value={dayData.summary.first_at
              ? `${fmtTime(dayData.summary.first_at)} → ${fmtTime(dayData.summary.last_at)}`
              : '—'}
          />
        </div>
      )}

      {dayLoading && (
        <div style={{ padding: 24, color: '#a0aec0', textAlign: 'center' }}>
          Loading day…
        </div>
      )}

      {error && (
        <div role="alert" style={{
          padding: '12px 14px', borderRadius: 8,
          background: 'rgba(220,53,69,0.15)',
          border: '1px solid rgba(220,53,69,0.5)',
          color: '#f8d7da', fontSize: 13,
        }}>{error}</div>
      )}

      {/* Grouped parameter cards */}
      {!dayLoading && dayData?.groups?.map(group => {
        const color = GROUP_COLORS[group.name] || GROUP_COLORS.Other;
        return (
          <div key={group.name} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              paddingBottom: 6,
              borderBottom: `2px solid ${color}`,
            }}>
              <span style={{
                width: 12, height: 12, borderRadius: '50%', background: color,
              }} />
              <h3 style={{ margin: 0, color: '#e6edf3', fontSize: 16, fontWeight: 700 }}>
                {group.name}
              </h3>
              <span style={{
                color: '#a0aec0', fontSize: 12, marginLeft: 'auto',
              }}>{group.parameters.length} parameter{group.parameters.length === 1 ? '' : 's'}</span>
            </div>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
              gap: 8,
            }}>
              {group.parameters.map(p => (
                <ParameterCard
                  key={p.parameter_key}
                  p={p}
                  accent={color}
                  onOpen={() => setDetail({ parameter: p, accent: color })}
                />
              ))}
            </div>
          </div>
        );
      })}

      {detail && (
        <ParameterDetailModal
          detail={detail}
          date={selectedDate}
          loading={detailLoading}
          data={detailData}
          error={detailError}
          onClose={() => { setDetail(null); setDetailData(null); }}
        />
      )}
    </div>
  );
};

// ---- small subcomponents ----

const navBtn = (disabled) => ({
  padding: '8px 10px', borderRadius: 6,
  border: '1px solid rgba(255,255,255,0.15)',
  background: 'transparent', color: disabled ? '#4a5568' : '#e6edf3',
  cursor: disabled ? 'not-allowed' : 'pointer',
  display: 'inline-flex', alignItems: 'center',
});

const SummaryTile = ({ label, value }) => (
  <div style={{
    background: '#1a2332', borderRadius: 10,
    border: '1px solid rgba(255,255,255,0.08)',
    padding: '10px 14px',
  }}>
    <div style={{
      color: '#a0aec0', fontSize: 11, fontWeight: 600,
      textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4,
    }}>{label}</div>
    <div style={{ color: '#e6edf3', fontSize: 16, fontWeight: 700 }}>{value}</div>
  </div>
);

const ParameterCard = ({ p, accent, onOpen }) => {
  // VOCSN encodes statistical aggregates per sample window:
  //   _50 = median, _5 = 5th percentile, _95 = 95th percentile,
  //   _N  = period count / raw single-sample (not a clinical value).
  // The vendor's own report plots median ± 5/95 band, so we do the same.
  const median = p.stats_by_suffix['50'];
  const p5 = p.stats_by_suffix['5'];
  const p95 = p.stats_by_suffix['95'];
  const raw = p.stats_by_suffix['N'] || p.stats_by_suffix[''];
  const hasMedian = !!median;

  // Headline uses median when present, else falls back to the raw _N column.
  // Min/Max under it are the day's bounds on the median (not on raw samples).
  const headline = hasMedian ? median : raw;
  const fallbackLabel = hasMedian ? null : 'raw';
  const lowBand = p5?.mean ?? p5?.lo;
  const highBand = p95?.mean ?? p95?.hi;
  const sampleCount = (median?.n) ?? (raw?.n) ?? p.total_samples;

  return (
    <button
      type="button"
      onClick={onOpen}
      style={{
        // Reset native <button> styling so the card renders identically.
        font: 'inherit', color: 'inherit', cursor: 'pointer', textAlign: 'left',
        appearance: 'none',
        background: '#1a2332',
        border: '1px solid rgba(255,255,255,0.08)',
        borderLeft: `4px solid ${accent}`,
        borderRadius: 10, padding: '10px 12px',
        display: 'flex', flexDirection: 'column', gap: 6,
        transition: 'border-color 0.15s, transform 0.05s',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.borderColor = accent; }}
      onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'; }}
      onMouseDown={(e) => { e.currentTarget.style.transform = 'scale(0.99)'; }}
      onMouseUp={(e) => { e.currentTarget.style.transform = ''; }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
        <span style={{ color: '#e6edf3', fontWeight: 600, fontSize: 14, lineHeight: 1.2 }}>
          {p.display_label}
        </span>
        <span style={{ color: '#6b7280', fontSize: 11 }}>#{p.parameter_key}</span>
      </div>
      {p.display_units && (
        <span style={{ color: '#a0aec0', fontSize: 11 }}>{p.display_units}</span>
      )}

      {headline && (
        <div style={{
          display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 4,
          marginTop: 2,
        }}>
          <MetricChip label="day low" value={fmtNum(headline.lo, p.precision)} />
          <MetricChip
            label={hasMedian ? 'median' : (fallbackLabel || 'value')}
            value={fmtNum(headline.mean, p.precision)}
            highlight
          />
          <MetricChip label="day high" value={fmtNum(headline.hi, p.precision)} />
        </div>
      )}

      {hasMedian && (lowBand != null || highBand != null) && (
        <div style={{
          color: '#a0aec0', fontSize: 11,
          padding: '4px 6px', borderRadius: 4,
          background: 'rgba(255,255,255,0.03)',
        }}>
          5–95% typical:{' '}
          <strong style={{ color: '#cbd5e0' }}>
            {fmtNum(lowBand, p.precision)} – {fmtNum(highBand, p.precision)}
          </strong>
        </div>
      )}

      <div style={{ color: '#6b7280', fontSize: 11, marginTop: 2, display: 'flex', justifyContent: 'space-between' }}>
        <span>
          {sampleCount.toLocaleString()} samples
          {!hasMedian && (
            <span style={{ marginLeft: 6, color: '#f0b400' }}>
              (no median — showing raw _N)
            </span>
          )}
        </span>
        <span style={{ color: accent, opacity: 0.7 }}>chart →</span>
      </div>
    </button>
  );
};

// Drill-down chart: line+band of one parameter over the selected day.
const ParameterDetailModal = ({ detail, date, loading, data, error, onClose }) => {
  const { parameter, accent } = detail;
  const chartData = useMemo(() => {
    if (!data?.points) return [];
    return data.points
      .filter(p => p.p50 != null || p.p5 != null || p.p95 != null)
      .map(p => ({
        ts: new Date(p.ts).getTime(),
        // Recharts Area needs separate keys for the band edges.
        p50: p.p50,
        p5:  p.p5,
        p95: p.p95,
        // For the band: render as [p5, p95] via a single dataKey returning an array.
        band: (p.p5 != null && p.p95 != null) ? [p.p5, p.p95] : null,
      }));
  }, [data]);

  const fmtTickTime = (t) => new Date(t).toLocaleTimeString(undefined,
    { hour: 'numeric', hour12: true });
  const fmtTooltipTime = (t) => new Date(t).toLocaleString(undefined,
    { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true });

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0,
        backgroundColor: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(6px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 1070,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#1a2332',
          border: '1px solid rgba(255,255,255,0.08)',
          borderLeft: `5px solid ${accent}`,
          borderRadius: 12, padding: 20,
          width: '95%', maxWidth: 820, maxHeight: '90vh',
          overflow: 'auto', color: '#e6edf3',
          boxShadow: '0 20px 40px rgba(0,0,0,0.4)',
        }}
      >
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
          gap: 12, marginBottom: 6,
        }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>
              {parameter.display_label}
              {parameter.display_units && (
                <span style={{ color: '#a0aec0', fontWeight: 500, fontSize: 14, marginLeft: 8 }}>
                  {parameter.display_units}
                </span>
              )}
            </h3>
            <div style={{ color: '#a0aec0', fontSize: 12, marginTop: 2 }}>
              {date} · #{parameter.parameter_key}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#a0aec0', padding: 0 }}
            aria-label="Close"
          ><XIcon size={20} /></button>
        </div>

        {loading && (
          <div style={{ padding: 30, color: '#a0aec0', textAlign: 'center' }}>Loading…</div>
        )}
        {error && (
          <div role="alert" style={{
            padding: '10px 12px', borderRadius: 6, margin: '12px 0',
            background: 'rgba(220,53,69,0.15)',
            border: '1px solid rgba(220,53,69,0.5)',
            color: '#f8d7da', fontSize: 13,
          }}>{error}</div>
        )}

        {!loading && data && chartData.length === 0 && (
          <div style={{
            padding: 30, color: '#a0aec0', textAlign: 'center',
            background: 'rgba(255,255,255,0.04)',
            border: '1px dashed rgba(255,255,255,0.15)',
            borderRadius: 8, margin: '12px 0',
          }}>No points to plot for this parameter on this day.</div>
        )}

        {!loading && chartData.length > 0 && (
          <div style={{ marginTop: 12, padding: '4px 0' }}>
            <ResponsiveContainer width="100%" height={320}>
              <ComposedChart data={chartData} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis
                  dataKey="ts"
                  type="number"
                  domain={['dataMin', 'dataMax']}
                  tickFormatter={fmtTickTime}
                  tick={{ fontSize: 10, fill: '#9ca3af' }}
                  minTickGap={40}
                />
                <YAxis tick={{ fontSize: 10, fill: '#9ca3af' }} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#1f2937', border: 'none', borderRadius: 8 }}
                  labelFormatter={fmtTooltipTime}
                  formatter={(value, name) => {
                    if (Array.isArray(value)) return [`${value[0]} – ${value[1]}`, '5–95% band'];
                    return [value, name === 'p50' ? 'median' : name];
                  }}
                />
                <Area type="monotone" dataKey="band" stroke="none"
                      fill={accent} fillOpacity={0.18} connectNulls />
                <Line type="monotone" dataKey="p50" stroke={accent}
                      strokeWidth={2} dot={false} connectNulls />
              </ComposedChart>
            </ResponsiveContainer>
            <div style={{ color: '#6b7280', fontSize: 11, marginTop: 6 }}>
              Line = median ({parameter.stats_by_suffix?.['50']?.n || 0} samples).
              Shaded band = 5th–95th percentile.
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

const MetricChip = ({ label, value, highlight }) => (
  <div style={{
    background: highlight ? 'rgba(63,185,80,0.08)' : 'rgba(255,255,255,0.04)',
    border: `1px solid ${highlight ? 'rgba(63,185,80,0.3)' : 'rgba(255,255,255,0.08)'}`,
    borderRadius: 6, padding: '4px 6px',
    textAlign: 'center',
  }}>
    <div style={{
      color: '#6b7280', fontSize: 9, fontWeight: 600,
      textTransform: 'uppercase', letterSpacing: 0.5,
    }}>{label}</div>
    <div style={{
      color: highlight ? '#9ae6b4' : '#e6edf3',
      fontSize: 13, fontWeight: 700,
    }}>{value}</div>
  </div>
);

export default AdminV2MonitoringVentilator;
