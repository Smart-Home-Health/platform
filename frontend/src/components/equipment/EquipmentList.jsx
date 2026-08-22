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
// Supplies view of the live Equipment panel: one tight card per supply with
// its facts and the actions a caregiver takes at the bedside (receive stock,
// use a consumable, mark a scheduled item changed). Status rides on the
// badge — amber for due, green for on schedule, neutral for consumables.
import { formatDateOnly } from '../../utils/timezone';
import { isDue } from './equipmentStatus';
import '../schedule/schedule-panel.css';
import './equipment-panel.css';

const dateOrDash = (iso) => (iso ? (formatDateOnly(iso) || '—') : '—');

function status(item) {
  if (!item.scheduled_replacement) return { tone: 'skipped', label: 'Consumable' };
  if (isDue(item)) return { tone: 'due', label: 'Due now' };
  return { tone: 'given', label: 'On schedule' };
}

function Fact({ label, value, unit, due = false }) {
  return (
    <div className={`eq-fact${due ? ' due' : ''}`}>
      <span className="eq-fact-label">{label}</span>
      <span className="eq-fact-value">
        {value}
        {unit && <span className="eq-fact-unit">{unit}</span>}
      </span>
    </div>
  );
}

export default function EquipmentList({ items, loading, error, onReceive, onOpen, onChange }) {
  if (error) return <div className="em-error">{error}</div>;
  if (loading) return <div className="ld-dose-empty">Loading supplies…</div>;
  if (!items.length) return <div className="ld-dose-empty">No supplies for this patient</div>;

  return (
    <ul className="eq-list">
      {items.map((item) => {
        const s = status(item);
        const due = s.tone === 'due';
        return (
          <li key={item.id} className={`eq-card${due ? ' due' : ''}`} data-testid="eq-card">
            <div className="eq-card-head">
              <span className="eq-name">{item.name}</span>
              <span className={`ld-dose-badge ${s.tone}`}>
                {due && <span className="ld-dose-dot" />}
                {s.label}
              </span>
            </div>

            <div className="eq-facts">
              <Fact label="On hand" value={item.quantity ?? 0} unit={item.unit_of_measure} />
              {item.scheduled_replacement && (
                <>
                  <Fact label="Due next" value={dateOrDash(item.due_date)} due={due} />
                  <Fact label="Last changed" value={dateOrDash(item.last_changed)} />
                  <Fact label="Every" value={item.useful_days ? `${item.useful_days} d` : '—'} />
                </>
              )}
            </div>

            <div className="eq-card-actions">
              <button type="button" className="ld-dose-btn sm ghost" onClick={() => onReceive(item)}>
                Receive
              </button>
              {item.scheduled_replacement ? (
                <button type="button" className="ld-dose-btn sm primary" onClick={() => onChange(item)}>
                  {due ? 'Change now' : 'Change'}
                </button>
              ) : (
                <button type="button" className="ld-dose-btn sm primary" onClick={() => onOpen(item)}>
                  Use
                </button>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
