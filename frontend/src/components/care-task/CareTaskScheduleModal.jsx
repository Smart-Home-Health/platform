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
// The schedules for one care task: what exists, and adding or changing one.
//
// The old dialog could only add. Editing, deleting and pausing had endpoints
// and had been implemented once — in a file nothing imported — so in the app
// you could accumulate schedules but never correct one.
//
// For a nutrition-category task the form also captures what the feed usually
// is, so completing it can prefill the intake sheet. That prefill is stored as
// JSON in the schedule's notes field, which is the shape the API already reads.
import { useEffect, useState } from 'react';
import EntityModal, { EmField } from '../vc/EntityModal';
import SegmentedControl from '../vc/SegmentedControl';
import ChipGroup from '../vc/ChipGroup';
import DisclosureRow from '../vc/DisclosureRow';
import { useCronSchedule, DAYS, REPEAT_MODES } from '../vc/useCronSchedule';
import { ClockIcon, TrashIcon, EditIcon, PauseIcon, PlayIcon } from '../Icons';
import { describeCron } from '../../pages/admin-v2/components/cronLabel';
import './care-task.css';

const emptyNutrition = () => ({
  item_name: '', item_type: 'liquid', amount: '', amount_unit: 'ml', calories: '',
});

const numberOrNull = (value) => {
  const trimmed = String(value ?? '').trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
};

/** Existing prefill out of the notes field, if that is what it holds. */
const readNutrition = (notes) => {
  if (!notes) return null;
  try {
    return JSON.parse(notes)?.nutrition || null;
  } catch {
    return null;
  }
};

/** Anything in notes that is a plain note rather than prefill JSON.
 *
 * Rows written by the old Manage page carry the note under `custom_notes`;
 * this form writes `note`. Both are read, so editing a schedule saved before
 * the rebuild does not silently drop the note it was saved with.
 */
const readPlainNote = (notes) => {
  if (!notes) return '';
  try {
    const parsed = JSON.parse(notes);
    return parsed?.note || parsed?.custom_notes || '';
  } catch {
    return notes;
  }
};

