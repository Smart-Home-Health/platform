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
import { stamp } from './diaryTime';

const QUARTER = 15 * 60_000;
const LEFT = 70, RIGHT = 532, WIDTH = RIGHT - LEFT;
const LANES = [
  ['observation', 'Diary'], ['alerts', 'Alerts'], ['medication', 'Meds'],
  ['care_task', 'Care'], ['nutrition', 'Feeds'], ['nutrition_output', 'Output'], ['vitals', 'Vitals'],
];
const SERIES = [
  { key: 'high', label: 'High', color: '#485969', dash: '6 3' },
  { key: 'low', label: 'Low', color: '#55636b', dash: '1.5 2.5' },
  { key: 'avg', label: 'Average', color: '#075963' },
];

const bin = at => Math.floor(Date.parse(at) / QUARTER);
const coord = n => Number(n.toFixed(2));
const text = (x, y, value, options = '') => `<text x="${x}" y="${y}" font-size="10" ${options}>${value}</text>`;
const line = (x1, y1, x2, y2, attrs = 'stroke="#c8cfd2" stroke-width=".6"') =>
  `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" ${attrs}/>`;
const pen = s => `stroke="${s.color}" stroke-width="${s.key === 'avg' ? 1.8 : 1.2}"${s.dash ? ` stroke-dasharray="${s.dash}"` : ''}`;

function signalPlot(samples, key, label, top, x, ticks, available) {
  const values = samples.filter(row => row[key] != null);
  const height = 105;
  let svg = text(0, top - 12, label, 'font-weight="bold"');
  if (!values.length) {
    return svg + line(LEFT, top + height, RIGHT, top + height)
      + text(LEFT + 8, top + height / 2, available ? 'No valid readings in this period' : 'Monitoring data unavailable');
  }
  let low = Infinity, high = -Infinity;
  for (const row of values) {
    low = Math.min(low, row[key].low);
    high = Math.max(high, row[key].high);
  }
  const minStep = Math.max(1, (high - low) / 4);
  const magnitude = 10 ** Math.floor(Math.log10(minStep));
  const step = [1, 2, 5, 10].find(v => v * magnitude >= minStep) * magnitude;
  let min = Math.max(0, Math.floor(low / step) * step);
  let max = Math.ceil(high / step) * step;
  if (min === max) {
    min = Math.max(0, min - step);
    max = key === 'spo2' ? Math.min(100, max + step) : max + step;
  }
  const y = value => coord(top + height * (max - value) / (max - min));
  for (let v = min; v <= max; v += step) {
    svg += line(LEFT, y(v), RIGHT, y(v)) + text(LEFT - 8, y(v) + 3, v, 'text-anchor="end"');
  }
  for (const t of ticks) svg += line(x(t + .5), top, x(t + .5), top + height, 'stroke="#e2e6e8" stroke-width=".5"');
  for (const series of SERIES) {
    let path = '';
    let points = '';
    for (let i = 0; i < values.length; i++) {
      const row = values[i], px = x(row.bin + 0.5), py = y(row[key][series.key]);
      const begins = values[i - 1]?.bin !== row.bin - 1;
      path += `${begins ? 'M' : 'L'}${px} ${py} `;
      if (begins && values[i + 1]?.bin !== row.bin + 1) {
        points += `<circle cx="${px}" cy="${py}" r="1.6" fill="${series.color}"/>`;
      }
    }
    svg += `<path d="${path}" fill="none" ${pen(series)}/>${points}`;
  }
  return svg;
}

