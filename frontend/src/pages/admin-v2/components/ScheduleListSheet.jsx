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
// The Plan tab's schedule list, as the same full-screen sheet the item
// picker uses: search on top, Active/Inactive tabs, flat one-line-per-
// schedule rows. The card grid it replaces pushed Targets and Coverage off
// the screen the moment a plan had more than a couple of schedules.
//
// Tapping a row edits it; pause/resume and delete ride the row's trailing
// buttons. The edit sheet (an EntityModal) stacks above this one — nested
// Radix dialogs — so closing it lands back on the list.
import { useMemo, useState } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import {
  FoodIcon, LiquidIcon, NutritionIcon, PauseIcon, PlayIcon, PlusIcon,
  SearchIcon, SupplementIcon, TrashIcon, TubeIcon, XIcon,
} from '../../../components/Icons';
import { describeCron } from './cronLabel';
import '../../../components/nutrition/item-picker.css';
import './nutrition-plan.css';

const TYPE_ICONS = {
  hydration: <LiquidIcon size={18} />,
  meal: <FoodIcon size={18} />,
  snack: <FoodIcon size={18} />,
  supplement: <SupplementIcon size={18} />,
  tube_feed: <TubeIcon size={18} />,
};

const titleCase = (v) => (v
  ? String(v).charAt(0).toUpperCase() + String(v).slice(1).replace(/_/g, ' ')
  : '');

// One line saying what the schedule delivers: amount (or the flex label for
// a fills-the-goal spot), calories, and the per-day factor when not daily.
const amountLine = (schedule) => {
  const parts = [describeCron(schedule.cron_expression)];
  if (schedule.fills_fluid_goal) {
    const cap = schedule.fluid_max_ml ?? schedule.default_amount;
    parts.push(cap
      ? `flex — fills to target (up to ${cap} ${schedule.default_amount_unit || 'ml'})`
      : 'flex — fills to target');
  } else if (schedule.default_amount) {
    parts.push(`${schedule.default_amount} ${schedule.default_amount_unit || ''}`.trim());
  }
  if (schedule.default_calories) {
    parts.push(`${Math.round(schedule.default_calories)} kcal`);
  }
  const occurrences = schedule.daily?.occurrences;
  if (occurrences && occurrences !== 1) {
    parts.push(`${Math.round(occurrences * 10) / 10}× / day`);
  }
  return parts.filter(Boolean).join(' · ');
};

export default function ScheduleListSheet({
  open,
  onClose,
  schedules,
  canCreate,
  canUpdate,
  canDelete,
  onAddSchedule,
  onEditSchedule,
  onToggleSchedule,
  onDeleteSchedule,
}) {
  const [tab, setTab] = useState('active');
  const [search, setSearch] = useState('');

  const { active, inactive } = useMemo(() => ({
    active: schedules.filter((s) => s.is_active !== false),
    inactive: schedules.filter((s) => s.is_active === false),
  }), [schedules]);

  const listed = useMemo(() => {
    const pool = tab === 'active' ? active : inactive;
    const term = search.trim().toLowerCase();
    if (!term) return pool;
    return pool.filter((s) => [s.name, s.default_item_name, s.schedule_type]
      .filter(Boolean)
      .some((f) => String(f).toLowerCase().includes(term)));
  }, [tab, active, inactive, search]);

  return (
    <DialogPrimitive.Root
      open={open}
      onOpenChange={(next) => { if (!next) onClose?.(); }}
    >
      <DialogPrimitive.Portal>
        <DialogPrimitive.Content
          className="nip-root"
          aria-describedby={undefined}
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <div className="nip-head">
            <DialogPrimitive.Title className="nip-title">Schedules</DialogPrimitive.Title>
            <DialogPrimitive.Close className="nip-close" aria-label="Close">
              <XIcon size={18} />
            </DialogPrimitive.Close>
          </div>

          <div className="nip-search-row">
            <span className="nip-search-icon" aria-hidden="true"><SearchIcon size={18} /></span>
            <input
              id="sls-search"
              className="em-input nip-search"
              value={search}
              placeholder="Search schedules"
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div className="nip-tabs" role="tablist" aria-label="Schedule state">
            {[
              { value: 'active', label: `Active · ${active.length}` },
              { value: 'inactive', label: `Inactive · ${inactive.length}` },
            ].map((t) => (
              <button
                key={t.value}
                type="button"
                role="tab"
                aria-selected={tab === t.value}
                className={`nip-tab${tab === t.value ? ' active' : ''}`}
                onClick={() => setTab(t.value)}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="nip-list">
            {listed.map((schedule) => (
              <div key={schedule.id} className="nip-item sls-row">
                <button
                  type="button"
                  className="sls-row-main"
                  onClick={() => { if (canUpdate) onEditSchedule(schedule); }}
                  title={canUpdate ? 'Edit schedule' : undefined}
                >
                  <span className="nip-item-icon">
                    {TYPE_ICONS[schedule.schedule_type] || <NutritionIcon size={18} />}
                  </span>
                  <span className="nip-item-text">
                    <span className="nip-item-name">{schedule.name}</span>
                    <span className="nip-item-meta">
                      {[titleCase(schedule.schedule_type), schedule.default_item_name]
                        .filter(Boolean).join(' · ')}
                    </span>
                    <span className="nip-item-meta sls-row-when">{amountLine(schedule)}</span>
                  </span>
                </button>
                {canUpdate && (
                  <button
                    type="button"
                    className="sls-row-action"
                    aria-label={schedule.is_active ? `Pause ${schedule.name}` : `Resume ${schedule.name}`}
                    title={schedule.is_active ? 'Pause — stops firing, keeps history' : 'Resume'}
                    onClick={() => onToggleSchedule(schedule)}
                  >
                    {schedule.is_active ? <PauseIcon size={16} /> : <PlayIcon size={16} />}
                  </button>
                )}
                {canDelete && (
                  <button
                    type="button"
                    className="sls-row-action danger"
                    aria-label={`Delete ${schedule.name}`}
                    onClick={() => onDeleteSchedule(schedule)}
                  >
                    <TrashIcon size={16} />
                  </button>
                )}
              </div>
            ))}
            {listed.length === 0 && (
              <p className="nip-empty">
                {search.trim()
                  ? 'No schedules match.'
                  : (tab === 'active'
                    ? 'Nothing scheduled yet. Add a schedule to start covering the targets.'
                    : 'Nothing paused.')}
              </p>
            )}

            {canCreate && tab === 'active' && (
              <button type="button" className="nip-add-manual" onClick={onAddSchedule}>
                <PlusIcon size={16} />
                Add schedule
              </button>
            )}
          </div>

          <div className="nip-footer">
            <button type="button" className="nip-done sls-done" onClick={() => onClose?.()}>
              Done
            </button>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
