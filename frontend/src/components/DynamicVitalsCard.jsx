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
import React, { useState, useMemo } from 'react';
import { LineChart, Line, ResponsiveContainer, YAxis, XAxis, Tooltip } from "recharts";
import NutritionGaugeCard from './dashboard/NutritionGaugeCard';
import QuickAddVitalModal from './vitals/QuickAddVitalModal';
import { CHART_CHROME } from '../contexts/DashboardThemeContext';

/* Everything below the component is pure and lives at module scope on purpose.
 * This card sits on the live dashboard, which re-renders at ~1 Hz; helpers
 * (and especially the tooltip) declared inside the render body get a new
 * identity every tick, and a new *component type* makes recharts tear down and
 * remount the tooltip subtree each time. The card itself is memoized, so with
 * stable props it now only re-renders when its data actually changes. */

// ---- Formatting helpers ---------------------------------------------------

// Format display value based on vital type
const formatDisplayValue = (item, vitalType) => {
  if (!item) return '--';

  switch (vitalType) {
    case 'blood_pressure':
      if (item.systolic && item.diastolic) {
        // Show "systolic/diastolic (MAP)" format
        return `${item.systolic}/${item.diastolic}${item.map ? ` (${item.map})` : ''}`;
      }
      return item.map ? `MAP: ${item.map}` : '--';
    case 'temperature':
      if (item.body) {
        return `${item.body}°F${item.skin ? ` (Skin: ${item.skin}°F)` : ''}`;
      }
      return item.value ? `${item.value}°F` : '--';
    case 'weight':
      return item.value ? `${item.value} lbs` : '--';
    case 'calories':
      return item.value ? `${item.value} cal` : '--';
    case 'water':
      return item.value ? `${item.value} ml` : '--';
    default:
      return item.value ? `${item.value}` : '--';
  }
};

// Format time display as time delta from now
const formatDateTime = (dateTimeStr) => {
  if (!dateTimeStr) return "Unknown";

  try {
    let date;

    // Handle different datetime formats from backend
    if (typeof dateTimeStr === 'string') {
      // All datetime strings should now be consistent from backend
      date = new Date(dateTimeStr);
    } else if (typeof dateTimeStr === 'object' && dateTimeStr !== null) {
      // Handle objects (could be a Date or datetime-like object)
      if (dateTimeStr instanceof Date) {
        date = dateTimeStr;
      } else {
        // Try to extract date info from object structure
        date = new Date(dateTimeStr.toString());
      }
    } else if (typeof dateTimeStr === 'number') {
      // Handle timestamp
      date = new Date(dateTimeStr);
    } else {
      // Fallback: try direct conversion
      date = new Date(dateTimeStr);
    }

    // Ensure we have a valid date
    if (!date || isNaN(date.getTime())) {
      return "Unknown time";
    }

    const now = new Date();
    const diffMs = now.getTime() - date.getTime();

    // Convert to different time units
    const diffMinutes = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    // Return appropriate format based on time difference
    if (Math.abs(diffMinutes) < 1) {
      return "Just now";
    } else if (diffMinutes < 0) {
      // Future date
      return `In ${Math.abs(diffMinutes)}m`;
    } else if (diffMinutes < 60) {
      return `${diffMinutes}m ago`;
    } else if (diffHours < 24) {
      return `${diffHours}h ago`;
    } else {
      return `${diffDays}d ago`;
    }
  } catch {
    return "Time error";
  }
};

// Get chart color based on vital type
const getChartColor = (vitalType) => {
  // Token references — SVG presentation attributes resolve var(), so the
  // trace follows the palette on <html>.
  const colors = {
    'blood_pressure': 'var(--vc-series-bp)',
    'temperature': 'var(--vc-series-temp)',
    'weight': 'var(--vc-series-weight)',
    'calories': 'var(--vc-series-calories)',
    'water': 'var(--vc-series-water)',
  };
  return colors[vitalType] || 'var(--vc-state-idle)';
};

// ---- Chart data -----------------------------------------------------------

// Format the data for the chart based on vital type
const formatChartData = (data, vitalType) => {
  if (!data || data.length === 0) return [];

  // Data arrives newest-first from the API. Take the newest 5 and reverse
  // so the chart renders oldest → newest left-to-right.
  const recent = data.slice(0, 5).slice().reverse();

  return recent.map((item, index) => {
    let value = item.value;

    // Handle different data structures
    if (vitalType === 'blood_pressure') {
      // For blood pressure, use MAP for charting, but show systolic/diastolic in table
      value = item.map || item.value; // Use MAP if available, fallback to value
    } else if (vitalType === 'temperature') {
      // For temperature, use body temp for charting
      value = item.body || item.value; // Use body temp if available, fallback to value
    }

    return {
      index,
      value: value,
      originalItem: item
    };
  });
};

