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
// The medication sheet. Medications had no component tests at all, so these
// also stand in for the add/edit behaviour that moved off the manage page.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import MedicationSheet from './MedicationSheet';

const PROVIDERS = [{ id: 7, title: 'Dr.', first_name: 'Ada', last_name: 'Turek' }];
const PHARMACIES = [{ id: 3, name: 'CVS Pharmacy' }];

const MED = {
  id: 42, name: 'Baclofen', concentration: '10 mg', quantity: 42,
  quantity_unit: 'tablets', low_stock_threshold: 14,
  low_stock_threshold_type: 'quantity',
  instructions: 'Give 1 tablet through G-tube with 30 mL water flush.',
  start_date: '2026-04-01T00:00:00Z', end_date: null,
  prescriber_id: 7, pharmacy_id: 3, notes: '', as_needed: false,
  active: true, updated_at: '2026-08-17T10:00:00Z',
};

const onSave = vi.fn();

const renderSheet = (props = {}) => render(
  <MedicationSheet
    open
    onOpenChange={vi.fn()}
    providers={PROVIDERS}
    pharmacies={PHARMACIES}
    onSave={onSave}
    {...props}
  />,
);

beforeEach(() => {
  vi.clearAllMocks();
  onSave.mockResolvedValue(undefined);
});

