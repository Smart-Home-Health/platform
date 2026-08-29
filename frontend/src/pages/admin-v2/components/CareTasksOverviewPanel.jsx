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
// How care went over a window: the headline adherence figure, then where the
// misses were, by task and by person. The record behind it opens as a modal.
import SegmentedControl from '../../../components/vc/SegmentedControl';
import PersonAvatar from '../../../components/vc/PersonAvatar';
import { CheckIcon, ClockIcon, HistoryIcon, UsersIcon, XIcon } from '../../../components/Icons';
import './care-tasks-page.css';

const WINDOWS = [
  { value: 7, label: '7 days' },
  { value: 30, label: '30 days' },
  { value: 90, label: '90 days' },
];

const pct = (value) => `${Math.round(value || 0)}%`;

/** Adherence tone: green when it is holding, amber when it is slipping. */
const rateTone = (rate) => (rate >= 90 ? 'ok' : rate >= 75 ? 'due' : 'low');

export default function CareTasksOverviewPanel({
  windowDays, onWindowChange,
  adherence, perTask = [], perUser = [],
  loading, onViewHistory,
}) {
  return (
    <div className="cto">
      <div className="cto-head">
        <SegmentedControl
          options={WINDOWS}
          value={windowDays}
          onChange={onWindowChange}
          ariaLabel="Reporting window"
        />
        <button type="button" className="ctp-link" onClick={onViewHistory}>
          <HistoryIcon size={15} /> View history
        </button>
      </div>

      {loading && !adherence ? (
        <div className="ec-empty">Loading adherence…</div>
      ) : !adherence ? (
        <div className="ec-empty"><p>No completions recorded in this window.</p></div>
      ) : (
        <>
          <section className="cto-card">
            <header className="cto-card-head"><h3>Adherence</h3></header>
            <div className="cto-headline">
              <span className={`cto-rate ${rateTone(adherence.adherence_rate)}`}>
                {pct(adherence.adherence_rate)}
              </span>
              <span className="cto-rate-note">
                of scheduled care over the last {windowDays} days
              </span>
            </div>
            <div className="cto-breakdown">
              <div className="cto-stat ok">
                <span className="cto-stat-icon"><CheckIcon size={16} /></span>
                <span className="cto-stat-value">{adherence.on_time}</span>
                <span className="cto-stat-label">On time</span>
              </div>
              <div className="cto-stat due">
                <span className="cto-stat-icon"><ClockIcon size={16} /></span>
                <span className="cto-stat-value">{adherence.late}</span>
                <span className="cto-stat-label">Late</span>
              </div>
              <div className="cto-stat due">
                <span className="cto-stat-icon"><ClockIcon size={16} /></span>
                <span className="cto-stat-value">{adherence.early}</span>
                <span className="cto-stat-label">Early</span>
              </div>
              <div className="cto-stat idle">
                <span className="cto-stat-icon"><XIcon size={16} /></span>
                <span className="cto-stat-value">{adherence.skipped}</span>
                <span className="cto-stat-label">Skipped</span>
              </div>
            </div>
          </section>

          <section className="cto-card">
            <header className="cto-card-head"><h3>By task</h3></header>
            {perTask.length === 0 ? (
              <p className="ct-empty">Nothing completed in this window.</p>
            ) : (
              <ul className="cto-rows">
                {perTask.map((row) => {
                  const rate = row.completion_rate ?? 0;
                  return (
                    <li key={row.task_id} className="cto-row">
                      <span className="ct-cat-dot"
                            style={{ background: row.category_color || 'var(--vc-line-strong)' }} />
                      <span className="cto-row-text">
                        <span className="cto-row-name">{row.task_name}</span>
                        <span className="cto-row-meta">
                          {row.total_logs} logged
                          {row.late ? ` · ${row.late} late` : ''}
                          {row.skipped ? ` · ${row.skipped} skipped` : ''}
                        </span>
                      </span>
                      <span className="cto-row-bar">
                        <span className={`cto-row-fill ${rateTone(rate)}`}
                              style={{ width: `${Math.min(100, rate)}%` }} />
                      </span>
                      <span className={`cto-row-rate ${rateTone(rate)}`}>{pct(rate)}</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section className="cto-card">
            <header className="cto-card-head"><h3>By person</h3></header>
            {perUser.length === 0 ? (
              <p className="ct-empty">No completions attributed to a user in this window.</p>
            ) : (
              <ul className="cto-rows">
                {perUser.map((row) => (
                  <li key={row.user_id ?? row.user_name} className="cto-row">
                    {row.user_id ? (
                      <PersonAvatar kind="user" id={row.user_id} seed={row.avatar_seed}
                                    photo={row.avatar_photo} size={28} decorative className="cto-row-avatar" />
                    ) : (
                      <span className="cto-row-icon"><UsersIcon size={15} /></span>
                    )}
                    <span className="cto-row-text">
                      <span className="cto-row-name">{row.user_name || 'Unattributed'}</span>
                      <span className="cto-row-meta">
                        {row.total_logs} logged
                        {row.late ? ` · ${row.late} late` : ''}
                        {row.skipped ? ` · ${row.skipped} skipped` : ''}
                      </span>
                    </span>
                    <span className="cto-row-count">{row.on_time} on time</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}
