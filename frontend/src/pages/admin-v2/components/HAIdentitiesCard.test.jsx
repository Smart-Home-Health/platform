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
// HAIdentitiesCard: directory mode (all HA users + import/patient actions)
// vs seen-only fallback; import dialog wiring. Services and config mocked;
// Radix dialogs rendered inline (portal/focus-trap noise).
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// Radix (via ToggleList's Checkbox) probes element size; jsdom has no ResizeObserver.
vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });

vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({ open, children }) => (open ? <div>{children}</div> : null),
  DialogContent: ({ children }) => <div>{children}</div>,
  DialogHeader: ({ children }) => <div>{children}</div>,
  DialogTitle: ({ children }) => <h2>{children}</h2>,
  DialogFooter: ({ children }) => <div>{children}</div>,
}));
vi.mock('@/components/ui/select', () => ({
  Select: ({ children }) => <div>{children}</div>,
  SelectTrigger: ({ children }) => <div>{children}</div>,
  SelectValue: () => null,
  SelectContent: ({ children }) => <div>{children}</div>,
  SelectItem: ({ children }) => <div>{children}</div>,
}));

const apiFetch = vi.fn();
vi.mock('../../../config', () => ({
  isIngress: () => true,
  apiFetch: (...a) => apiFetch(...a),
  API_BASE_URL: 'http://api',
}));

const getHaDirectory = vi.fn();
const importHaUser = vi.fn();
const linkHaIdentity = vi.fn();
const unlinkHaIdentity = vi.fn();
const forgetHaIdentity = vi.fn();
vi.mock('../../../services/haIdentity', () => ({
  getHaDirectory: (...a) => getHaDirectory(...a),
  importHaUser: (...a) => importHaUser(...a),
  linkHaIdentity: (...a) => linkHaIdentity(...a),
  unlinkHaIdentity: (...a) => unlinkHaIdentity(...a),
  forgetHaIdentity: (...a) => forgetHaIdentity(...a),
}));

import HAIdentitiesCard from './HAIdentitiesCard';

const HA_A = 'a'.repeat(32);
const HA_B = 'b'.repeat(32);
const HA_C = 'c'.repeat(32);

const DIRECTORY = {
  available: true,
  users: [
    { ha_user_id: HA_A, name: 'John', username: 'john', status: 'linked', in_directory: true, ha_is_owner: true, mapped_user: { id: 1, username: 'john', full_name: 'John' } },
    { ha_user_id: HA_B, name: 'Nurse Nancy', username: null, status: 'never_opened', in_directory: true },
    { ha_user_id: HA_C, name: 'Old Phone', username: null, status: 'seen', in_directory: false, last_seen: '2026-08-01T00:00:00Z' },
  ],
};

const ROLES = [
  { id: 1, name: 'system_admin', display_name: 'System Administrator' },
  { id: 2, name: 'caregiver', display_name: 'Caregiver' },
];
const USERS = [{ id: 1, full_name: 'John', is_active: true }];
const PATIENTS = [{ id: 5, first_name: 'Eli', last_name: 'C' }];

beforeEach(() => {
  vi.clearAllMocks();
  window.__BASE_PATH__ = '/api/hassio_ingress/tok';
});

const renderCard = async (props = {}) => {
  render(
    <HAIdentitiesCard
      users={USERS} roles={ROLES} patients={PATIENTS}
      onUsersChanged={props.onUsersChanged || vi.fn()}
      onPatientsChanged={props.onPatientsChanged || vi.fn()}
    />
  );
  await waitFor(() => expect(getHaDirectory).toHaveBeenCalled());
};

