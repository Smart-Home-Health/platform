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
export default function DiarySuggestions({ suggestions, zone, onReview }) {
  const clock = new Intl.DateTimeFormat(undefined, {
    timeZone: zone, hour: 'numeric', minute: '2-digit', second: '2-digit', timeZoneName: 'short',
  });
  return <details className="mtl-card diary-suggestions">
    <summary>Suggested events ({suggestions.length})</summary>
    <p>{suggestions.length ? 'Oxygen dipped and heart rate rose close together in these readings.'
      : 'No paired oxygen dips and heart-rate rises to review for this day.'}</p>
    {suggestions.length > 0 && <ul>{suggestions.map(pattern => {
      const times = clock.format(new Date(pattern.start_time)) + ' – ' + clock.format(new Date(pattern.end_time));
      const metrics = `Lowest SpO₂ ${pattern.min_spo2}% · Heart rate ${pattern.min_bpm}–${pattern.max_bpm} bpm`;
      const motion = pattern.motion_detected ? 'Monitor flagged movement.' : '';
      const note = `Oxygen dip with heart-rate rise, ${times}. ${metrics}.${motion ? ' ' + motion : ''}`;
      return <li key={pattern.id}>
        <div><strong>{times}</strong><p>{metrics}</p>{motion && <p>{motion}</p>}</div>
        {onReview && <button type="button" className="em-cancel" aria-label={`Review event at ${times}`}
          onClick={() => onReview({ is_custom: true, request_id: pattern.id, at: pattern.start_time,
            formTitle: 'Review suggested event', note })}>
          Review</button>}
      </li>;
    })}</ul>}
  </details>;
}
