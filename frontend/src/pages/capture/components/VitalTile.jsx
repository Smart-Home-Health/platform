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
//
// `row` switches to the list layout used by the live dashboard's docked panel
// (a side panel is too narrow for the two-up card grid). `liveValue` /
// `onAcceptLive` add the connected-oximeter affordance: a reading the
// caregiver accepts rather than types, recorded as source 'pulse_ox'.
import { CheckCircleIcon } from '../../../components/Icons';

const SOURCE_LABEL = { pulse_ox: 'Pulse ox', manual: 'Manual' };

function provenanceLabel(reading) {
  const t = new Date(reading.measuredAt)
    .toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  return `${SOURCE_LABEL[reading.source] || 'Manual'} · ${t}`;
}

export default function VitalTile({ config, reading, justSaved, onOpen, row = false, liveValue = null, onAcceptLive = null }) {
  const recorded = Boolean(reading);
  const isBP = config.key === 'blood_pressure';
  const offerLive = !recorded && liveValue != null && onAcceptLive;

  const tile = (
    <button
      type="button"
      className={`vc-tile ${row ? 'row' : ''} ${justSaved ? 'just-saved' : ''}`}
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

  // Grid mode returns the bare tile so the phone and admin-embedded surfaces
  // keep their existing grid-child structure untouched.
  if (!row) return tile;

  return (
    <div className="vc-tile-wrap">
      {tile}
      {offerLive && (
        <button
          type="button"
          className="vc-tile-accept"
          onClick={onAcceptLive}
          aria-label={`Record ${config.label} ${liveValue}${config.unit} from the pulse ox`}
        >
          <span className="vc-tile-accept-value">
            {liveValue}<span className="vc-unit">{config.unit}</span>
          </span>
          <span className="vc-tile-accept-hint">Use live</span>
        </button>
      )}
    </div>
  );
}
