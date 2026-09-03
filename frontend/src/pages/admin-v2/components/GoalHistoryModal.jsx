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
// Goal history — targets are effective-dated, so previous versions survive
// rather than being overwritten, and it is worth being able to see when a
// target changed and to what.
//
// A step chart, because a target holds its value until it is superseded;
// joining the points with slopes would imply a gradual change that never
// happened.
//
// Only goals appear here. Schedules carry no effective dating, so there is no
// record of what was scheduled alongside a past target, and this deliberately
// does not imply one.
import { useMemo } from 'react';
import EntityModal from '../../../components/vc/EntityModal';
import { CalendarIcon } from '../../../components/Icons';
import './nutrition-plan.css';

const SERIES = [
  { key: 'fluids', label: 'Fluids', unit: 'mL', tone: 'fluids',
    read: (g) => g.total_fluid_ml_target || g.water_ml_target },
  { key: 'calories', label: 'Calories', unit: 'kcal', tone: 'calories',
    read: (g) => g.calories_target },
];

const num = (v) => Math.round(v || 0).toLocaleString();

// Geometry of the plot area, in the SVG's own coordinate space.
const W = 320;
const H = 96;
const PAD_X = 6;
const PAD_TOP = 18;
const PAD_BOTTOM = 16;

function StepChart({ versions, series }) {
  const points = versions
    .map((g) => ({ at: new Date(g.effective_date).getTime(), value: series.read(g) }))
    .filter((p) => p.value != null && Number.isFinite(p.at))
    .sort((a, b) => a.at - b.at);

  if (points.length === 0) return null;

  const now = Date.now();
  const first = points[0].at;
  // A single version still deserves a line; give it a nominal span.
  const span = Math.max(now - first, 1);

  const values = points.map((p) => p.value);
  const max = Math.max(...values);
  const min = Math.min(...values);
  const range = max - min || max || 1;

  const x = (at) => PAD_X + ((at - first) / span) * (W - PAD_X * 2);
  const y = (value) => {
    const usable = H - PAD_TOP - PAD_BOTTOM;
    return PAD_TOP + usable - ((value - min) / range) * usable;
  };

  // Hold each value flat until the next version takes over.
  const segments = points.map((p, i) => {
    const endAt = i + 1 < points.length ? points[i + 1].at : now;
    return { ...p, x1: x(p.at), x2: x(endAt), y: y(p.value) };
  });

  const path = segments
    .map((s, i) => {
      const lead = i === 0 ? `M ${s.x1} ${s.y}` : `L ${s.x1} ${s.y}`;
      return `${lead} L ${s.x2} ${s.y}`;
    })
    .join(' ');

  return (
    <figure className={`nplan-chart ${series.tone}`}>
      <figcaption>{series.label} ({series.unit})</figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} role="img"
           aria-label={`${series.label} target over time, ${points.length} versions`}>
        {/* Risers between steps, dashed so they read as "changed here" rather
            than as a measured transition. */}
        {segments.slice(1).map((s, i) => (
          <line
            key={`riser-${s.at}`}
            x1={s.x1} y1={segments[i].y} x2={s.x1} y2={s.y}
            className="nplan-chart-riser"
          />
        ))}
        <path d={path} className="nplan-chart-line" fill="none" />
        {segments.map((s) => (
          <g key={`pt-${s.at}`}>
            <circle cx={s.x1} cy={s.y} r="3.5" className="nplan-chart-dot" />
            <text x={s.x1} y={s.y - 7} className="nplan-chart-value">{num(s.value)}</text>
          </g>
        ))}
      </svg>
    </figure>
  );
}

export default function GoalHistoryModal({ open, onOpenChange, goals = [], formatDate }) {
  // Newest first for the list; the chart sorts its own way.
  const versions = useMemo(
    () => [...goals].sort((a, b) => new Date(b.effective_date) - new Date(a.effective_date)),
    [goals],
  );

  const activeSeries = SERIES.filter((s) => goals.some((g) => s.read(g) != null));

  return (
    <EntityModal open={open} onOpenChange={onOpenChange} title="Goal history">
      <div className="em-form nplan-history">
        <p className="nplan-history-sub">
          Targets are effective-dated — setting new ones never overwrites the previous version.
        </p>

        {versions.length === 0 ? (
          <p className="nplan-empty">No targets have been set for this patient yet.</p>
        ) : (
          <>
            {activeSeries.length > 0 && (
              <div className="nplan-charts">
                {activeSeries.map((series) => (
                  <StepChart key={series.key} versions={versions} series={series} />
                ))}
              </div>
            )}

            <ol className="nplan-versions">
              {versions.map((goal, index) => {
                const current = index === 0 && !goal.end_date;
                return (
                  <li key={goal.id} className={`nplan-version ${current ? 'current' : ''}`}>
                    <span className="nplan-version-rail" aria-hidden="true" />
                    <div className="nplan-version-body">
                      <div className="nplan-version-head">
                        {current && <span className="nplan-version-tag">Current</span>}
                        <span className="nplan-version-dates">
                          <CalendarIcon size={13} />
                          {formatDate(goal.effective_date)}
                          {goal.end_date ? ` – ${formatDate(goal.end_date)}` : ' – present'}
                        </span>
                      </div>
                      <div className="nplan-version-values">
                        {SERIES.map((series) => {
                          const value = series.read(goal);
                          if (value == null) return null;
                          return (
                            <span key={series.key} className={`nplan-version-metric ${series.tone}`}>
                              <span className="nplan-version-metric-label">{series.label}</span>
                              <span className="nplan-version-metric-value">
                                {num(value)} {series.unit}
                              </span>
                            </span>
                          );
                        })}
                      </div>
                      {goal.notes && <p className="nplan-version-note">{goal.notes}</p>}
                    </div>
                  </li>
                );
              })}
            </ol>
          </>
        )}

        <div className="em-footer">
          <button type="button" className="em-cancel" onClick={() => onOpenChange(false)}>
            Close
          </button>
        </div>
      </div>
    </EntityModal>
  );
}
