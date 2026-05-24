import React, { useMemo } from 'react';
import {
  PlusIcon,
  EditIcon,
  TrashIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CalendarIcon,
  CheckIcon,
  DropletIcon,
  FlameIcon,
  UrineIcon,
  BowelIcon,
  VomitIcon,
  LiquidIcon,
  FoodIcon,
  SupplementIcon,
  ToiletIcon,
  TargetIcon,
} from '../../../components/Icons';

/**
 * Nutrition Overview — single-day rollup of intake + output for one patient.
 *
 * Layout:
 *   1. Sticky date nav (shared CSS with /care/schedule)
 *   2. Quick-action buttons (Log Intake / Log Output)
 *   3. Summary cards: fluids, calories, urine, solid output
 *   4. Combined intake+output table sorted chronologically
 *
 * The parent (AdminV2Nutrition) owns all data fetching; this component is
 * presentational + small derived calculations only.
 */
const NutritionOverview = ({
  selectedDate,
  onPrevDay,
  onNextDay,
  onGoToToday,
  onPickDate,
  formatDateForApi,
  formatDisplayDate,
  isToday,
  intakes,
  outputs,
  currentGoal,
  loading,
  onLogIntake,
  onLogOutput,
  onEditIntake,
  onEditOutput,
  onDeleteIntake,
  onDeleteOutput,
  canCreate,
  canUpdate,
  canDelete,
  intakeToMl,
  outputToMl,
  formatTimeShort,
}) => {
  // Derived totals for the summary cards. useMemo prevents recomputing on
  // every keystroke in a sibling input.
  const totals = useMemo(() => {
    const totalFluidMl = intakes.reduce((sum, i) => sum + intakeToMl(i), 0);
    const totalCalories = intakes.reduce((sum, i) => sum + (parseFloat(i.calories) || 0), 0);
    const totalProtein = intakes.reduce((sum, i) => sum + (parseFloat(i.protein_grams) || 0), 0);

    const urineEvents = outputs.filter(o => o.output_type === 'urine');
    const bowelEvents = outputs.filter(o => o.output_type === 'bowel');
    const vomitEvents = outputs.filter(o => o.output_type === 'vomit');
    const totalUrineMl = urineEvents.reduce((sum, o) => sum + outputToMl(o), 0);

    // Concerns surfaced anywhere across the day's outputs.
    const concerns = outputs.some(
      o => o.has_blood || o.has_mucus || o.pain_reported || o.straining
    );

    return {
      totalFluidMl: Math.round(totalFluidMl),
      totalCalories: Math.round(totalCalories),
      totalProtein: Math.round(totalProtein),
      urineCount: urineEvents.length,
      bowelCount: bowelEvents.length,
      vomitCount: vomitEvents.length,
      totalUrineMl: Math.round(totalUrineMl),
      netFluidMl: Math.round(totalFluidMl - totalUrineMl),
      concerns,
    };
  }, [intakes, outputs, intakeToMl, outputToMl]);

  // Goal numbers — only show goal-related UI if a target is actually set.
  const fluidGoal = currentGoal?.total_fluid_ml_target || currentGoal?.water_ml_target || 0;
  const calorieGoal = currentGoal?.calories_target || 0;
  const urineGoal = currentGoal?.urine_output_ml_min || 0;
  const bowelGoal = currentGoal?.bowel_movements_target || 0;

  const fluidPct = fluidGoal > 0 ? Math.min(100, (totals.totalFluidMl / fluidGoal) * 100) : 0;
  const caloriePct = calorieGoal > 0 ? Math.min(100, (totals.totalCalories / calorieGoal) * 100) : 0;

  // Merge diaper outputs that landed within a short window of each other —
  // urine + bowel from the same physical diaper change are logged as two
  // rows but should render as one. Non-diaper outputs and lone diapers are
  // passed through unchanged.
  const mergedOutputs = useMemo(() => {
    const MERGE_WINDOW_MS = 3 * 60 * 1000; // 3 min — generous for back-to-back saves
    const standalone = [];
    const diapers = [];
    for (const o of outputs) {
      (o.is_diaper ? diapers : standalone).push(o);
    }
    diapers.sort((a, b) => new Date(a.occurred_at) - new Date(b.occurred_at));
    const groups = [];
    for (const d of diapers) {
      const last = groups[groups.length - 1];
      if (last && Math.abs(new Date(d.occurred_at) - new Date(last[0].occurred_at)) <= MERGE_WINDOW_MS) {
        last.push(d);
      } else {
        groups.push([d]);
      }
    }
    const merged = [];
    for (const g of groups) {
      if (g.length === 1) {
        merged.push(g[0]);
      } else {
        // Synthesize a single "mixed diaper" row. Carry both members so the
        // edit/delete actions can fan out across them.
        merged.push({
          ...g[0],
          id: `mixed-${g.map(m => m.id).join('-')}`,
          output_type: 'mixed_diaper',
          _members: g,
          // Use the earliest time so the chronological sort still works.
          occurred_at: g[0].occurred_at,
        });
      }
    }
    return [...standalone, ...merged];
  }, [outputs]);

  // Combined chronological log. Tag each row with its source so the table
  // renderer knows whether to call onEditIntake / onEditOutput. Intakes
  // bucket by scheduled_time when present so a late-logged 9pm feed sorts
  // into its 9pm slot rather than the 12:30am actual-given time.
  const combinedLog = useMemo(() => {
    const intakeRows = intakes.map(i => ({
      kind: 'intake',
      id: `i-${i.id}`,
      raw: i,
      time: i.scheduled_time || i.consumed_at,
    }));
    const outputRows = mergedOutputs.map(o => ({
      kind: 'output',
      id: `o-${o.id}`,
      raw: o,
      time: o.occurred_at,
    }));
    return [...intakeRows, ...outputRows].sort((a, b) => new Date(a.time) - new Date(b.time));
  }, [intakes, mergedOutputs]);

  // Pick an icon for an intake row based on item_type. Used in the table.
  const intakeRowIcon = (intake) => {
    if (intake.item_type === 'liquid' || intake.item_type === 'hydration') return <LiquidIcon size={14} />;
    if (intake.item_type === 'supplement') return <SupplementIcon size={14} />;
    return <FoodIcon size={14} />;
  };

  const outputRowIcon = (output) => {
    if (output.output_type === 'urine') return <UrineIcon size={14} />;
    if (output.output_type === 'bowel') return <BowelIcon size={14} />;
    if (output.output_type === 'vomit') return <VomitIcon size={14} />;
    if (output.output_type === 'mixed_diaper') return <ToiletIcon size={14} />;
    return <ToiletIcon size={14} />;
  };

  const outputRowLabel = (output) => {
    if (output.output_type === 'mixed_diaper') return 'Mixed';
    return output.output_type;
  };

  const outputRowTitle = (output) => {
    if (output.output_type === 'mixed_diaper') {
      const types = output._members.map(m => m.output_type);
      return `Diaper change (${types.join(' + ')})`;
    }
    return output.output_type;
  };

  const intakeDescription = (intake) => {
    const parts = [];
    if (intake.amount) parts.push(`${intake.amount} ${intake.amount_unit || ''}`.trim());
    if (intake.calories) parts.push(`${Math.round(intake.calories)} cal`);
    if (intake.meal_type) parts.push(intake.meal_type);
    return parts.join(' • ');
  };

  // Per-member description used by both single-output and mixed-output rows.
  const singleOutputParts = (output) => {
    const parts = [];
    if (output.amount) parts.push(`${output.amount} ${output.amount_unit || ''}`.trim());
    if (output.consistency) parts.push(output.consistency);
    if (output.color) parts.push(output.color);
    if (output.diaper_wetness) parts.push(`${output.diaper_wetness}`);
    return parts;
  };

  const outputDescription = (output) => {
    if (output.output_type === 'mixed_diaper') {
      // "Urine: wet • Bowel: loose, brown • diaper"
      const memberStrs = output._members.map(m => {
        const inner = singleOutputParts(m).join(', ');
        const type = m.output_type.charAt(0).toUpperCase() + m.output_type.slice(1);
        return inner ? `${type}: ${inner}` : type;
      });
      return [...memberStrs, 'diaper'].join(' • ');
    }
    const parts = singleOutputParts(output);
    if (output.is_diaper) parts.push('diaper');
    return parts.join(' • ');
  };

  const outputConcerns = (output) => {
    const flags = [];
    if (output.has_blood) flags.push('Blood');
    if (output.has_mucus) flags.push('Mucus');
    if (output.pain_reported) flags.push('Pain');
    if (output.straining) flags.push('Straining');
    return flags;
  };

  return (
    <div className="nutrition-overview">
      {/* Sticky Date Nav — same classes as /care/schedule */}
      <div className="admin-v2-schedule-nav">
        <button className="admin-v2-btn admin-v2-btn-icon" onClick={onPrevDay} title="Previous Day">
          <ChevronLeftIcon size={20} />
        </button>

        <div className="admin-v2-schedule-date">
          <CalendarIcon size={18} />
          <span>{formatDisplayDate(selectedDate)}</span>
          {isToday(selectedDate) && (
            <span className="admin-v2-today-badge">Today</span>
          )}
        </div>

        <button className="admin-v2-btn admin-v2-btn-icon" onClick={onNextDay} title="Next Day">
          <ChevronRightIcon size={20} />
        </button>

        {!isToday(selectedDate) && (
          <button className="admin-v2-btn admin-v2-btn-sm" onClick={onGoToToday} style={{ marginLeft: '1rem' }}>
            Go to Today
          </button>
        )}

        <input
          type="date"
          value={formatDateForApi(selectedDate)}
          onChange={(e) => onPickDate(new Date(e.target.value + 'T12:00:00'))}
          className="admin-v2-date-picker"
        />
      </div>

      {/* Quick log actions */}
      {canCreate && (
        <div className="nutrition-overview-actions">
          <button
            type="button"
            className="admin-v2-btn admin-v2-btn-primary"
            onClick={onLogIntake}
          >
            <PlusIcon size={16} />
            Log Intake
          </button>
          <button
            type="button"
            className="admin-v2-btn admin-v2-btn-secondary"
            onClick={onLogOutput}
          >
            <PlusIcon size={16} />
            Log Output
          </button>
        </div>
      )}

      {/* Summary cards */}
      <div className="admin-v2-schedule-summary nutrition-overview-summary">
        {/* Fluids in */}
        <div className="admin-v2-schedule-summary-card">
          <div className="admin-v2-schedule-summary-header">
            <span className="admin-v2-schedule-summary-icon water">
              <DropletIcon size={24} />
            </span>
            <span className="admin-v2-schedule-summary-title">Fluids In</span>
          </div>
          <div className="admin-v2-schedule-summary-values">
            <div className="admin-v2-schedule-summary-row">
              <span className="label">Total:</span>
              <span className="value scheduled">{totals.totalFluidMl} ml</span>
            </div>
            <div className="admin-v2-schedule-summary-row">
              <span className="label">Goal:</span>
              <span className="value">{fluidGoal > 0 ? `${fluidGoal} ml` : 'Not set'}</span>
            </div>
            {fluidGoal > 0 && (
              <div className="admin-v2-schedule-summary-row">
                <span className="label">Progress:</span>
                <span className={`value ${fluidPct >= 100 ? 'success' : fluidPct >= 75 ? '' : 'warning'}`}>
                  {Math.round(fluidPct)}%
                </span>
              </div>
            )}
          </div>
          {fluidGoal > 0 && (
            <div className="admin-v2-schedule-progress">
              <div
                className={`admin-v2-schedule-progress-bar ${fluidPct >= 100 ? 'success' : fluidPct >= 75 ? 'good' : 'warning'}`}
                style={{ width: `${fluidPct}%` }}
              />
            </div>
          )}
          <div className="admin-v2-schedule-summary-detail">
            {intakes.filter(i => i.item_type === 'liquid' || i.item_type === 'hydration').length} liquid entries
          </div>
        </div>

        {/* Calories in */}
        <div className="admin-v2-schedule-summary-card">
          <div className="admin-v2-schedule-summary-header">
            <span className="admin-v2-schedule-summary-icon calories">
              <FlameIcon size={24} />
            </span>
            <span className="admin-v2-schedule-summary-title">Calories In</span>
          </div>
          <div className="admin-v2-schedule-summary-values">
            <div className="admin-v2-schedule-summary-row">
              <span className="label">Total:</span>
              <span className="value scheduled">{totals.totalCalories} cal</span>
            </div>
            <div className="admin-v2-schedule-summary-row">
              <span className="label">Goal:</span>
              <span className="value">{calorieGoal > 0 ? `${calorieGoal} cal` : 'Not set'}</span>
            </div>
            {calorieGoal > 0 && (
              <div className="admin-v2-schedule-summary-row">
                <span className="label">Progress:</span>
                <span className={`value ${caloriePct >= 100 ? 'success' : caloriePct >= 75 ? '' : 'warning'}`}>
                  {Math.round(caloriePct)}%
                </span>
              </div>
            )}
          </div>
          {calorieGoal > 0 && (
            <div className="admin-v2-schedule-progress">
              <div
                className={`admin-v2-schedule-progress-bar ${caloriePct >= 100 ? 'success' : caloriePct >= 75 ? 'good' : 'warning'}`}
                style={{ width: `${caloriePct}%` }}
              />
            </div>
          )}
          <div className="admin-v2-schedule-summary-detail">
            {totals.totalProtein}g protein logged
          </div>
        </div>

        {/* Urine */}
        <div className={`admin-v2-schedule-summary-card nutrition-output-card ${totals.urineCount > 0 ? 'has-events' : 'no-events'}`}>
          <div className="admin-v2-schedule-summary-header">
            <span className="admin-v2-schedule-summary-icon water">
              <UrineIcon size={24} />
            </span>
            <span className="admin-v2-schedule-summary-title">Urine</span>
            {totals.urineCount > 0 ? (
              <span className="nutrition-output-status present" title="Logged today">
                <CheckIcon size={14} />
              </span>
            ) : (
              <span className="nutrition-output-status absent" title="No log today" />
            )}
          </div>
          <div className="admin-v2-schedule-summary-values">
            <div className="admin-v2-schedule-summary-row">
              <span className="label">Events:</span>
              <span className="value scheduled">{totals.urineCount}</span>
            </div>
            <div className="admin-v2-schedule-summary-row">
              <span className="label">Volume:</span>
              <span className="value">{totals.totalUrineMl > 0 ? `${totals.totalUrineMl} ml` : '—'}</span>
            </div>
            {urineGoal > 0 && (
              <div className="admin-v2-schedule-summary-row">
                <span className="label">Min target:</span>
                <span className={`value ${totals.totalUrineMl >= urineGoal ? 'success' : 'warning'}`}>
                  {urineGoal} ml
                </span>
              </div>
            )}
          </div>
          <div className="admin-v2-schedule-summary-detail">
            Net fluid: {totals.netFluidMl >= 0 ? '+' : ''}{totals.netFluidMl} ml
          </div>
        </div>

        {/* Solid (bowel) — with vomit surfaced when relevant */}
        <div className={`admin-v2-schedule-summary-card nutrition-output-card ${totals.bowelCount > 0 ? 'has-events' : 'no-events'}`}>
          <div className="admin-v2-schedule-summary-header">
            <span className="admin-v2-schedule-summary-icon care">
              <BowelIcon size={24} />
            </span>
            <span className="admin-v2-schedule-summary-title">Solid Output</span>
            {totals.bowelCount > 0 ? (
              <span className="nutrition-output-status present" title="Logged today">
                <CheckIcon size={14} />
              </span>
            ) : (
              <span className="nutrition-output-status absent" title="No log today" />
            )}
          </div>
          <div className="admin-v2-schedule-summary-values">
            <div className="admin-v2-schedule-summary-row">
              <span className="label">Bowel:</span>
              <span className="value scheduled">{totals.bowelCount}</span>
            </div>
            {bowelGoal > 0 && (
              <div className="admin-v2-schedule-summary-row">
                <span className="label">Target:</span>
                <span className={`value ${totals.bowelCount >= bowelGoal ? 'success' : 'warning'}`}>
                  {bowelGoal}/day
                </span>
              </div>
            )}
            {totals.vomitCount > 0 && (
              <div className="admin-v2-schedule-summary-row">
                <span className="label">Vomit:</span>
                <span className="value warning">{totals.vomitCount}</span>
              </div>
            )}
            {totals.concerns && (
              <div className="admin-v2-schedule-summary-row">
                <span className="label">Concerns:</span>
                <span className="value warning">flagged</span>
              </div>
            )}
          </div>
          <div className="admin-v2-schedule-summary-detail">
            {totals.bowelCount === 0 && totals.vomitCount === 0 && totals.urineCount === 0
              ? 'No output logged today'
              : `${outputs.length} total output entries`}
          </div>
        </div>
      </div>

      {/* Combined log */}
      <div className="admin-v2-section">
        <div className="admin-v2-section-header">
          <h3>Daily Log</h3>
          <span className="nutrition-overview-count">
            {intakes.length} intake • {outputs.length} output
          </span>
        </div>

        {loading ? (
          <div className="admin-v2-loading">Loading...</div>
        ) : combinedLog.length === 0 ? (
          <div className="admin-v2-empty-state">
            <TargetIcon size={32} />
            <p>No entries logged for this day.</p>
            {canCreate && (
              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                <button className="admin-v2-btn admin-v2-btn-primary" onClick={onLogIntake}>
                  <PlusIcon size={16} /> Log Intake
                </button>
                <button className="admin-v2-btn admin-v2-btn-secondary" onClick={onLogOutput}>
                  <PlusIcon size={16} /> Log Output
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="admin-v2-table-container">
            <table className="admin-v2-table nutrition-overview-table">
              <thead>
                <tr>
                  <th style={{ width: 90 }}>Time</th>
                  <th style={{ width: 90 }}>Kind</th>
                  <th>Item</th>
                  <th>Details</th>
                  <th>Notes</th>
                  <th style={{ width: 80 }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {combinedLog.map((row) => {
                  if (row.kind === 'intake') {
                    const i = row.raw;
                    // Display the scheduled time when present (so a late
                    // 9pm feed reads "9:00 PM" even if given at 12:30am).
                    // Surface the actual given time in the tooltip when it
                    // diverges by more than a minute so caregivers can still
                    // see the real time without it dominating the row.
                    const scheduledStr = i.scheduled_time ? formatTimeShort(i.scheduled_time) : null;
                    const consumedStr = formatTimeShort(i.consumed_at);
                    const displayTime = scheduledStr || consumedStr;
                    const showActualHint =
                      scheduledStr && consumedStr && scheduledStr !== consumedStr;
                    return (
                      <tr key={row.id} className="nutrition-row-intake">
                        <td title={showActualHint ? `Given at ${consumedStr}` : undefined}>
                          {displayTime}
                          {showActualHint && (
                            <span className="nutrition-row-given-hint" title={`Given at ${consumedStr}`}>
                              *
                            </span>
                          )}
                        </td>
                        <td>
                          <span className="nutrition-row-pill intake">
                            {intakeRowIcon(i)}
                            {i.item_type === 'liquid' || i.item_type === 'hydration'
                              ? 'Liquid'
                              : i.item_type === 'supplement'
                                ? 'Suppl.'
                                : 'Food'}
                          </span>
                        </td>
                        <td><strong>{i.item_name || '—'}</strong></td>
                        <td>{intakeDescription(i) || '—'}</td>
                        <td className="nutrition-row-notes">{i.notes || ''}</td>
                        <td>
                          <div className="admin-v2-table-actions">
                            {canUpdate && (
                              <button
                                className="admin-v2-action-btn admin-v2-action-btn-edit"
                                onClick={() => onEditIntake(i)}
                                title="Edit intake"
                              >
                                <EditIcon size={14} />
                              </button>
                            )}
                            {canDelete && (
                              <button
                                className="admin-v2-action-btn admin-v2-action-btn-delete"
                                onClick={() => onDeleteIntake(i)}
                                title="Delete intake"
                              >
                                <TrashIcon size={14} />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  }
                  // output row (may be a synthesized mixed_diaper carrying _members)
                  const o = row.raw;
                  const isMixed = o.output_type === 'mixed_diaper';
                  // For mixed rows, concerns from any member float up.
                  const concerns = isMixed
                    ? Array.from(new Set(o._members.flatMap(outputConcerns)))
                    : outputConcerns(o);
                  // Edit/delete fan-out: for mixed, edit the first member,
                  // delete iterates all members. The simpler single-member
                  // case stays unchanged.
                  const handleEditClick = () => isMixed ? onEditOutput(o._members[0]) : onEditOutput(o);
                  const handleDeleteClick = () => {
                    if (!isMixed) return onDeleteOutput(o);
                    // Sequential delete via existing single-item callback —
                    // parent's modal will appear once per member.
                    o._members.forEach(m => onDeleteOutput(m));
                  };
                  return (
                    <tr key={row.id} className="nutrition-row-output">
                      <td>{formatTimeShort(o.occurred_at)}</td>
                      <td>
                        <span className={`nutrition-row-pill output ${o.output_type}`}>
                          {outputRowIcon(o)}
                          {outputRowLabel(o)}
                        </span>
                      </td>
                      <td><strong style={{ textTransform: 'capitalize' }}>{outputRowTitle(o)}</strong></td>
                      <td>
                        {outputDescription(o) || '—'}
                        {concerns.length > 0 && (
                          <span className="admin-v2-badge admin-v2-badge-danger" style={{ marginLeft: 6 }}>
                            {concerns.join(', ')}
                          </span>
                        )}
                      </td>
                      <td className="nutrition-row-notes">{o.notes || ''}</td>
                      <td>
                        <div className="admin-v2-table-actions">
                          {canUpdate && (
                            <button
                              className="admin-v2-action-btn admin-v2-action-btn-edit"
                              onClick={handleEditClick}
                              title={isMixed ? 'Edit first entry (urine)' : 'Edit output'}
                            >
                              <EditIcon size={14} />
                            </button>
                          )}
                          {canDelete && (
                            <button
                              className="admin-v2-action-btn admin-v2-action-btn-delete"
                              onClick={handleDeleteClick}
                              title={isMixed ? `Delete ${o._members.length} entries` : 'Delete output'}
                            >
                              <TrashIcon size={14} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default NutritionOverview;
