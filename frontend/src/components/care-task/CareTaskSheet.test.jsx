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
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import CareTaskSheet from './CareTaskSheet';

const CATEGORIES = [
  { id: 1, name: 'Hygiene', color: '#4da7bd' },
  { id: 2, name: 'Feeding', color: '#3fbf6a' },
];

const setup = (props = {}) => {
  const onSave = vi.fn();
  const utils = render(
    <CareTaskSheet open onSave={onSave} onClose={vi.fn()} categories={CATEGORIES} {...props} />,
  );
  return { ...utils, onSave };
};

const saveButton = () => screen.getByRole('button', { name: /Add task|Save changes/ });

beforeEach(() => vi.clearAllMocks());

describe('CareTaskSheet', () => {
  it('needs a name', () => {
    setup();
    expect(saveButton()).toBeDisabled();
    fireEvent.change(document.getElementById('ct-name'), { target: { value: 'Reposition' } });
    expect(saveButton()).not.toBeDisabled();
  });

  it('lets a task be left uncategorised', () => {
    // The column is nullable and the form always offered this, but the create
    // model required a category, so choosing it returned a 422.
    const { onSave } = setup();
    fireEvent.change(document.getElementById('ct-name'), { target: { value: 'Reposition' } });
    fireEvent.click(saveButton());
    expect(onSave.mock.calls[0][0].category_id).toBeNull();
  });

  it('sends the chosen category', () => {
    const { onSave } = setup();
    fireEvent.change(document.getElementById('ct-name'), { target: { value: 'Morning feed' } });
    fireEvent.change(document.getElementById('ct-category'), { target: { value: '2' } });
    fireEvent.click(saveButton());
    expect(onSave.mock.calls[0][0].category_id).toBe(2);
  });

  it('offers status only when editing', () => {
    setup();
    expect(screen.queryByText('Status')).not.toBeInTheDocument();
  });

  it('reads an existing task back, including no category', () => {
    setup({ editing: { id: 1, name: 'Reposition', category_id: null, active: false } });
    expect(document.getElementById('ct-name')).toHaveValue('Reposition');
    expect(document.getElementById('ct-category')).toHaveValue('');
    expect(screen.getByRole('radio', { name: 'Paused' })).toHaveAttribute('aria-checked', 'true');
  });

  it('sends a cleared description as null so it can be removed', () => {
    // The update route used to drop nulls, making a description impossible to
    // clear once set.
    const { onSave } = setup({ editing: { id: 1, name: 'Reposition', description: 'old' } });
    fireEvent.click(screen.getByText('Description'));
    fireEvent.change(screen.getByPlaceholderText('What this task involves'), { target: { value: '' } });
    fireEvent.click(saveButton());
    expect(onSave.mock.calls[0][0].description).toBeNull();
  });
});
