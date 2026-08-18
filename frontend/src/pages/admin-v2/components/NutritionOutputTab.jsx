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
// Output history as entity cards. One card is one physical event, so a mixed
// diaper appears once rather than twice — the rows are grouped by their
// event_group_id rather than by guessing from timestamps.
import { useMemo, useState } from 'react';
import EntityToolbar from '../../../components/vc/EntityToolbar';
import EntityCard from '../../../components/vc/EntityCard';
import {
  BowelIcon, CatheterIcon, ClockIcon, DiaperIcon, ToiletIcon, UrineIcon,
} from '../../../components/Icons';
import {
  groupOutputEvents, eventLabel, eventConcerns, eventLocation,
} from '../../../components/nutrition/groupOutputs';
import { BRISTOL_LABELS } from '../../../components/nutrition/outputVocab';

const LOCATION_ICONS = {
  restroom: <ToiletIcon size={18} />,
  diaper: <DiaperIcon size={18} />,
  catheter: <CatheterIcon size={18} />,
  accident: <ToiletIcon size={18} />,
};

const FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'urine', label: 'Urine' },
  { value: 'bowel', label: 'Stool' },
  { value: 'concerns', label: 'With concerns' },
];

const titleCase = (v) => (v ? String(v).charAt(0).toUpperCase() + String(v).slice(1).replace(/_/g, ' ') : '');

export default function NutritionOutputTab({
  outputs = [],
  loading,
  canUpdate,
  canDelete,
  canCreate,
  onAdd,
  onEdit,
  onDeleteEvent,
  dateRange,
  formatDateTime,
}) {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');

  const events = useMemo(() => groupOutputEvents(outputs), [outputs]);

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    return events.filter((event) => {
      if (filter === 'concerns' && eventConcerns(event).length === 0) return false;
      if (filter === 'urine' || filter === 'bowel') {
        if (!event.members.some((m) => m.output_type === filter)) return false;
      }
      if (!term) return true;
      return [eventLabel(event), ...event.members.map((m) => m.notes)]
        .filter(Boolean)
        .some((field) => String(field).toLowerCase().includes(term));
    });
  }, [events, search, filter]);

  const describe = (event) => {
    const parts = [];
    for (const member of event.members) {
      if (member.output_type === 'urine') {
        if (member.diaper_wetness) parts.push(titleCase(member.diaper_wetness));
        if (member.clarity) parts.push(titleCase(member.clarity));
        if (member.amount) parts.push(`${member.amount} ${member.amount_unit || 'mL'}`);
      } else if (member.output_type === 'bowel') {
        if (member.amount_unit) parts.push(titleCase(member.amount_unit));
        const bristol = member.bristol_scale;
        if (bristol) parts.push(`Bristol ${bristol} · ${BRISTOL_LABELS[bristol]}`);
        else if (member.consistency) parts.push(titleCase(member.consistency));
        if (member.color) parts.push(titleCase(member.color));
      }
    }
    return parts.join(' · ');
  };

  const menuFor = (event) => {
    const items = [];
    if (canUpdate && !event.isMerged) {
      items.push({ label: 'Edit', onClick: () => onEdit(event.members[0]) });
    }
    if (canUpdate && event.isMerged) {
      for (const member of event.members) {
        items.push({
          label: `Edit ${member.output_type === 'bowel' ? 'stool' : member.output_type}`,
          onClick: () => onEdit(member),
        });
      }
    }
    if (canDelete) {
      items.push({
        label: event.isMerged ? `Delete event (${event.members.length} records)` : 'Delete',
        onClick: () => onDeleteEvent(event.members),
        danger: true,
      });
    }
    return items;
  };

  return (
    <>
      <div className="ec-daterange">
        <label className="ec-daterange-field">
          <span>From</span>
          <input type="date" value={dateRange.start}
                 onChange={(e) => dateRange.onStartChange(e.target.value)} />
        </label>
        <label className="ec-daterange-field">
          <span>To</span>
          <input type="date" value={dateRange.end}
                 onChange={(e) => dateRange.onEndChange(e.target.value)} />
        </label>
        {(dateRange.start || dateRange.end) && (
          <button type="button" className="ec-daterange-clear" onClick={dateRange.onClear}>
            Clear dates
          </button>
        )}
      </div>

      <EntityToolbar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search output"
        filter={{ value: filter, onChange: setFilter, label: 'Show', options: FILTERS }}
        onAdd={canCreate ? onAdd : undefined}
        addLabel="Log output"
      />

      {loading ? (
        <div className="ec-empty">Loading output…</div>
      ) : visible.length === 0 ? (
        <div className="ec-empty">
          <ToiletIcon size={32} />
          <p>
            {events.length === 0
              ? 'No output recorded for this range.'
              : 'No output matches your search.'}
          </p>
        </div>
      ) : (
        <>
          <h3 className="admin-v2-section-title">Events · {visible.length}</h3>
          <div className="ec-grid">
            {visible.map((event) => {
              const first = event.members[0];
              const location = eventLocation(first);
              const concerns = eventConcerns(event);
              const detail = describe(event);
              const notes = event.members.map((m) => m.notes).filter(Boolean).join(' · ');

              const details = [{
                icon: <ClockIcon size={18} />,
                label: 'Logged',
                value: formatDateTime(first.occurred_at),
              }];
              if (detail) {
                details.push({
                  icon: event.members.some((m) => m.output_type === 'bowel')
                    ? <BowelIcon size={18} />
                    : <UrineIcon size={18} />,
                  label: 'Detail',
                  value: detail,
                });
              }

              return (
                <EntityCard
                  key={event.key}
                  icon={LOCATION_ICONS[location] || <ToiletIcon size={18} />}
                  title={eventLabel(event)}
                  badges={event.isMerged ? [`${event.members.length} records`] : []}
                  // Concerns are flagged, not interpreted. Amber is attention,
                  // not alarm.
                  tag={concerns.length ? { label: concerns.join(' · '), tone: 'due' } : undefined}
                  details={details}
                  menu={menuFor(event)}
                >
                  {notes && <p className="ec-note">{notes}</p>}
                </EntityCard>
              );
            })}
          </div>
        </>
      )}
    </>
  );
}