export default function CareTaskScheduleModal({
  open, onOpenChange, task, schedules = [], isNutritionTask,
  canCreate, canUpdate, canDelete,
  onCreate, onUpdate, onDelete, onToggle,
  saving, error,
}) {
  const [editing, setEditing] = useState(null);
  const [description, setDescription] = useState('');
  const [note, setNote] = useState('');
  const [nutrition, setNutrition] = useState(emptyNutrition);
  const [showForm, setShowForm] = useState(false);

  const cron = useCronSchedule(editing?.cron_expression, open);
  const { reset } = cron;

  useEffect(() => {
    if (!open) return;
    setEditing(null);
    setShowForm(false);
    setDescription('');
    setNote('');
    setNutrition(emptyNutrition());
    reset(null);
  }, [open, task?.id, reset]);

  const startNew = () => {
    setEditing(null);
    setDescription('');
    setNote('');
    setNutrition(emptyNutrition());
    reset(null);
    setShowForm(true);
  };

  const startEdit = (schedule) => {
    setEditing(schedule);
    setDescription(schedule.description || '');
    setNote(readPlainNote(schedule.notes));
    setNutrition({ ...emptyNutrition(), ...(readNutrition(schedule.notes) || {}) });
    reset(schedule.cron_expression);
    setShowForm(true);
  };

  const buildNotes = () => {
    const hasPrefill = isNutritionTask && String(nutrition.item_name || '').trim();
    if (hasPrefill) {
      return JSON.stringify({
        nutrition: {
          item_name: nutrition.item_name.trim(),
          item_type: nutrition.item_type,
          amount: numberOrNull(nutrition.amount),
          amount_unit: nutrition.amount_unit,
          calories: numberOrNull(nutrition.calories),
        },
        ...(note ? { note } : {}),
      });
    }
    return note || null;
  };

  const submit = (event) => {
    event.preventDefault();
    const expression = cron.build();
    if (!expression) return;
    const payload = {
      cron_expression: expression,
      description: description.trim() || cron.summary,
      notes: buildNotes(),
    };
    if (editing) onUpdate(editing, payload);
    else onCreate(payload);
    setShowForm(false);
  };

  return (
    <EntityModal
      open={open}
      onOpenChange={onOpenChange}
      title={task ? `Schedules · ${task.name}` : 'Schedules'}
    >
      <div className="em-form ct-sched">
        {error && <div className="em-error">{error}</div>}

        {schedules.length === 0 ? (
          <p className="ct-empty">Nothing scheduled yet. This task can still be done as needed.</p>
        ) : (
          <ul className="ct-sched-list">
            {schedules.map((schedule) => {
              const prefill = readNutrition(schedule.notes);
              return (
                <li key={schedule.id} className={`ct-sched-row ${schedule.active ? '' : 'paused'}`}>
                  <span className="ct-sched-icon"><ClockIcon size={16} /></span>
                  <span className="ct-sched-text">
                    <span className="ct-sched-when">{describeCron(schedule.cron_expression)}</span>
                    {schedule.description && (
                      <span className="ct-sched-desc">{schedule.description}</span>
                    )}
                    {prefill && (
                      <span className="ct-sched-prefill">
                        Prefills {prefill.item_name}
                        {prefill.amount ? ` · ${prefill.amount} ${prefill.amount_unit || ''}` : ''}
                      </span>
                    )}
                  </span>
                  {!schedule.active && <span className="ct-sched-tag">Paused</span>}
                  <span className="ct-sched-actions">
                    {canUpdate && (
                      <>
                        <button type="button" className="ct-icon-btn"
                                aria-label={`Edit ${describeCron(schedule.cron_expression)}`}
                                onClick={() => startEdit(schedule)}>
                          <EditIcon size={15} />
                        </button>
                        <button type="button" className="ct-icon-btn"
                                aria-label={schedule.active ? 'Pause schedule' : 'Resume schedule'}
                                onClick={() => onToggle(schedule)}>
                          {schedule.active ? <PauseIcon size={15} /> : <PlayIcon size={15} />}
                        </button>
                      </>
                    )}
                    {canDelete && (
                      <button type="button" className="ct-icon-btn danger"
                              aria-label={`Delete ${describeCron(schedule.cron_expression)}`}
                              onClick={() => onDelete(schedule)}>
                        <TrashIcon size={15} />
                      </button>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        )}

        {!showForm && canCreate && (
          <button type="button" className="ct-add-btn" onClick={startNew}>
            Add a schedule
          </button>
        )}

        {showForm && (
          <form className="ct-sched-form" onSubmit={submit}>
            <h4 className="ct-sched-form-title">{editing ? 'Edit schedule' : 'New schedule'}</h4>

            <SegmentedControl
              label="Repeats" required options={REPEAT_MODES}
              value={cron.mode} onChange={cron.setMode}
            />

            {cron.mode === 'weekly' && (
              <ChipGroup label="Days" mode="multi" scroll options={DAYS}
                         value={cron.days} onChange={cron.setDays} />
            )}

            {cron.mode === 'monthly' && (
              <EmField label="Day of month" htmlFor="ct-dom">
                <select id="ct-dom" className="em-input" value={cron.dayOfMonth}
                        onChange={(e) => cron.setDayOfMonth(parseInt(e.target.value, 10))}>
                  {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
              </EmField>
            )}

            <EmField label="Time" required htmlFor="ct-time">
              <input id="ct-time" className="em-input" type="time" value={cron.time}
                     onChange={(e) => cron.setTime(e.target.value)} required />
            </EmField>

            <EmField label="Label" optional htmlFor="ct-desc">
              <input id="ct-desc" className="em-input" value={description}
                     placeholder={cron.summary}
                     onChange={(e) => setDescription(e.target.value)} />
            </EmField>

            {/* Only where completing the task records intake — decided by the
                server, so the form and the API cannot disagree about it. */}
            {isNutritionTask && (
              <DisclosureRow
                label="Intake prefill" optional
                summary={nutrition.item_name || 'What this feed usually is'}
                defaultOpen={!!nutrition.item_name}
              >
                <p className="ct-note">
                  Completing this task offers to record intake. Anything set here fills that in.
                </p>
                <EmField label="Item" htmlFor="ct-nut-item">
                  <input id="ct-nut-item" className="em-input" value={nutrition.item_name}
                         placeholder="e.g. Peptamen"
                         onChange={(e) => setNutrition({ ...nutrition, item_name: e.target.value })} />
                </EmField>
                <div className="ct-row">
                  <EmField label="Amount" htmlFor="ct-nut-amount">
                    <input id="ct-nut-amount" className="em-input" type="number" min="0" step="any"
                           inputMode="decimal" value={nutrition.amount}
                           onChange={(e) => setNutrition({ ...nutrition, amount: e.target.value })} />
                  </EmField>
                  <EmField label="Unit" htmlFor="ct-nut-unit">
                    <select id="ct-nut-unit" className="em-input" value={nutrition.amount_unit}
                            onChange={(e) => setNutrition({ ...nutrition, amount_unit: e.target.value })}>
                      {['ml', 'oz', 'cups', 'grams', 'servings'].map((u) => (
                        <option key={u} value={u}>{u}</option>
                      ))}
                    </select>
                  </EmField>
                  <EmField label="Calories" htmlFor="ct-nut-cal">
                    <input id="ct-nut-cal" className="em-input" type="number" min="0" step="any"
                           inputMode="decimal" value={nutrition.calories}
                           onChange={(e) => setNutrition({ ...nutrition, calories: e.target.value })} />
                  </EmField>
                </div>
              </DisclosureRow>
            )}

            <DisclosureRow label="Notes" optional summary={note ? note.slice(0, 40) : undefined}>
              <textarea className="em-input" rows={2} value={note}
                        placeholder="Anything the caregiver should know"
                        onChange={(e) => setNote(e.target.value)} />
            </DisclosureRow>

            <div className="ct-sched-form-foot">
              <button type="button" className="em-cancel" onClick={() => setShowForm(false)}>
                Cancel
              </button>
              <button type="submit" className="em-submit" disabled={!cron.valid || saving}>
                {saving ? 'Saving…' : (editing ? 'Save schedule' : 'Add schedule')}
              </button>
            </div>
          </form>
        )}

        <div className="em-footer">
          <button type="button" className="em-cancel" onClick={() => onOpenChange(false)}>
            Done
          </button>
        </div>
      </div>
    </EntityModal>
  );
}
