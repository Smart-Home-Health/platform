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
// Care-task categories: name plus a colour, used as a chip on the task and on
// the schedule board.
//
// A category whose name reads as feeding, a meal or a supplement also makes
// completing its tasks offer to record intake — worth saying in the form,
// since nothing else in the UI reveals that naming decides behaviour.
import { useEffect, useState } from 'react';
import EntityModal, { EmField } from '../vc/EntityModal';
import { EditIcon, TrashIcon, CheckIcon } from '../Icons';
import './care-task.css';

// Drawn from the vc palette rather than an arbitrary set, so categories sit
// alongside the status tones instead of competing with them.
const SWATCHES = [
  '#4da7bd', '#3fbf6a', '#f0a52e', '#f0563c',
  '#a371f7', '#6b7987', '#d17ba8', '#5b8def',
];

// Mirrors care_task_vocab.NUTRITION_CATEGORY_KEYWORDS.
const NUTRITION_KEYWORDS = ['nutrition', 'feeding', 'meal', 'food', 'drink', 'supplement'];
const readsAsNutrition = (name) => {
  const lowered = String(name || '').toLowerCase();
  return NUTRITION_KEYWORDS.some((k) => lowered.includes(k));
};

const emptyForm = () => ({ name: '', description: '', color: SWATCHES[0] });

export default function CategoryManagerModal({
  open, onOpenChange, categories = [], taskCounts = {},
  canCreate, canUpdate, canDelete,
  onCreate, onUpdate, onDelete,
  saving, error,
}) {
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    if (!open) return;
    setEditing(null);
    setShowForm(false);
    setForm(emptyForm());
  }, [open]);

  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

  const startNew = () => {
    setEditing(null);
    setForm(emptyForm());
    setShowForm(true);
  };

  const startEdit = (category) => {
    setEditing(category);
    setForm({
      name: category.name || '',
      description: category.description || '',
      color: category.color || SWATCHES[0],
    });
    setShowForm(true);
  };

  const submit = (event) => {
    event.preventDefault();
    const payload = {
      name: form.name.trim(),
      description: form.description.trim() || null,
      color: form.color,
    };
    if (editing) onUpdate(editing, payload);
    else onCreate(payload);
    setShowForm(false);
  };

  const canSave = !!form.name.trim() && !saving;

  return (
    <EntityModal open={open} onOpenChange={onOpenChange} title="Care task categories">
      <div className="em-form ct-sched">
        {error && <div className="em-error">{error}</div>}

        {categories.length === 0 ? (
          <p className="ct-empty">No categories yet.</p>
        ) : (
          <ul className="ct-cat-list">
            {categories.map((category) => {
              const count = taskCounts[category.id] || 0;
              return (
                <li key={category.id} className="ct-cat-row">
                  <span className="ct-cat-dot" style={{ background: category.color }} />
                  <span className="ct-cat-name">{category.name}</span>
                  {category.is_default && <span className="ct-sched-tag">Default</span>}
                  <span className="ct-cat-count">
                    {count} {count === 1 ? 'task' : 'tasks'}
                  </span>
                  <span className="ct-sched-actions">
                    {canUpdate && (
                      <button type="button" className="ct-icon-btn"
                              aria-label={`Edit ${category.name}`}
                              onClick={() => startEdit(category)}>
                        <EditIcon size={15} />
                      </button>
                    )}
                    {canDelete && (
                      <button
                        type="button"
                        className="ct-icon-btn danger"
                        aria-label={`Delete ${category.name}`}
                        // A category still in use cannot be removed; saying so
                        // beats letting the request fail.
                        disabled={count > 0}
                        title={count > 0 ? 'Still used by tasks' : undefined}
                        onClick={() => onDelete(category)}
                      >
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
            Add a category
          </button>
        )}

        {showForm && (
          <form className="ct-sched-form" onSubmit={submit}>
            <h4 className="ct-sched-form-title">{editing ? 'Edit category' : 'New category'}</h4>

            <EmField label="Name" required htmlFor="ct-cat-name">
              <input id="ct-cat-name" className="em-input" value={form.name}
                     placeholder="e.g. Hygiene, Feeding"
                     onChange={(e) => set({ name: e.target.value })} required />
            </EmField>

            {/* Naming quietly changes behaviour, so it is stated. */}
            {readsAsNutrition(form.name) && (
              <p className="ct-note">
                Completing tasks in this category will offer to record intake.
              </p>
            )}

            <div className="ct-cat-swatch-field">
              <span className="vseg-label"><span>Colour</span></span>
              <div className="ct-swatches" role="radiogroup" aria-label="Category colour">
                {SWATCHES.map((swatch) => (
                  <button
                    key={swatch}
                    type="button"
                    role="radio"
                    aria-checked={form.color === swatch}
                    aria-label={`Colour ${swatch}`}
                    className={`ct-swatch ${form.color === swatch ? 'on' : ''}`}
                    style={{ background: swatch }}
                    onClick={() => set({ color: swatch })}
                  >
                    {form.color === swatch && <CheckIcon size={14} />}
                  </button>
                ))}
              </div>
            </div>

            <EmField label="Description" optional htmlFor="ct-cat-desc">
              <input id="ct-cat-desc" className="em-input" value={form.description}
                     onChange={(e) => set({ description: e.target.value })} />
            </EmField>

            <div className="ct-sched-form-foot">
              <button type="button" className="em-cancel" onClick={() => setShowForm(false)}>
                Cancel
              </button>
              <button type="submit" className="em-submit" disabled={!canSave}>
                {saving ? 'Saving…' : (editing ? 'Save category' : 'Add category')}
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