describe('adding a medication', () => {
  it('walks three steps and will not advance without the first', async () => {
    renderSheet();
    const advance = screen.getByRole('button', { name: /Continue to stock/i });
    expect(advance).toBeDisabled();

    fireEvent.change(screen.getByLabelText(/Medication name/), { target: { value: 'Baclofen' } });
    fireEvent.change(screen.getByLabelText(/^Strength/), { target: { value: '10 mg' } });
    fireEvent.change(screen.getByLabelText(/Instructions/), { target: { value: 'Give 1' } });
    await waitFor(() => expect(screen.getByRole('button', { name: /Continue to stock/i })).toBeEnabled());
  });

  it('names what is still missing rather than only disabling the button', () => {
    renderSheet();
    expect(screen.getByText(/Still needed:/)).toHaveTextContent('name');
    expect(screen.getByText(/Still needed:/)).toHaveTextContent('strength');
  });

  it('sends one payload with the fields the record has', async () => {
    renderSheet();
    fireEvent.change(screen.getByLabelText(/Medication name/), { target: { value: 'Baclofen' } });
    fireEvent.change(screen.getByLabelText(/^Strength/), { target: { value: '10 mg' } });
    fireEvent.change(screen.getByLabelText(/Instructions/), { target: { value: 'Give 1 tablet' } });
    fireEvent.click(screen.getByRole('button', { name: /Continue to stock/i }));
    fireEvent.change(screen.getByLabelText(/Amount on hand/), { target: { value: '42' } });
    fireEvent.click(screen.getByRole('button', { name: /Continue to care details/i }));
    fireEvent.change(screen.getByLabelText(/^Started/), { target: { value: '2026-04-01' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add medication' }));

    await waitFor(() => expect(onSave).toHaveBeenCalled());
    const payload = onSave.mock.calls[0][0];
    expect(payload).toMatchObject({
      name: 'Baclofen', concentration: '10 mg', quantity: 42,
      quantity_unit: 'tablets', start_date: '2026-04-01', as_needed: false,
    });
    // No dosage-form column exists, so nothing may claim to set one.
    expect(payload).not.toHaveProperty('form');
    // active is not accepted on create; is_global drives the scope keys.
    expect(payload).not.toHaveProperty('active');
    expect(payload).toHaveProperty('is_global');
  });

  it('offers scope only when creating, since editing cannot change it', () => {
    renderSheet();
    expect(screen.getByText(/Available to every patient/)).toBeInTheDocument();
  });
});

describe('editing a medication', () => {
  it('opens on the record and shows what it is about', () => {
    renderSheet({ medication: MED, scheduleCount: 3 });
    expect(screen.getByText('Baclofen')).toBeInTheDocument();
    expect(screen.getByText('Active')).toBeInTheDocument();
    expect(screen.getByText('3 sch')).toBeInTheDocument();
  });

  it('starts with nothing to save', () => {
    renderSheet({ medication: MED });
    expect(screen.getByText('No changes yet')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled();
  });

  it('marks the fields that differ and counts them', () => {
    renderSheet({ medication: MED });
    fireEvent.change(screen.getByLabelText(/Medication name/), { target: { value: 'Baclofen ER' } });
    expect(screen.getByText('1 unsaved change')).toBeInTheDocument();
    expect(screen.getAllByText('Changed')).toHaveLength(1);

    fireEvent.change(screen.getByLabelText(/^Strength/), { target: { value: '20 mg' } });
    expect(screen.getByText('2 unsaved changes')).toBeInTheDocument();
  });

  it('discards back to the saved record', () => {
    renderSheet({ medication: MED });
    fireEvent.change(screen.getByLabelText(/Medication name/), { target: { value: 'Something else' } });
    fireEvent.click(screen.getByRole('button', { name: 'Discard changes' }));
    expect(screen.getByLabelText(/Medication name/)).toHaveValue('Baclofen');
    expect(screen.getByText('No changes yet')).toBeInTheDocument();
  });

  it('warns that renaming changes how past doses read', () => {
    // The log stores the dose amount and refers back to this record for the
    // name and strength, so it does NOT keep what they were at the time.
    renderSheet({ medication: MED });
    expect(screen.queryByText(/changes how earlier logs read/)).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/Medication name/), { target: { value: 'Baclofen ER' } });
    expect(screen.getByText(/changes how earlier logs read/)).toBeInTheDocument();
  });

  it('reports the schedules without offering to edit them here', () => {
    const onViewSchedules = vi.fn();
    renderSheet({ medication: MED, scheduleCount: 3, onViewSchedules });
    expect(screen.getByText(/Given on 3 schedules/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /View schedules/ }));
    expect(onViewSchedules).toHaveBeenCalled();
  });

  it('says so when a medication has no schedules yet', () => {
    renderSheet({ medication: MED, scheduleCount: 0 });
    expect(screen.getByText(/No schedules yet/)).toBeInTheDocument();
  });

  it('sends null when the low-stock alert is cleared', async () => {
    // The API used to drop nulls, so the alert could be set but never unset.
    renderSheet({ medication: MED });
    fireEvent.click(screen.getByText('Stock and alerts'));
    fireEvent.change(screen.getByLabelText(/Warn me below/), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onSave.mock.calls[0][0].low_stock_threshold).toBeNull();
  });

  it('sends null when a prescriber is detached', async () => {
    renderSheet({ medication: MED });
    fireEvent.click(screen.getByText('Care details'));
    fireEvent.change(screen.getByLabelText(/Prescriber/), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onSave.mock.calls[0][0].prescriber_id).toBeNull();
  });

  it('offers the end date the API has always accepted', async () => {
    renderSheet({ medication: MED });
    fireEvent.click(screen.getByText('Care details'));
    fireEvent.change(screen.getByLabelText(/^Ends/), { target: { value: '2026-12-31' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onSave.mock.calls[0][0].end_date).toBe('2026-12-31');
  });

  it('deactivates without deleting', async () => {
    renderSheet({ medication: MED });
    fireEvent.click(screen.getByText('Advanced'));
    fireEvent.click(screen.getByLabelText('Deactivate this medication'));
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onSave.mock.calls[0][0].active).toBe(false);
  });

  it('surfaces a save failure instead of closing quietly', async () => {
    onSave.mockRejectedValue(new Error('Concentration is required'));
    renderSheet({ medication: MED });
    fireEvent.change(screen.getByLabelText(/Medication name/), { target: { value: 'Baclofen ER' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(screen.getByText('Concentration is required')).toBeInTheDocument());
  });

  it('does not offer a scope control it cannot apply', () => {
    // is_global is not on the update model, so editing it would no-op.
    renderSheet({ medication: MED });
    expect(screen.queryByText(/Available to every patient/)).not.toBeInTheDocument();
  });

  it('states usage as the two the record can hold', () => {
    renderSheet({ medication: MED });
    // SegmentedControl is a radiogroup, which is the right semantics here.
    expect(screen.getByRole('radio', { name: 'Scheduled' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'As needed' })).toBeInTheDocument();
    // "Both" is the boolean plus schedules, which this sheet reports instead.
    expect(screen.queryByRole('radio', { name: 'Both' })).not.toBeInTheDocument();
  });
});
