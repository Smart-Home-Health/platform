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
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import CareTasksTab from './CareTasksTab';
import NutritionItemsTab from './NutritionItemsTab';

afterEach(() => vi.unstubAllGlobals());

describe('recent history on item cards', () => {
  it.each([
    ['care task', CareTasksTab, { tasks: [{ id: 8, name: 'Example' }] }, '/api/care-tasks/history?patient_id=5&task_id=8&limit=10',
      { history: [{ id: 4, completed_at: '2026-11-20T18:00:00Z', completion_status: 'skipped' }] }, 'Skipped'],
    ['nutrition', NutritionItemsTab, { items: [{ id: 7, name: 'Example', item_type: 'liquid' }] }, '/api/patients/5/nutrition-intake?item_id=7&limit=10',
      [{ id: 3, consumed_at: '2026-11-20T18:00:00Z', amount: 125, amount_unit: 'mL' }], '125 mL'],
  ])('opens scoped %s history from its card', async (_category, Tab, props, path, response, label) => {
    const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => response });
    vi.stubGlobal('fetch', fetch);
    const { rerender } = render(<Tab {...props} />);
    expect(screen.queryByRole('button', { name: 'View history for Example' })).toBeNull();
    rerender(<Tab {...props} patientId={5} />);
    expect(fetch).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'View history for Example' }));
    expect(await screen.findByText(label)).toBeVisible();
    expect(screen.getByRole('dialog', { name: 'Recent history · Example' })).toBeVisible();
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining(path), expect.objectContaining({ credentials: 'include' }));
    fireEvent.click(screen.getByRole('button', { name: /close/i }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
