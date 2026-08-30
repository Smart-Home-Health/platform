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
// The nutrition plan: what the patient is meant to get, and what is scheduled
// to deliver it. Replaces the old Manage and Goals views, which sat apart and
// left the reader to do the reconciliation between them.
//
//   Targets   — the current goal, effective-dated, history behind a modal
//   Coverage  — scheduled totals against those targets, and the gap
//   Schedules — the recurring events producing that coverage
//
// Coverage describes the plan, not the record. Because schedules carry no
// effective dating, it can only ever describe the plan as it stands now.
import { useMemo, useState } from 'react';
import EntityCard from '../../../components/vc/EntityCard';
import EntityToolbar from '../../../components/vc/EntityToolbar';
import {
  CalendarIcon, CheckIcon, ClockIcon, DropletIcon, FlameIcon, HistoryIcon, LiquidIcon,
  NutritionIcon, TargetIcon, TubeIcon, FoodIcon, SupplementIcon,
} from '../../../components/Icons';
import { describeCron } from './cronLabel';
import './nutrition-plan.css';

const METRIC_ICONS = {
  fluids: <DropletIcon size={18} />,
  calories: <FlameIcon size={18} />,
};

const TYPE_ICONS = {
  hydration: <LiquidIcon size={18} />,
  meal: <FoodIcon size={18} />,
  snack: <FoodIcon size={18} />,
  supplement: <SupplementIcon size={18} />,
  tube_feed: <TubeIcon size={18} />,
};

const num = (v) => Math.round(v || 0).toLocaleString();

const titleCase = (v) => (v
  ? String(v).charAt(0).toUpperCase() + String(v).slice(1).replace(/_/g, ' ')
  : '');

// Targets worth stating beyond the two that get coverage bars.
const OTHER_TARGETS = [
  { key: 'protein_grams_target', label: 'Protein', unit: 'g' },
  { key: 'carbs_grams_target', label: 'Carbs', unit: 'g' },
  { key: 'fat_grams_target', label: 'Fat', unit: 'g' },
  { key: 'fiber_grams_target', label: 'Fiber', unit: 'g' },
  { key: 'sodium_mg_max', label: 'Sodium max', unit: 'mg' },
  { key: 'urine_output_ml_min', label: 'Min urine', unit: 'mL' },
  { key: 'bowel_movements_target', label: 'BM target', unit: '/day' },
];

