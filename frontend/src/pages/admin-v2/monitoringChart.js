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
// The shape every stacked monitoring chart shares.
//
// The timeline and the environment view both draw several signals above a row
// of event lanes, and all of it has to line up: a moment must land on the same
// x in every chart and every lane, or a marker points at the wrong sample.
// That alignment is a contract between three things — the chart's y-axis
// width, the lanes' left inset, and the scrubber's — and it only holds while
// they agree on one number. Keeping the number and the options builder here
// means the two pages cannot drift apart by editing one of them.
//
// PLOT_GUTTER must match --mtl-gutter / --env-gutter in the pages' stylesheets.

export const PLOT_GUTTER = 52;
export const PLOT_RPAD = 12;

export const CHROME = {
  grid: 'rgba(255, 255, 255, 0.06)',
  axis: '#6b7987',
  band: 'rgba(240, 86, 60, 0.14)',
  bandEdge: 'rgba(240, 86, 60, 0.35)',
  threshold: 'rgba(154, 168, 184, 0.5)',
};

const MONO = "'IBM Plex Mono', monospace";

/** A y range that fits the data and lands on readable numbers.
 *
 * Charting the raw min/max gave axes labelled 58.08 and 119.2; stepping out to
 * a round boundary costs a few pixels of headroom and makes the axis legible.
 * `clampMin` is opt-out because pressure deltas legitimately go negative and
 * flooring them at zero would hide half the signal. */
export function niceScale(lo, hi, minSpan, clampMax, { clampMin = true } = {}) {
  let min = lo;
  let max = hi;
  if (max - min < minSpan) {
    const centre = (min + max) / 2;
    min = centre - minSpan / 2;
    max = centre + minSpan / 2;
  }
  const raw = (max - min) / 4;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((c) => c >= raw) ?? 10 * mag;
  min = Math.floor(min / step) * step;
  if (clampMin) min = Math.max(0, min);
  max = Math.ceil(max / step) * step;
  if (clampMax != null) max = Math.min(clampMax, max);
  return { min, max, step };
}

/** A horizontal reference line — an alarm limit, or a configured bound. */
export function thresholdLine(value, text) {
  return {
    type: 'line',
    yMin: value,
    yMax: value,
    borderColor: CHROME.threshold,
    borderWidth: 1,
    borderDash: [5, 4],
    label: {
      display: true,
      content: text,
      position: 'start',
      backgroundColor: 'transparent',
      color: CHROME.axis,
      font: { size: 10, family: MONO },
      padding: 0,
      yAdjust: -8,
    },
  };
}

/**
 * Chart.js options for one signal in a stack.
 *
 * `showAxis` belongs to the bottom chart only — the others keep the same scale
 * so the grid lines still align, but drawing every chart's time labels would
 * repeat the axis three times down the page.
 */
export function stackedChartOptions({
  view,
  bounds,
  yRange,
  showAxis,
  annotations = {},
  timeFormats = { minute: 'h:mm', hour: 'ha' },
  onViewChange,
  minRangeMs = 60_000,
  maxTicks = 6,
}) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    // Pointer handling belongs to the stack, not to any one canvas: a drag has
    // to mean the same thing whichever chart it started over.
    events: [],
    layout: { padding: { right: PLOT_RPAD, top: 14, bottom: 0 } },
    scales: {
      x: {
        type: 'time',
        min: view?.min ?? bounds.start,
        max: view?.max ?? bounds.end,
        time: { displayFormats: timeFormats },
        grid: { color: CHROME.grid, drawTicks: false },
        border: { display: false },
        ticks: {
          display: showAxis,
          color: CHROME.axis,
          maxRotation: 0,
          autoSkip: true,
          autoSkipPadding: 16,
          maxTicksLimit: maxTicks,
          font: { size: 10, family: MONO },
        },
      },
      y: {
        min: yRange.min,
        max: yRange.max,
        grid: { color: CHROME.grid, drawTicks: false },
        border: { display: false },
        ticks: {
          color: CHROME.axis,
          stepSize: yRange.step,
          maxTicksLimit: 6,
          font: { size: 10, family: MONO },
        },
        // Pin the axis width so this chart's plot area starts at exactly the
        // same x as its siblings' and the lanes below.
        afterFit: (scale) => { scale.width = PLOT_GUTTER; },
      },
    },
    plugins: {
      legend: { display: false },
      tooltip: { enabled: false },
      annotation: { annotations },
      zoom: {
        pan: { enabled: false },
        zoom: {
          wheel: { enabled: true },
          pinch: { enabled: true },
          mode: 'x',
          onZoomComplete: ({ chart: c }) => {
            onViewChange?.({ min: c.scales.x.min, max: c.scales.x.max });
          },
        },
        limits: { x: { min: bounds.start, max: bounds.end, minRange: minRangeMs } },
      },
    },
  };
}
