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
// Add or edit a care task.
//
// A task can be left uncategorised — the column allows it and the form has
// always offered it, though the API used to reject the choice with a 422.
import { useEffect, useState } from 'react';
import EntityModal, { EmField } from '../vc/EntityModal';
import SegmentedControl from '../vc/SegmentedControl';
import DisclosureRow from '../vc/DisclosureRow';
import './care-task.css';

const emptyForm = () => ({ name: '', category_id: '', description: '', active: true });

export default function CareTaskSheet({
  open, onClose, onSave, editing, categories = [], saving, error,
}) {
  const [form, setForm] = useState(emptyForm);
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

  useEffect(() => {
    if (!open) return;
    if (!editing) { setForm(emptyForm()); return; }
    setForm({
      name: editing.name || '',
      category_id: editing.category_id ? String(editing.category_id) : '',
      description: editing.description || '',
      active: editing.active !== false,
    });
  }, [open, editing]);

  const selected = categories.find((c) => String(c.id) === form.category_id);
  const canSave = !!form.name.trim() && !saving;

  const submit = (event) => {
    event.preventDefault();
    onSave({
      name: form.name.trim(),
      // Genuinely optional: an uncategorised task has no colour and never
      // triggers the intake prompt, which is a legitimate thing to want.
      category_id: form.category_id ? Number(form.category_id) : null,
      description: form.description.trim() || null,
      active: form.active,
    });
  };

  return (
    <EntityModal
      open={open}
      onOpenChange={(next) => { if (!next) onClose?.(); }}
      title={editing ? 'Edit care task' : 'Add care task'}
    >
      <form className="em-form ct-sched" onSubmit={submit}>
        {error && <div className="em-error">{error}</div>}

        <EmField label="Name" required htmlFor="ct-name">
          <input id="ct-name" className="em-input" value={form.name}
                 placeholder="e.g. Reposition, Morning meds"
                 onChange={(e) => set({ name: e.target.value })} required />
        </EmField>

        <EmField label="Category" optional htmlFor="ct-category">
          <select id="ct-category" className="em-input" value={form.category_id}
                  onChange={(e) => set({ category_id: e.target.value })}>
            <option value="">No category</option>
            {categories.map((c) => (
              <option key={c.id} value={String(c.id)}>{c.name}</option>
            ))}
          </select>
        </EmField>

        {selected && (
          <div className="ct-cat-preview">
            <span className="ct-cat-dot" style={{ background: selected.color }} />
            <span>Shows as a {selected.name} chip on the schedule.</span>
          </div>
        )}

        <DisclosureRow
          label="Description"
          optional
          summary={form.description ? form.description.slice(0, 50) : undefined}
        >
          <textarea className="em-input" rows={3} value={form.description}
                    placeholder="What this task involves"
                    onChange={(e) => set({ description: e.target.value })} />
        </DisclosureRow>

        {editing && (
          <SegmentedControl
            label="Status"
            options={[
              { value: 'active', label: 'Active' },
              { value: 'paused', label: 'Paused' },
            ]}
            value={form.active ? 'active' : 'paused'}
            onChange={(v) => set({ active: v === 'active' })}
          />
        )}

        <div className="em-footer">
          <button type="button" className="em-cancel" onClick={onClose}>Cancel</button>
          <button type="submit" className="em-submit" disabled={!canSave}>
            {saving ? 'Saving…' : (editing ? 'Save changes' : 'Add task')}
          </button>
        </div>
      </form>
    </EntityModal>
  );
}