// Render one vector figure for browser print, preview and pdfmake. Positions use
// elapsed quarter-hours, including both occurrences of a repeated local hour.
export function diaryOverview(snapshot, zone) {
  const { start, through, categories } = snapshot;
  if (Date.parse(through) < Date.parse(start)) return { period: 'This diary has not started.' };
  const first = bin(start), stop = bin(through) + 1, count = stop - first;
  const x = bucket => coord(LEFT + WIDTH * (bucket - first) / count);
  const samples = snapshot.signals.map(row => ({ ...row, bin: bin(row.at) }));
  const tickCount = Math.min(5, count - 1);
  const ticks = tickCount ? Array.from({ length: tickCount + 1 }, (_, i) => first + Math.round(i * (count - 1) / tickCount))
    : [first];
  const date = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: zone });
  const clock = new Intl.DateTimeFormat('en-US', { hourCycle: 'h23', hour: '2-digit', minute: '2-digit', timeZone: zone, timeZoneName: 'short' });
  function axis(y) {
    return ticks.map((t, i) => {
      const anchor = count <= 5 ? 'middle' : i === 0 ? 'start' : i === tickCount ? 'end' : 'middle';
      const attrs = `text-anchor="${anchor}"`;
      return text(x(t + .5), y, clock.format(t * QUARTER), attrs) + text(x(t + .5), y + 12, date.format(t * QUARTER), attrs);
    }).join('');
  }
  const marks = Object.fromEntries(Object.entries(categories).map(([key, times]) => [key, new Set(times.map(bin))]));
  let svg = '<svg xmlns="http://www.w3.org/2000/svg" width="540" height="586" viewBox="0 0 540 586" font-family="Roboto, sans-serif" fill="#172a33">';
  svg += text(0, 14, '15-minute readings', 'font-weight="bold"');
  SERIES.forEach((s, i) => {
    const left = 308 + 73 * i;
    svg += line(left, 11, left + 20, 11, pen(s)) + text(left + 24, 14, s.label);
  });
  svg += signalPlot(samples, 'spo2', 'SpO₂ (%)', 52, x, ticks, !!marks.alerts);
  svg += signalPlot(samples, 'bpm', 'Heart rate (bpm)', 201, x, ticks, !!marks.alerts);
  svg += axis(321);
  svg += text(0, 367, 'Activity by category', 'font-weight="bold"');
  svg += text(0, 383, 'A filled cell marks activity in that quarter-hour. Alerts mark the interval when they started.');
  const gridTop = 395, rowHeight = 21;
  // Thin the ruling when a quarter becomes narrower than a printed point.
  // Activity marks always retain their original quarter-hour positions.
  const ruleEvery = Math.ceil(count / WIDTH);
  let rules = '';
  for (let t = first; t < stop; t += ruleEvery) rules += `M${x(t)} ${gridTop}v${LANES.length * rowHeight}`;
  rules += `M${RIGHT} ${gridTop}v${LANES.length * rowHeight}`;
  svg += `<path d="${rules}" fill="none" stroke="#cdd6da" stroke-width=".35"/>`;
  LANES.forEach(([key, label], i) => {
    const top = gridTop + i * rowHeight;
    svg += line(LEFT, top, RIGHT, top) + text(0, top + 14, label);
    if (!marks[key]) {
      svg += `<rect x="${LEFT}" y="${top + 1}" width="${WIDTH}" height="${rowHeight - 2}" fill="#f2f3f3"/>`;
      svg += text(LEFT + 6, top + 14, 'Not included');
    } else {
      let path = '';
      for (const t of marks[key]) {
        if (t < first || t >= stop) continue;
        const width = x(t + 1) - x(t);
        const pad = Math.min(0.65, width * .12);
        path += `M${coord(x(t) + pad)} ${top + 5}H${coord(x(t + 1) - pad)}v11H${coord(x(t) + pad)}Z`;
      }
      if (path) svg += `<path d="${path}" fill="#264f5c"/>`;
    }
  });
  const bottom = gridTop + LANES.length * rowHeight;
  svg += line(LEFT, bottom, RIGHT, bottom) + axis(bottom + 15) + '</svg>';
  return { svg, period: stamp(start, zone) + ' – ' + stamp(through, zone) };
}
