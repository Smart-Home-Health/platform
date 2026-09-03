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
// Targets are effective-dated, so the sheet has to be clear that saving adds a
// version rather than replacing one.
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import GoalSheet from './GoalSheet';

const setup = (props = {}) => {
  const onSave = vi.fn();
  const utils = render(<GoalSheet open onSave={onSave} onClose={vi.fn()} {...props} />);
  return { ...utils, onSave };
};

const saveButton = () => screen.getByRole('button', { name: /Set targets|Save changes/ });
const setField = (id, value) =>
  fireEvent.change(document.getElementById(id), { target: { value } });

beforeEach(() => vi.clearAllMocks());

describe('GoalSheet', () => {
  it('says that saving creates a version rather than overwriting', () => {
    setup();
    expect(screen.getByText(/previous targets are kept, not overwritten/)).toBeInTheDocument();
  });

  it('frames it as editing that version when one is open', () => {
    setup({ editing: { id: 1, effective_date: '2026-04-01T00:00:00Z', water_ml_target: 1710 } });
    expect(screen.getByText(/Editing this version/)).toBeInTheDocument();
    expect(document.getElementById('goal-water_ml_target')).toHaveValue(1710);
  });

  it('defaults the effective date to today', () => {
    setup();
    const today = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const expected = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
    expect(document.getElementById('goal-date')).toHaveValue(expected);
  });

  it('sends only the targets that were filled in', () => {
    const { onSave } = setup();
    setField('goal-water_ml_target', '1710');
    setField('goal-calories_target', '1575');
    fireEvent.click(saveButton());

    const payload = onSave.mock.calls[0][0];
    expect(payload.water_ml_target).toBe(1710);
    expect(payload.calories_target).toBe(1575);
    // Blank fields are null, not zero — an unset target is not a target of 0.
    expect(payload.protein_grams_target).toBeNull();
    expect(payload.sodium_mg_max).toBeNull();
  });

  it('keeps the effective date on the day that was picked', () => {
    // Parsed at midday local, so the timezone cannot round it onto the day
    // before once it becomes an ISO string.
    const { onSave } = setup();
    setField('goal-date', '2026-04-01');
    fireEvent.click(saveButton());
    const sent = new Date(onSave.mock.calls[0][0].effective_date);
    expect(sent.getFullYear()).toBe(2026);
    expect(sent.getMonth()).toBe(3);
    expect(sent.getDate()).toBe(1);
  });

  it('leads with the two metrics coverage is reported against', () => {
    setup();
    expect(screen.getByText('Fluids')).toBeInTheDocument();
    expect(screen.getByText('Calories')).toBeInTheDocument();
    // The rest stays collapsed until wanted.
    expect(screen.getByText('Macronutrients')).toBeInTheDocument();
    expect(document.getElementById('goal-protein_grams_target')).toBeNull();
  });

  it('reveals the macro fields on request', () => {
    setup();
    fireEvent.click(screen.getByText('Macronutrients'));
    expect(document.getElementById('goal-protein_grams_target')).not.toBeNull();
  });

  it('will not save without an effective date', () => {
    setup();
    setField('goal-date', '');
    expect(saveButton()).toBeDisabled();
  });
});
