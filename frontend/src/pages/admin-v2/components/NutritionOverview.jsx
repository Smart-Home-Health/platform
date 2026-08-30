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
// Nutrition Overview — one day of intake and output for one patient.
//
//   1. Date nav
//   2. The two logging actions
//   3. Today at a glance      — the four numbers worth knowing
//   4. Intake progress        — fluids and calories against their goals
//   5. Output summary         — counts, plus a measured fluid balance
//   6. Daily timeline         — everything, in order, filterable
//
// The parent (AdminV2Nutrition) owns all fetching; this is presentational
// plus small derived numbers.
import { useMemo, useState } from 'react';
import {
  BowelIcon, CalendarIcon, CheckIcon, ChevronLeftIcon, ChevronRightIcon, DiaperIcon,
  DropletIcon, FlameIcon, FoodIcon, LiquidIcon, PlusIcon, SupplementIcon, ToiletIcon,
  TubeIcon, UrineIcon, VomitIcon,
} from '../../../components/Icons';
import {
  groupOutputEvents, eventLabel, eventConcerns, eventLocation,
} from '../../../components/nutrition/groupOutputs';
import './nutrition-overview.css';

const TIMELINE_PREVIEW = 5;

const titleCase = (v) => (v
  ? String(v).charAt(0).toUpperCase() + String(v).slice(1).replace(/_/g, ' ')
  : '');

const num = (value) => Math.round(value || 0).toLocaleString();

const intakeIcon = (intake) => {
  if (intake.item_type === 'tube_feed') return <TubeIcon size={18} />;
  if (intake.item_type === 'supplement') return <SupplementIcon size={18} />;
  if (intake.item_type === 'liquid' || intake.item_type === 'hydration') return <LiquidIcon size={18} />;
  return <FoodIcon size={18} />;
};

const outputIcon = (event) => {
  const location = eventLocation(event.members[0]);
  if (location === 'diaper') return <DiaperIcon size={18} />;
  if (location === 'catheter') return <UrineIcon size={18} />;
  if (event.members.some((m) => m.output_type === 'vomit')) return <VomitIcon size={18} />;
  if (event.members.every((m) => m.output_type === 'bowel')) return <BowelIcon size={18} />;
  return <ToiletIcon size={18} />;
};