export default function NutritionPlanTab({
  plan,                 // { goal, coverage, schedules, basis }
  loading,
  canCreate,
  canUpdate,
  canDelete,
  onEditGoal,
  onViewGoalHistory,
  onAddSchedule,
  onEditSchedule,
  onToggleSchedule,
  onDeleteSchedule,
  formatDate,
}) {
  const [search, setSearch] = useState('');

  const goal = plan?.goal || null;
  const coverage = plan?.coverage || [];
  // Memoized so the fallback array does not get a new identity each render and
  // re-run the filter below.
  const schedules = useMemo(() => plan?.schedules || [], [plan]);

  const otherTargets = useMemo(
    () => (goal ? OTHER_TARGETS.filter((t) => goal[t.key]) : []),
    [goal],
  );

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return schedules;
    return schedules.filter((s) => [s.name, s.default_item_name, s.schedule_type]
      .filter(Boolean)
      .some((f) => String(f).toLowerCase().includes(term)));
  }, [schedules, search]);

  const menuFor = (schedule) => {
    const items = [];
    if (canUpdate) {
      items.push({ label: 'Edit', onClick: () => onEditSchedule(schedule) });
      items.push({
        label: schedule.is_active ? 'Pause' : 'Resume',
        onClick: () => onToggleSchedule(schedule),
      });
    }
    if (canDelete) {
      items.push({ label: 'Delete', onClick: () => onDeleteSchedule(schedule), danger: true });
    }
    return items;
  };

  if (loading && !plan) return <div className="ec-empty">Loading plan…</div>;

  return (
    <div className="nplan">
      {/* ---- Targets ---- */}
      <section className="nplan-card">
        <header className="nplan-card-head">
          <h3><TargetIcon size={16} /> Targets</h3>
          <div className="nplan-head-actions">
            <button type="button" className="nplan-link" onClick={onViewGoalHistory}>
              <HistoryIcon size={15} /> History
            </button>
            {canUpdate && (
              <button type="button" className="nplan-link" onClick={() => onEditGoal(goal)}>
                {goal ? 'Edit' : 'Set targets'}
              </button>
            )}
          </div>
        </header>

        {!goal ? (
          <p className="nplan-empty">
            No targets set. Coverage has nothing to measure against until there are.
          </p>
        ) : (
          <>
            <div className="nplan-targets">
              {coverage.map((metric) => (
                <div key={metric.key} className={`nplan-target ${metric.key}`}>
                  <span className="nplan-target-label">{titleCase(metric.key)}</span>
                  <span className="nplan-target-value">
                    {metric.goal != null ? num(metric.goal) : '—'}
                    <em>{metric.unit}</em>
                  </span>
                </div>
              ))}
              {otherTargets.map((t) => (
                <div key={t.key} className="nplan-target">
                  <span className="nplan-target-label">{t.label}</span>
                  <span className="nplan-target-value">
                    {num(goal[t.key])}<em>{t.unit}</em>
                  </span>
                </div>
              ))}
            </div>
            <footer className="nplan-card-foot">
              <span><CalendarIcon size={14} /> Effective {formatDate(goal.effective_date)}</span>
              {goal.notes && <span className="nplan-note">{goal.notes}</span>}
            </footer>
          </>
        )}
      </section>

      {/* ---- Coverage ---- */}
      {goal && (
        <section className="nplan-card">
          <header className="nplan-card-head"><h3>Coverage</h3></header>
          <div className="nplan-coverage">
            {coverage.map((metric) => (
              <div key={metric.key} className="nplan-cov">
                <span className={`nplan-cov-icon ${metric.key}`}>{METRIC_ICONS[metric.key]}</span>
                <span className="nplan-cov-label">{titleCase(metric.key)}</span>
                <span className="nplan-cov-value">
                  {num(metric.scheduled)}
                  <em> / {metric.goal != null ? num(metric.goal) : '—'} {metric.unit}</em>
                </span>
                {metric.goal != null && (
                  <span className={`nplan-cov-tag ${metric.covered ? 'covered' : 'short'}`}>
                    {metric.covered
                      ? <><CheckIcon size={13} /> Covered</>
                      : `${num(metric.shortfall)} ${metric.unit} short`}
                  </span>
                )}
                <div className="nplan-cov-track">
                  <div
                    className={`nplan-cov-fill ${metric.covered ? 'covered' : metric.key}`}
                    style={{ width: `${metric.percent ?? 0}%` }}
                  />
                </div>
                <span className="nplan-cov-events">
                  {metric.daily_events} daily {metric.daily_events === 1 ? 'event' : 'events'}
                </span>
              </div>
            ))}
          </div>
          {plan?.fluid_target_parts && (
            <p className="nplan-note">
              Fluids target = {num(plan.fluid_target_parts.water_ml)} mL water goal
              {' + '}{num(plan.fluid_target_parts.food_ml)} mL carried by the feeds.
              Set a Total fluids target to state it directly.
            </p>
          )}
          {/* The difference between a plan and a record, stated rather than
              left for the reader to assume. */}
          <footer className="nplan-card-foot">
            <span>Coverage reflects scheduled amounts, not logged intake.</span>
          </footer>
        </section>
      )}

      {/* ---- Schedules ---- */}
      <section className="nplan-schedules">
        <EntityToolbar
          counts={[{ key: 'active', label: 'Active schedules', count: schedules.length }]}
          activeCount="active"
          onCountChange={() => {}}
          search={search}
          onSearchChange={setSearch}
          searchPlaceholder="Search schedules"
          onAdd={canCreate ? onAddSchedule : undefined}
          addLabel="Add schedule"
        />

        {visible.length === 0 ? (
          <div className="ec-empty">
            <NutritionIcon size={32} />
            <p>
              {schedules.length === 0
                ? 'Nothing scheduled yet. Add a schedule to start covering the targets.'
                : 'No schedules match your search.'}
            </p>
          </div>
        ) : (
          <div className="ec-grid">
            {visible.map((schedule) => {
              const daily = schedule.daily || {};
              const details = [
                {
                  icon: <ClockIcon size={18} />,
                  label: 'When',
                  value: describeCron(schedule.cron_expression),
                },
              ];
              if (schedule.fills_fluid_goal) {
                // Flex spot: the amount adjusts to what is left of the daily
                // fluid target, so its nominal reads as an upper bound.
                const cap = schedule.fluid_max_ml ?? schedule.default_amount;
                details.push({
                  icon: <DropletIcon size={18} />,
                  label: 'Amount',
                  value: cap
                    ? `flex — fills to target (up to ${cap} ${schedule.default_amount_unit || 'ml'})`
                    : 'flex — fills to target',
                });
              } else if (schedule.default_amount) {
                details.push({
                  icon: <DropletIcon size={18} />,
                  label: 'Amount',
                  value: `${schedule.default_amount} ${schedule.default_amount_unit || ''}`.trim(),
                });
              }
              if (schedule.default_calories) {
                details.push({
                  icon: <FlameIcon size={18} />,
                  label: 'Calories',
                  value: `${num(schedule.default_calories)} kcal`,
                });
              }
              // What this one actually puts into the day, which is the number
              // that matters when a schedule does not fire daily.
              if (daily.occurrences && daily.occurrences !== 1) {
                details.push({
                  icon: <ClockIcon size={18} />,
                  label: 'Per day',
                  value: `${Math.round(daily.occurrences * 10) / 10}×`,
                });
              }

              return (
                <EntityCard
                  key={schedule.id}
                  icon={TYPE_ICONS[schedule.schedule_type] || <NutritionIcon size={18} />}
                  title={schedule.name}
                  badges={[
                    titleCase(schedule.schedule_type),
                    schedule.default_item_name,
                  ].filter(Boolean)}
                  inactive={!schedule.is_active}
                  tag={!schedule.is_active ? { label: 'Paused', tone: 'idle' } : undefined}
                  details={details}
                  menu={menuFor(schedule)}
                >
                  {schedule.instructions && <p className="ec-note">{schedule.instructions}</p>}
                </EntityCard>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
