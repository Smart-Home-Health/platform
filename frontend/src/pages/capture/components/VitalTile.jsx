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
// One vital card. Recorded state is carried by BOTH color and shape:
// solid check = recorded, dotted ring = not recorded. Provenance shows on
// every recorded tile (SOURCE • time), per the spec's consistency rule.
import { CheckCircleIcon } from '../../../components/Icons';

function provenanceLabel(reading) {
  const t = new Date(reading.measuredAt)
    .toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  return `Manual · ${t}`;
}

export default function VitalTile({ config, reading, justSaved, onOpen }) {
  const recorded = Boolean(reading);
  const isBP = config.key === 'blood_pressure';
  return (
    <button
      type="button"
      className={`vc-tile ${justSaved ? 'just-saved' : ''}`}
      onClick={onOpen}
      aria-label={recorded
        ? `${config.label}, recorded. Edit reading.`
        : `${config.label}, not recorded. Add reading.`}
    >
      <span className="vc-tile-head">
        <span className="vc-label">{config.label}</span>
        <span className={`vc-tile-state ${recorded ? 'recorded' : ''}`} aria-hidden="true">
          {recorded ? <CheckCircleIcon size={16} /> : <span className="vc-ring" />}
        </span>
      </span>
      {recorded ? (
        <span className={`vc-tile-value ${isBP ? 'bp' : ''}`}>
          {isBP ? `${reading.systolic}/${reading.diastolic}` : reading.value}
          <span className="vc-unit">{config.unit}</span>
        </span>
      ) : (
        <span className="vc-tile-value empty" aria-hidden="true">– – –</span>
      )}
      <span className={`vc-tile-provenance ${recorded ? '' : 'empty'}`}>
        {recorded ? provenanceLabel(reading) : 'Not recorded'}
      </span>
    </button>
  );
}