const NutritionOverview = ({
  selectedDate,
  onPrevDay,
  onNextDay,
  onGoToToday,
  onPickDate,
  formatDateForApi,
  isToday,
  intakes,
  outputs,
  currentGoal,
  loading,
  onLogIntake,
  onLogOutput,
  onEditIntake,
  onEditOutput,
  canCreate,
  intakeToMl,
  outputToMl,
  formatTimeShort,
  onViewIntake,
  onViewOutput,
}) => {
  const [filter, setFilter] = useState('all');
  const [expanded, setExpanded] = useState(false);

  const events = useMemo(() => groupOutputEvents(outputs), [outputs]);

  const totals = useMemo(() => {
    const totalFluidMl = intakes.reduce((sum, i) => sum + intakeToMl(i), 0);
    const totalCalories = intakes.reduce((sum, i) => sum + (parseFloat(i.calories) || 0), 0);

    const urineRows = outputs.filter((o) => o.output_type === 'urine');
    const bowelRows = outputs.filter((o) => o.output_type === 'bowel');
    const measuredUrineMl = urineRows.reduce((sum, o) => sum + outputToMl(o), 0);

    // Diapers are described by wetness, so most carry no volume. Counting how
    // many were unmeasured is what lets the fluid balance below say what it
    // actually covers instead of implying a precision it does not have.
    const diaperEvents = events.filter((e) => eventLocation(e.members[0]) === 'diaper');
    const unmeasuredDiapers = diaperEvents.filter(
      (e) => !e.members.some((m) => outputToMl(m) > 0),
    ).length;

    const concerns = [...new Set(events.flatMap(eventConcerns))];

    return {
      totalFluidMl,
      totalCalories,
      measuredUrineMl,
      urineCount: urineRows.length,
      bowelCount: bowelRows.length,
      diaperCount: diaperEvents.length,
      unmeasuredDiapers,
      concerns,
      balanceMl: totalFluidMl - measuredUrineMl,
    };
  }, [intakes, outputs, events, intakeToMl, outputToMl]);

  // The combined daily fluid target — intake below counts ALL fluid (feed
  // mixes included), so the goal side must too. The backend lifts a
  // water-only goal by the food schedules' expected fluid and says so in
  // fluid_target_parts.
  const fluidGoal = currentGoal?.effective_fluid_target_ml
    || currentGoal?.total_fluid_ml_target
    || currentGoal?.water_ml_target
    || 0;
  const fluidParts = currentGoal?.fluid_target_parts || null;
  const fluidGoalTitle = fluidParts
    ? `${num(fluidParts.water_ml)} mL water goal + ${num(fluidParts.food_ml)} mL carried by the scheduled feeds`
    : undefined;
  const calorieGoal = currentGoal?.calories_target || 0;
  const pct = (value, goal) => (goal > 0 ? Math.min(100, (value / goal) * 100) : 0);
  const fluidPct = pct(totals.totalFluidMl, fluidGoal);
  const caloriePct = pct(totals.totalCalories, calorieGoal);

  // Intakes bucket by scheduled_time when there is one, so a late-logged 9pm
  // feed sorts into its 9pm slot rather than the small hours it was entered.
  const timeline = useMemo(() => {
    const rows = [
      ...intakes.map((i) => ({
        kind: 'intake',
        key: `i-${i.id}`,
        time: i.scheduled_time || i.consumed_at,
        icon: intakeIcon(i),
        title: i.item_name,
        detail: [
          i.amount ? `${i.amount} ${i.amount_unit || ''}`.trim() : null,
          i.calories ? `${Math.round(i.calories)} kcal` : null,
          i.item_type === 'tube_feed' ? 'Tube feed' : null,
          i.meal_type,
        ].filter(Boolean).join(' · '),
        onOpen: () => onEditIntake?.(i),
      })),
      ...events.map((event) => {
        const parts = [];
        for (const member of event.members) {
          if (member.output_type === 'urine') {
            if (member.diaper_wetness) parts.push(titleCase(member.diaper_wetness));
            if (member.amount) parts.push(`${member.amount} ${member.amount_unit || 'mL'}`);
            if (member.clarity) parts.push(titleCase(member.clarity));
          } else if (member.output_type === 'bowel') {
            if (member.amount_unit) parts.push(`${member.amount_unit} stool`);
            if (member.bristol_scale) parts.push(`Bristol ${member.bristol_scale}`);
            else if (member.consistency) parts.push(titleCase(member.consistency));
          }
        }
        return {
          kind: 'output',
          key: `o-${event.key}`,
          time: event.time,
          icon: outputIcon(event),
          title: eventLabel(event),
          detail: parts.join(' · '),
          concerns: eventConcerns(event),
          onOpen: () => onEditOutput?.(event.members[0]),
        };
      }),
    ];
    return rows.sort((a, b) => new Date(b.time) - new Date(a.time));
  }, [intakes, events, onEditIntake, onEditOutput]);

  const filtered = filter === 'all' ? timeline : timeline.filter((r) => r.kind === filter);
  const shown = expanded ? filtered : filtered.slice(0, TIMELINE_PREVIEW);
  const lastIntake = timeline.find((r) => r.kind === 'intake');

  return (
    <div className="novw">
      {/* Date nav */}
      <div className="novw-datenav">
        <button type="button" className="novw-nav-btn" onClick={onPrevDay} aria-label="Previous day">
          <ChevronLeftIcon size={18} />
        </button>
        <button
          type="button"
          className={`novw-today ${isToday(selectedDate) ? 'on' : ''}`}
          onClick={onGoToToday}
        >
          Today
        </button>
        <span className="novw-date">
          {selectedDate.toLocaleDateString(undefined, { weekday: 'short' })}
          {' · '}
          {selectedDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
        </span>
        <button type="button" className="novw-nav-btn" onClick={onNextDay} aria-label="Next day">
          <ChevronRightIcon size={18} />
        </button>
        <label className="novw-nav-btn novw-pick" title="Pick a date">
          <CalendarIcon size={18} />
          <span className="novw-sr">Pick a date</span>
          <input
            type="date"
            value={formatDateForApi(selectedDate)}
            onChange={(e) => {
              // Parse as local midnight; `new Date('2026-08-18')` is UTC and
              // lands on the previous day west of Greenwich.
              if (e.target.value) onPickDate(new Date(`${e.target.value}T00:00:00`));
            }}
          />
        </label>
      </div>

      {/* The two things this page exists to start */}
      {canCreate && (
        <div className="novw-actions">
          <button type="button" className="novw-action primary" onClick={onLogIntake}>
            <PlusIcon size={16} /> Log intake
          </button>
          <button type="button" className="novw-action" onClick={onLogOutput}>
            <PlusIcon size={16} /> Log bathroom
          </button>
        </div>
      )}

      {/* At a glance */}
      <section className="novw-card">
        <header className="novw-card-head"><h3>Today at a glance</h3></header>
        <div className="novw-glance">
          <div className="novw-stat fluids">
            <span className="novw-stat-label">Fluids</span>
            <span className="novw-stat-value">{num(totals.totalFluidMl)} <em>mL</em></span>
            {fluidGoal > 0 && (
              <span className="novw-stat-sub">{Math.round(fluidPct)}% of {num(fluidGoal)}</span>
            )}
          </div>
          <div className="novw-stat calories">
            <span className="novw-stat-label">Calories</span>
            <span className="novw-stat-value">{num(totals.totalCalories)}</span>
            {calorieGoal > 0 && (
              <span className="novw-stat-sub">{Math.round(caloriePct)}% of {num(calorieGoal)}</span>
            )}
          </div>
          <div className="novw-stat urine">
            <span className="novw-stat-label">Urine</span>
            <span className="novw-stat-value">{totals.urineCount}</span>
            <span className="novw-stat-sub">
              {totals.measuredUrineMl > 0 ? `${num(totals.measuredUrineMl)} mL` : 'events'}
            </span>
          </div>
          <div className="novw-stat bowel">
            <span className="novw-stat-label">Bowel</span>
            <span className="novw-stat-value">{totals.bowelCount}</span>
            <span className="novw-stat-sub">events</span>
          </div>
        </div>
      </section>

      {/* Progress against goals — only where a goal is actually set */}
      {(fluidGoal > 0 || calorieGoal > 0) && (
        <section className="novw-card">
          <header className="novw-card-head"><h3>Intake progress</h3></header>
          <div className="novw-bars">
            {fluidGoal > 0 && (
              <div className="novw-bar-row">
                <span className="novw-bar-icon fluids"><DropletIcon size={18} /></span>
                <span className="novw-bar-label">Fluids</span>
                <span className="novw-bar-value" title={fluidGoalTitle}>
                  {num(totals.totalFluidMl)} <em>/ {num(fluidGoal)} mL</em>
                </span>
                <span className="novw-bar-pct">{Math.round(fluidPct)}%</span>
                <div className="novw-bar-track">
                  <div className="novw-bar-fill fluids" style={{ width: `${fluidPct}%` }} />
                </div>
              </div>
            )}
            {calorieGoal > 0 && (
              <div className="novw-bar-row">
                <span className="novw-bar-icon calories"><FlameIcon size={18} /></span>
                <span className="novw-bar-label">Calories</span>
                <span className="novw-bar-value">
                  {num(totals.totalCalories)} <em>/ {num(calorieGoal)} kcal</em>
                </span>
                <span className="novw-bar-pct">{Math.round(caloriePct)}%</span>
                <div className="novw-bar-track">
                  <div className="novw-bar-fill calories" style={{ width: `${caloriePct}%` }} />
                </div>
              </div>
            )}
          </div>
          <footer className="novw-card-foot">
            <span>
              {lastIntake ? `Last intake · ${formatTimeShort(lastIntake.time)}` : 'No intake yet today'}
            </span>
            {onViewIntake && (
              <button type="button" className="novw-link" onClick={onViewIntake}>View intake</button>
            )}
          </footer>
        </section>
      )}

      {/* Output */}
      <section className="novw-card">
        <header className="novw-card-head"><h3>Output summary</h3></header>
        <div className="novw-outgrid">
          <div className="novw-outcell">
            <span className="novw-outcell-icon fluids"><DropletIcon size={18} /></span>
            <span className="novw-outcell-text">
              <span className="novw-outcell-label">Measured urine</span>
              <span className="novw-outcell-value">{num(totals.measuredUrineMl)} mL</span>
            </span>
          </div>
          <div className="novw-outcell">
            <span className="novw-outcell-icon"><DiaperIcon size={18} /></span>
            <span className="novw-outcell-text">
              <span className="novw-outcell-label">Diaper events</span>
              <span className="novw-outcell-value">{totals.diaperCount}</span>
            </span>
          </div>
          <div className="novw-outcell">
            <span className="novw-outcell-icon"><BowelIcon size={18} /></span>
            <span className="novw-outcell-text">
              <span className="novw-outcell-label">Bowel events</span>
              <span className="novw-outcell-value">{totals.bowelCount}</span>
            </span>
          </div>
          <div className={`novw-outcell ${totals.concerns.length ? 'flagged' : ''}`}>
            <span className={`novw-outcell-icon ${totals.concerns.length ? 'due' : 'ok'}`}>
              {totals.concerns.length ? <BowelIcon size={18} /> : <CheckIcon size={18} />}
            </span>
            <span className="novw-outcell-text">
              <span className="novw-outcell-label">Concerns</span>
              <span className="novw-outcell-value">
                {totals.concerns.length ? totals.concerns.join(' · ') : 'None'}
              </span>
            </span>
          </div>
        </div>
        <footer className="novw-card-foot balance">
          <span className="novw-balance">
            <span className="novw-balance-label">Measured fluid balance</span>
            <span className="novw-balance-value">
              {totals.balanceMl >= 0 ? '+' : '−'}{num(Math.abs(totals.balanceMl))} mL
            </span>
          </span>
          {/* Say what the number covers rather than implying it is the whole
              picture — wetness is not a volume. */}
          {totals.unmeasuredDiapers > 0 && (
            <span className="novw-balance-note">
              Excludes {totals.unmeasuredDiapers} unmeasured diaper
              {totals.unmeasuredDiapers === 1 ? ' event' : ' events'}.
            </span>
          )}
          {onViewOutput && (
            <button type="button" className="novw-link" onClick={onViewOutput}>View output</button>
          )}
        </footer>
      </section>

      {/* Timeline */}
      <section className="novw-card">
        <header className="novw-card-head"><h3>Daily timeline</h3></header>
        <div className="novw-filters" role="tablist" aria-label="Timeline filter">
          {[
            { value: 'all', label: 'All' },
            { value: 'intake', label: 'Intake' },
            { value: 'output', label: 'Output' },
          ].map((f) => (
            <button
              key={f.value}
              type="button"
              role="tab"
              aria-selected={filter === f.value}
              className={`novw-filter ${filter === f.value ? 'on' : ''}`}
              onClick={() => { setFilter(f.value); setExpanded(false); }}
            >
              {f.label}
            </button>
          ))}
        </div>

        {loading ? (
          <p className="novw-empty">Loading…</p>
        ) : filtered.length === 0 ? (
          <p className="novw-empty">Nothing recorded for this day.</p>
        ) : (
          <>
            <ol className="novw-timeline">
              {shown.map((row) => (
                <li key={row.key} className={`novw-tl-row ${row.kind}`}>
                  <span className="novw-tl-time">{formatTimeShort(row.time)}</span>
                  <span className="novw-tl-dot" aria-hidden="true" />
                  <span className={`novw-tl-icon ${row.kind}`}>{row.icon}</span>
                  <button type="button" className="novw-tl-body" onClick={row.onOpen}>
                    <span className="novw-tl-title">{row.title}</span>
                    {row.detail && <span className="novw-tl-detail">{row.detail}</span>}
                    {row.concerns?.length > 0 && (
                      <span className="novw-tl-concerns">{row.concerns.join(' · ')}</span>
                    )}
                  </button>
                  <span className="novw-tl-chevron" aria-hidden="true">
                    <ChevronRightIcon size={16} />
                  </span>
                </li>
              ))}
            </ol>
            {filtered.length > TIMELINE_PREVIEW && (
              <button
                type="button"
                className="novw-showall"
                onClick={() => setExpanded((e) => !e)}
              >
                {expanded ? 'Show fewer' : `Show all ${filtered.length} entries`}
              </button>
            )}
          </>
        )}
      </section>

      {/* Concern status for the day, stated plainly. */}
      <div className={`novw-status ${totals.concerns.length ? 'flagged' : ''}`}>
        <span className="novw-status-dot" aria-hidden="true" />
        {totals.concerns.length
          ? `${totals.concerns.join(' · ')} recorded today`
          : 'No concerns recorded today'}
      </div>
    </div>
  );
};

export default NutritionOverview;