describe('HAIdentitiesCard directory mode', () => {
  it('renders all HA users with status chips and actions', async () => {
    getHaDirectory.mockResolvedValue(DIRECTORY);
    await renderCard();
    expect(await screen.findByText('Nurse Nancy')).toBeInTheDocument();
    expect(screen.getByText('Signs in as John')).toBeInTheDocument();
    expect(screen.getByText('Never opened the app')).toBeInTheDocument();
    expect(screen.getByText('HA owner')).toBeInTheDocument();
    expect(screen.getByText('Not in Home Assistant')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Create profile' }).length).toBe(2);
    expect(screen.getAllByRole('button', { name: 'Add as patient' }).length).toBe(2);
    // Remove only offered for the stale seen row.
    expect(screen.getAllByRole('button', { name: 'Remove' }).length).toBe(1);
  });

  it('hides "Add as patient" once the HA login produced a patient', async () => {
    getHaDirectory.mockResolvedValue({
      available: true,
      users: [{
        ha_user_id: HA_B, name: 'Elijah', status: 'never_opened', in_directory: true,
        patient: { id: 7, first_name: 'Elijah', last_name: 'Carty' },
      }],
    });
    await renderCard();
    expect(await screen.findByText('Patient: Elijah Carty')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add as patient' })).not.toBeInTheDocument();
    // The other actions stay available.
    expect(screen.getByRole('button', { name: 'Create profile' })).toBeInTheDocument();
  });

  it('imports an HA user with chosen roles, then assigns patients and refreshes', async () => {
    getHaDirectory.mockResolvedValue(DIRECTORY);
    importHaUser.mockResolvedValue({ id: 42, username: 'nurse_nancy' });
    apiFetch.mockResolvedValue({ ok: true, json: async () => ({}) });
    const onUsersChanged = vi.fn();
    await renderCard({ onUsersChanged });

    fireEvent.click(screen.getAllByRole('button', { name: 'Create profile' })[0]);
    // Prefilled from the HA name.
    expect(screen.getByDisplayValue('Nurse Nancy')).toBeInTheDocument();
    expect(screen.getByDisplayValue('nurse_nancy')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Caregiver'));
    fireEvent.click(screen.getByText('Eli C'));
    // Dialog renders after the rows, so the last "Create profile" is the submit.
    fireEvent.click(screen.getAllByRole('button', { name: 'Create profile' }).at(-1));

    await waitFor(() => expect(importHaUser).toHaveBeenCalledWith({
      ha_user_id: HA_B, username: 'nurse_nancy', full_name: 'Nurse Nancy', role_ids: [2],
    }));
    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith(
      'http://api/api/users/42/patients',
      expect.objectContaining({ method: 'PUT' }),
    ));
    await waitFor(() => expect(onUsersChanged).toHaveBeenCalled());
  });

  it('adds an HA user as a patient with the name pre-split', async () => {
    getHaDirectory.mockResolvedValue(DIRECTORY);
    apiFetch.mockResolvedValue({ ok: true, json: async () => ({}) });
    const onPatientsChanged = vi.fn();
    await renderCard({ onPatientsChanged });

    fireEvent.click(screen.getAllByRole('button', { name: 'Add as patient' })[0]);
    expect(screen.getByDisplayValue('Nurse')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Nancy')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Add patient' }));

    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith(
      'http://api/api/patients',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ first_name: 'Nurse', last_name: 'Nancy', ha_user_id: HA_B }),
      }),
    ));
    await waitFor(() => expect(onPatientsChanged).toHaveBeenCalled());
  });
});

describe('HAIdentitiesCard fallback mode', () => {
  it('shows the seen-only hint when the directory is unavailable', async () => {
    getHaDirectory.mockResolvedValue({
      available: false,
      users: [{ ha_user_id: HA_A, name: 'John', status: 'seen', in_directory: true, last_seen: '2026-08-01T00:00:00Z' }],
    });
    await renderCard();
    expect(await screen.findByText(/Showing only Home Assistant users who have opened the app/)).toBeInTheDocument();
    // Stale flag never shows in fallback mode.
    expect(screen.queryByText('Not in Home Assistant')).not.toBeInTheDocument();
  });

  it('hides itself when the backend says not permitted', async () => {
    const err = new Error('forbidden');
    err.status = 403;
    getHaDirectory.mockRejectedValue(err);
    const { container } = render(
      <HAIdentitiesCard users={USERS} roles={ROLES} patients={PATIENTS} />
    );
    await waitFor(() => expect(getHaDirectory).toHaveBeenCalled());
    expect(container.querySelector('.font-medium')).toBeNull();
  });
});
