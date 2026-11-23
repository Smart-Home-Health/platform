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
import { createPortal } from 'react-dom';
import { stamp } from './diaryTime';

const sources = { medication: 'Medication log', nutrition: 'Nutrition log', observation: 'Observation' };

export default function DiaryTimeline({ patient, diary, entries, zone, onEdit }) {
  function table(print) {
    return <table className="diary-table"><thead><tr><th scope="col">Local date and time</th><th scope="col">Description of event</th></tr></thead>
      <tbody>{entries.map(e => <tr key={e.source + e.id}>
        <td><time dateTime={e.at}>{stamp(e.at, zone)}</time></td>
        <td><strong>{e.label}</strong>{e.note && <p>{e.note}</p>}
          {e.question && <p>{e.question} {e.answer || 'Not recorded'}</p>}
          <small>{sources[e.source]}</small>
          {!print && e.source === 'observation' && onEdit &&
            <button type="button" className="cfg-ghost" aria-label={`Edit ${e.label}`} onClick={() => onEdit(e)}>Edit</button>}
        </td>
      </tr>)}</tbody></table>;
  }
  return <>
    {entries.length ? table(false) : <p>No events in this diary yet.</p>}
    {createPortal(<article className="diary-print">
      <h1>{diary.name}</h1><p>{patient.first_name} {patient.last_name}</p>
      <p>{stamp(diary.starts_at, zone)} – {diary.ends_at ? stamp(diary.ends_at, zone) : 'Ongoing'} · {zone}</p>
      {entries.length ? table(true) : <p>No events in this diary yet.</p>}
    </article>, document.body)}
  </>;
}