// Calculate Y domain for chart
const calculateYDomain = (chartData, vitalType) => {
  if (chartData.length === 0) return [0, 100];

  const values = chartData.map(d => d.value).filter(v => v !== null && v !== undefined && !isNaN(v));
  if (values.length === 0) return [0, 100];

  let min = Math.min(...values);
  let max = Math.max(...values);

  // Special handling for different vital types
  if (vitalType === 'temperature') {
    // For temperature, use a more reasonable range around body temperature
    min = Math.max(95, min - 2); // Don't go below 95°F
    max = Math.min(110, max + 2); // Don't go above 110°F
  } else {
    // Add padding for other vital types
    const padding = (max - min) * 0.1 || 10;
    min = Math.max(0, min - padding);
    max = max + padding;
  }

  return [min, max];
};

// ---- Tooltip --------------------------------------------------------------

/* Module-level so the component type is stable across renders. recharts clones
 * the element it's given, injecting `active`/`payload`. */
const VitalsTooltip = ({ active, payload, vitalType, chrome }) => {
  if (!active || !payload || !payload.length) return null;
  const item = payload[0].payload.originalItem;
  if (!item) return null;

  return (
    <div style={{
      backgroundColor: chrome.tooltipBg,
      padding: '8px 12px',
      borderRadius: '4px',
      border: `1px solid ${chrome.tooltipBorder}`,
      color: chrome.tooltipText,
      fontSize: '12px',
      boxShadow: '0 2px 8px rgba(0, 0, 0, 0.3)'
    }}>
      <div style={{ marginBottom: '4px', fontWeight: '500' }}>
        {formatDisplayValue(item, vitalType)}
      </div>
      <div style={{ color: chrome.textMuted, fontSize: '10px' }}>
        {formatDateTime(item.datetime)}
      </div>
    </div>
  );
};

// ---- Component ------------------------------------------------------------

