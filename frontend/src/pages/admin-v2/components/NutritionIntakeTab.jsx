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
// Intake history as entity cards, matching the Medications rebuild. Replaces
// the admin-v2-table markup this page used to share with the rest of the
// pre-vc admin UI.
import { useMemo, useState } from 'react';
import EntityToolbar from '../../../components/vc/EntityToolbar';
import EntityCard from '../../../components/vc/EntityCard';
import {
  ClockIcon, FlameIcon, FoodIcon, LiquidIcon, SupplementIcon, TubeIcon, NutritionIcon,
} from '../../../components/Icons';
import { INTAKE_TYPE_LABELS } from '../../../components/nutrition/intakeVocab';

const TYPE_ICONS = {
  liquid: <LiquidIcon size={18} />,
  food: <FoodIcon size={18} />,
  supplement: <SupplementIcon size={18} />,
  tube_feed: <TubeIcon size={18} />,
};

const TYPE_FILTERS = [
  { value: 'all', label: 'All types' },
  { value: 'liquid', label: 'Liquid' },
  { value: 'food', label: 'Food' },
  { value: 'supplement', label: 'Supplement' },
  { value: 'tube_feed', label: 'Tube feed' },
];

export default function NutritionIntakeTab({
  intakes = [],
  loading,
  canUpdate,
  canDelete,
  canCreate,
  onAdd,
  onEdit,
  onDelete,
  dateRange,      // { start, end, onStartChange, onEndChange, onClear }
  formatDateTime,
}) {
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    return intakes.filter((intake) => {
      if (typeFilter !== 'all' && intake.item_type !== typeFilter) return false;
      if (!term) return true;
      return [intake.item_name, intake.meal_type, intake.notes]
        .filter(Boolean)
        .some((field) => String(field).toLowerCase().includes(term));
    });
  }, [intakes, search, typeFilter]);

  const menuFor = (intake) => {
    const items = [];
    if (canUpdate) items.push({ label: 'Edit', onClick: () => onEdit(intake) });
    if (canDelete) items.push({ label: 'Delete', onClick: () => onDelete(intake), danger: true });
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
        searchPlaceholder="Search intake"
        filter={{
          value: typeFilter,
          onChange: setTypeFilter,
          label: 'Type',
          options: TYPE_FILTERS,
        }}
        onAdd={canCreate ? onAdd : undefined}
        addLabel="Log intake"
      />

      {loading ? (
        <div className="ec-empty">Loading intake…</div>
      ) : visible.length === 0 ? (
        <div className="ec-empty">
          <NutritionIcon size={32} />
          <p>
            {intakes.length === 0
              ? 'No intake recorded for this range.'
              : 'No intake matches your search.'}
          </p>
        </div>
      ) : (
        <>
          <h3 className="admin-v2-section-title">Intake · {visible.length}</h3>
          <div className="ec-grid">
            {visible.map((intake) => {
              const badges = [
                INTAKE_TYPE_LABELS[intake.item_type] || intake.item_type,
                intake.meal_type,
                intake.feed_route,
              ].filter(Boolean);

              const details = [
                {
                  icon: <ClockIcon size={18} />,
                  label: 'Logged',
                  value: formatDateTime(intake.consumed_at),
                },
                {
                  icon: TYPE_ICONS[intake.item_type] || <LiquidIcon size={18} />,
                  label: 'Amount',
                  value: `${intake.amount} ${intake.amount_unit}`,
                },
              ];
              if (intake.calories != null) {
                details.push({
                  icon: <FlameIcon size={18} />,
                  label: 'Calories',
                  value: String(intake.calories),
                });
              }
              if (intake.rate_ml_per_hr != null) {
                details.push({
                  icon: <TubeIcon size={18} />,
                  label: 'Rate',
                  value: `${intake.rate_ml_per_hr} mL/hr`,
                });
              }

              return (
                <EntityCard
                  key={intake.id}
                  icon={TYPE_ICONS[intake.item_type] || <LiquidIcon size={18} />}
                  title={intake.item_name}
                  badges={badges}
                  details={details}
                  menu={menuFor(intake)}
                >
                  {intake.notes && <p className="ec-note">{intake.notes}</p>}
                </EntityCard>
              );
            })}
          </div>
        </>
      )}
    </>
  );
}
