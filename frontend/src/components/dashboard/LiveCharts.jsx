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
import ChartBlock from '../ChartBlock';
import { CHART_RANGES } from '../../hooks/useLiveVitalsBuffer';

const STREAM_LABEL = { streaming: 'Streaming', stalled: 'Stalled', offline: 'Offline' };

/* Center column: range tabs + streaming chip + three stacked live charts. */
export default function LiveCharts({ range, setRange, rangeDef, series, streaming, chrome, perfusionAsPercent, now }) {
  const windowMs = rangeDef.minutes * 60 * 1000;
  const rate = streaming.status === 'streaming' && streaming.rateHz
    ? ` · ${streaming.rateHz >= 0.95 ? `${Math.round(streaming.rateHz)} Hz` : `${streaming.rateHz.toFixed(1)} Hz`}`
    : '';
  return (
    <div className="ld-charts">
      <div className="ld-charts-toolbar">
        <div className="ld-range-tabs" role="tablist" aria-label="Chart time range">
          {CHART_RANGES.map(r => (
            <button
              key={r.key}
              type="button"
              role="tab"
              aria-selected={range === r.key}
              className={`ld-range-tab${range === r.key ? ' active' : ''}`}
              onClick={() => setRange(r.key)}
            >
              {r.label}
            </button>
          ))}
        </div>
        <div className={`ld-stream ld-stream-${streaming.status}`}>
          <span className="ld-stream-dot" aria-hidden="true" />
          {STREAM_LABEL[streaming.status]}{rate}
        </div>
      </div>

      <div className="ld-chart-stack">
        <div className="ld-chart">
          <div className="ld-chart-title">Oxygen Saturation</div>
          <ChartBlock yLabel="SpO2 (%)" color="blue" dataset={series.spo2}
                      showXaxis={false} chrome={chrome} windowMs={windowMs} now={now} />
        </div>
        <div className="ld-chart">
          <div className="ld-chart-title">Heart Rate</div>
          <ChartBlock yLabel="bpm" color="green" dataset={series.bpm}
                      showXaxis={false} chrome={chrome} windowMs={windowMs} now={now} />
        </div>
        <div className="ld-chart">
          <div className="ld-chart-title">Perfusion Index</div>
          <ChartBlock yLabel={perfusionAsPercent ? 'PI (%)' : 'PI'} color="orange" dataset={series.perfusion}
                      showXaxis={true} chrome={chrome} windowMs={windowMs} now={now} />
        </div>
      </div>
    </div>
  );
}
