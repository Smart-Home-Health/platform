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
// The saved-item library: every juice, smoothie and formula an intake can be
// logged against. An item saved here with its label facts means logging is
// just "pick it, enter the mL" — calories and macros scale automatically.
import { useMemo, useState } from 'react';
import EntityToolbar from '../../../components/vc/EntityToolbar';
import EntityCard from '../../../components/vc/EntityCard';
import {
  BarcodeIcon, FlameIcon, FoodIcon, LiquidIcon, NutritionIcon,
  SupplementIcon, TubeIcon,
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

const perServing = (perUnit, amount) => {
  if (perUnit == null || !amount) return null;
  const total = Number(perUnit) * Number(amount);
  if (!Number.isFinite(total)) return null;
  return Number(total.toFixed(1));
};

export default function NutritionItemsTab({
  items = [],
  loading,
  canCreate,
  canUpdate,
  canDelete,
  onAdd,
  onEdit,
  onDelete,
}) {
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    return items.filter((item) => {
      if (typeFilter !== 'all' && item.item_type !== typeFilter) return false;
      if (!term) return true;
      return [item.name, item.brand, item.barcode]
        .filter(Boolean)
        .some((field) => String(field).toLowerCase().includes(term));
    });
  }, [items, search, typeFilter]);

  const menuFor = (item) => {
    const entries = [];
    if (canUpdate) entries.push({ label: 'Edit', onClick: () => onEdit(item) });
    if (canDelete) entries.push({ label: 'Remove', onClick: () => onDelete(item), danger: true });
    return entries;
  };

  return (
    <>
      <EntityToolbar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search items"
        filter={{
          value: typeFilter,
          onChange: setTypeFilter,
          label: 'Type',
          options: TYPE_FILTERS,
        }}
        onAdd={canCreate ? onAdd : undefined}
        addLabel="Add item"
      />

      {loading ? (
        <div className="ec-empty">Loading items…</div>
      ) : visible.length === 0 ? (
        <div className="ec-empty">
          <NutritionIcon size={32} />
          <p>
            {items.length === 0
              ? 'No saved items yet. Add the formula and juices once — logging then scales their nutrition automatically.'
              : 'No items match your search.'}
          </p>
        </div>
      ) : (
        <>
          <h3 className="admin-v2-section-title">Items · {visible.length}</h3>
          <div className="ec-grid">
            {visible.map((item) => {
              const serving = item.default_amount
                ? `${item.default_amount} ${item.default_amount_unit || ''}`.trim()
                : null;
              const kcal = perServing(item.calories_per_unit, item.default_amount);
              const protein = perServing(item.protein_per_unit, item.default_amount);

              const badges = [
                INTAKE_TYPE_LABELS[item.item_type] || item.item_type,
                item.brand,
              ].filter(Boolean);

              const details = [];
              if (serving) {
                details.push({
                  icon: TYPE_ICONS[item.item_type] || <LiquidIcon size={18} />,
                  label: 'Serving',
                  value: serving,
                });
              }
              if (kcal != null) {
                details.push({
                  icon: <FlameIcon size={18} />,
                  label: 'Per serving',
                  value: `${kcal} kcal${protein != null ? ` · ${protein} g protein` : ''}`,
                });
              }
              if (item.barcode) {
                details.push({
                  icon: <BarcodeIcon size={18} />,
                  label: 'Barcode',
                  value: item.barcode,
                });
              }

              return (
                <EntityCard
                  key={item.id}
                  icon={TYPE_ICONS[item.item_type] || <LiquidIcon size={18} />}
                  title={item.name}
                  badges={badges}
                  details={details}
                  menu={menuFor(item)}
                >
                  {kcal == null && (
                    <p className="ec-note">
                      No nutrition profile yet — edit to add the label facts so
                      logged amounts count toward the daily targets.
                    </p>
                  )}
                </EntityCard>
              );
            })}
          </div>
        </>
      )}
    </>
  );
}
