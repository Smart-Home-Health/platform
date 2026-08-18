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
// Standalone day/time-grouped schedule list for admin-v2's Schedule tabs
// (Medications, Care Tasks, Nutrition). Visually the same language as
// DoseScheduleView's narrow layout on the live dashboard, but with no dock
// awareness, no selection/detail pane — each page already has its own fetch,
// action handlers, and off-window confirm dialogs; this only renders.
//
// Callers pre-group and pre-normalize: `dayGroups` is
//   [{ key, label, slots: [{ time, items: [row] }] }]
// built from the page's own (already timezone-correct) day bucketing plus
// scheduleRollup.js's groupBySlot for the time-slot level. A row is:
//   { id, title, meta?, categoryColor?, categoryLabel?, prn?, scheduleLine?,
//     statusLabel, statusTone, completed, actions: [{ key?, label, tone?, onClick, disabled? }] }
// statusTone is one of the six vc-content.css --sched-* families: 'ontime' |
// 'pending' | 'warning' | 'late' | 'completed' | 'skipped'.
import './schedule-board.css';

const StatusBadge = ({ label, tone }) => (
  <span className={`sb-badge tone-${tone}`}>
    {tone !== 'completed' && tone !== 'skipped' && <span className="sb-dot" aria-hidden="true" />}
    {label}
  </span>
);

const ScheduleCard = ({ item }) => (
  <div className={`sb-card tone-${item.statusTone}`}>
    <div className="sb-card-body">
      <div className="sb-card-head">
        <span className="sb-name">{item.title}</span>
        <StatusBadge label={item.statusLabel} tone={item.statusTone} />
      </div>

      {(item.categoryLabel || item.meta || item.prn) && (
        <div className="sb-row-meta">
          {item.categoryLabel && (
            <span className="sb-chip" style={{ '--chip': item.categoryColor || 'var(--vc-text-tertiary)' }}>
              {item.categoryLabel}
            </span>
          )}
          {item.meta && <span className="sb-meta">{item.meta}</span>}
          {item.prn && <span className="sb-prn-badge">PRN</span>}
        </div>
      )}

      {item.scheduleLine && <span className="sb-schedule">{item.scheduleLine}</span>}
    </div>

    {!item.completed && item.actions?.length > 0 && (
      <div className="sb-card-actions">
        {item.actions.map((action) => (
          <button
            key={action.key || action.label}
            type="button"
            className={`sb-btn ${action.tone || 'ghost'}`}
            disabled={action.disabled}
            onClick={action.onClick}
          >
            {action.label}
          </button>
        ))}
      </div>
    )}
  </div>
);

const ScheduleBoard = ({ dayGroups = [], loading = false, emptyText = 'Nothing scheduled' }) => {
  if (loading) {
    return <div className="sb-empty">Loading schedule…</div>;
  }

  const hasItems = dayGroups.some((day) => day.slots.some((slot) => slot.items.length > 0));
  if (!hasItems) {
    return <div className="sb-empty">{emptyText}</div>;
  }

  return (
    <div className="sb-board">
      {dayGroups.map((day) => (
        <div key={day.key} className="sb-day">
          {dayGroups.length > 1 && <div className="sb-day-head">{day.label}</div>}
          {day.slots.map((slot) => (
            <div key={slot.time || 'unscheduled'} className="sb-slot">
              <div className="sb-slot-head">
                <span className="sb-slot-time">{slot.time || 'Unscheduled'}</span>
                <span className="sb-slot-count">{slot.items.length}</span>
              </div>
              <div className="sb-cards">
                {slot.items.map((item) => <ScheduleCard key={item.id} item={item} />)}
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
};

export default ScheduleBoard;
