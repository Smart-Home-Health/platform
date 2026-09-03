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
// The time a log is being recorded for. Almost always "now", so it states the
// value and keeps the picker behind Edit rather than making every entry walk
// through a datetime field.
import { useState } from 'react';
import { ClockIcon } from '../Icons';

const NOW_WINDOW_MS = 2 * 60 * 1000;

export default function WhenRow({ id, label = 'Time', value, onChange }) {
  const [editing, setEditing] = useState(false);
  const when = value ? new Date(value) : new Date();
  const valid = !Number.isNaN(when.getTime());
  const isNow = valid && Math.abs(Date.now() - when.getTime()) <= NOW_WINDOW_MS;

  return (
    <div className="nsheet-field">
      <div className="nsheet-label">
        {label}
        <span className="nsheet-req">Required</span>
      </div>
      <div className="nsheet-when">
        <span className="nsheet-when-icon"><ClockIcon size={18} /></span>
        {editing ? (
          <input
            id={id}
            className="em-input"
            type="datetime-local"
            value={value}
            autoFocus
            onChange={(e) => onChange(e.target.value)}
            onBlur={() => setEditing(false)}
          />
        ) : (
          <span className="nsheet-when-text">
            <span className="nsheet-when-primary">
              {isNow && <em>Now</em>}
              {valid
                ? when.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
                : '—'}
            </span>
            <span className="nsheet-when-date">
              {valid
                ? when.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
                : ''}
            </span>
          </span>
        )}
        <button
          type="button"
          className="nsheet-link"
          onClick={() => setEditing((e) => !e)}
        >
          {editing ? 'Done' : 'Edit'}
        </button>
      </div>
    </div>
  );
}