const DynamicVitalsCard = ({ vitalType, data = [], title, patientId, onSaved, chrome = CHART_CHROME }) => {
  const [isFlipped, setIsFlipped] = useState(false);
  const [quickAddOpen, setQuickAddOpen] = useState(false);

  // All hooks run before the nutrition early-return below.
  const chartData = useMemo(() => formatChartData(data, vitalType), [data, vitalType]);
  const yDomain = useMemo(() => calculateYDomain(chartData, vitalType), [chartData, vitalType]);
  const axisTick = useMemo(() => ({ fontSize: 9, fill: chrome.axis }), [chrome]);

  // Special case for nutrition - render dedicated gauge component
  if (vitalType === 'nutrition') {
    return <NutritionGaugeCard />;
  }

  const displayTitle = title || vitalType.charAt(0).toUpperCase() + vitalType.slice(1);

  const seriesColor = getChartColor(vitalType);
  const titleColor = seriesColor;

  return (
    <div style={{
      position: 'relative',
      height: '100%',
      width: '100%',
      perspective: '1000px'
    }}>
      <div style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        transition: 'transform 0.6s',
        transformStyle: 'preserve-3d',
        transform: isFlipped ? 'rotateY(180deg)' : 'rotateY(0deg)'
      }}>
        {/* Front side - Chart only */}
        <div style={{
          position: 'absolute',
          width: '100%',
          height: '100%',
          backfaceVisibility: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          cursor: 'pointer'
        }}
        onClick={() => setIsFlipped(true)}
        >
          {/* Quick-add lives on the flipped (details) side, not here — keeps the
              chart view clean. See the back side below. */}
          <h3 style={{
            color: titleColor,
            margin: '0 0 10px 0',
            fontSize: '13px',
            fontWeight: '700',
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            textAlign: 'left'
          }}>
            {displayTitle} History
          </h3>

          {/* Chart only view */}
          <div style={{ flex: 1, minHeight: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 4, right: 18, bottom: 4, left: 4 }}>
                  <XAxis
                    dataKey="index"
                    type="number"
                    domain={[0, Math.max(0, chartData.length - 1)]}
                    height={16}
                    tick={axisTick}
                    axisLine={false}
                    tickLine={false}
                    interval="preserveStartEnd"
                    tickFormatter={(i) => {
                      const point = chartData[Math.round(i)]?.originalItem;
                      if (!point?.datetime) return '';
                      const d = new Date(point.datetime);
                      if (isNaN(d.getTime())) return '';
                      return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
                    }}
                  />
                  <YAxis
                    domain={yDomain}
                    width={38}
                    tick={axisTick}
                    axisLine={false}
                    tickLine={false}
                    tickCount={3}
                  />
                  <Tooltip content={<VitalsTooltip vitalType={vitalType} chrome={chrome} />} />
                  <Line
                    type="monotone"
                    dataKey="value"
                    stroke={seriesColor}
                    strokeWidth={2}
                    dot={false}
                    activeDot={{
                      r: 4,
                      fill: seriesColor,
                      stroke: chrome.bg,
                      strokeWidth: 2
                    }}
                    isAnimationActive={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                height: '100%',
                color: chrome.textDim,
                fontSize: '14px'
              }}>
                No {vitalType} data available
              </div>
            )}
          </div>

          {/* Click hint */}
          <div style={{
            textAlign: 'center',
            padding: '8px',
            fontSize: '11px',
            color: chrome.textDim,
            opacity: 0.7
          }}>
            Click to view details
          </div>
        </div>

        {/* Back side - Table only */}
        <div style={{
          position: 'absolute',
          width: '100%',
          height: '100%',
          backfaceVisibility: 'hidden',
          transform: 'rotateY(180deg)',
          display: 'flex',
          flexDirection: 'column',
          cursor: 'pointer'
        }}
        onClick={() => setIsFlipped(false)}
        >
          <h3 style={{
            color: titleColor,
            margin: '0 0 10px 0',
            fontSize: '13px',
            fontWeight: '700',
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            textAlign: 'left'
          }}>
            {displayTitle} Data
          </h3>

          {/* Table only */}
          <div style={{
            flex: 1,
            overflowY: 'auto'
          }}>
            <table style={{
              width: '100%',
              borderCollapse: 'collapse',
              fontSize: '12px',
              color: chrome.text
            }}>
              <thead>
                <tr>
                  <th style={{
                    padding: '4px 8px',
                    borderBottom: `1px solid ${chrome.border}`,
                    fontSize: '10px',
                    color: chrome.textMuted,
                    textAlign: 'left'
                  }}>
                    Time
                  </th>
                  <th style={{
                    padding: '4px 8px',
                    borderBottom: `1px solid ${chrome.border}`,
                    fontSize: '10px',
                    color: chrome.textMuted,
                    textAlign: 'right'
                  }}>
                    Value
                  </th>
                </tr>
              </thead>
              <tbody>
                {data && data.length > 0 ? (
                  data.slice(0, 5).map((item, index) => (
                    <tr key={index}>
                      <td style={{
                        padding: '4px 8px',
                        borderBottom: `1px solid ${chrome.border}`,
                        fontSize: '11px',
                        color: chrome.textMuted
                      }}>
                        {formatDateTime(item.datetime)}
                      </td>
                      <td style={{
                        padding: '4px 8px',
                        borderBottom: `1px solid ${chrome.border}`,
                        fontSize: '11px',
                        color: chrome.text,
                        textAlign: 'right',
                        fontWeight: '500'
                      }}>
                        {formatDisplayValue(item, vitalType)}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={2} style={{
                      textAlign: "center",
                      padding: '20px',
                      color: chrome.textDim,
                      fontSize: '11px'
                    }}>
                      No data available
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Quick-add button — only on the details side, at the bottom.
              backfaceVisibility:hidden keeps it from bleeding onto the front. */}
          {patientId && (
            <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 4 }}>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setQuickAddOpen(true); }}
                title={`Add ${displayTitle}`}
                aria-label={`Add ${displayTitle}`}
                style={{
                  backfaceVisibility: 'hidden',
                  width: 30, height: 30, borderRadius: '50%',
                  border: '1px solid rgba(255,255,255,0.18)',
                  background: 'rgba(0,0,0,0.45)',
                  color: '#fff', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 18, lineHeight: 1, fontWeight: 600,
                }}
              >+</button>
            </div>
          )}

          {/* Click hint */}
          <div style={{
            textAlign: 'center',
            padding: '8px',
            fontSize: '11px',
            color: chrome.textDim,
            opacity: 0.7
          }}>
            Click to hide details
          </div>
        </div>
      </div>

      {quickAddOpen && (
        <QuickAddVitalModal
          vitalType={vitalType}
          patientId={patientId}
          onClose={() => setQuickAddOpen(false)}
          onSaved={() => { if (onSaved) onSaved(); }}
        />
      )}
    </div>
  );
};

export default React.memo(DynamicVitalsCard);
