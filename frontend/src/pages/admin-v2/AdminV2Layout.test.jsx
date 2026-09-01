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
// Every /care page mounts this layout, so a crash here takes the whole admin
// down. These were the `vc-form-skin` body-class tests until that class (and
// vc-forms.css with it) was removed on 2026-08-31; kept as a render smoke test
// across the same route spread, which is the coverage that actually mattered —
// an un-imported component or a bad hook order shows up here first.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

let mockUser = { is_system_admin: true, permissions: [] };
vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => ({ user: mockUser }) }));

vi.mock('../../contexts/AdminPatientContext', () => ({
  useAdminPatient: () => ({
    patients: [], selectedPatient: null,
    selectPatient: vi.fn(), loadingPatients: false,
  }),
}));

vi.mock('../../hooks/useConnectionStatus', () => ({ default: () => ({ status: 'connected' }) }));
vi.mock('../../components/ConnectionChip', () => ({ default: () => null }));

// The sub-nav strip centres the active tab and watches its own width. jsdom
// implements neither API, and neither has anything to do with what's asserted
// here, so stub both rather than skip the layout.
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
};
Element.prototype.scrollBy ??= function scrollBy() {};

import AdminV2Layout from './AdminV2Layout';

const renderAt = (path) => render(
  <MemoryRouter initialEntries={[path]}>
    <AdminV2Layout><div>page body</div></AdminV2Layout>
  </MemoryRouter>,
);

describe('AdminV2Layout', () => {
  beforeEach(() => {
    document.body.className = '';
  });

  it.each([
    '/care',
    '/care/configuration/account',
    '/care/medications',
    '/care/nutrition',
    '/care/profile/implants',
    '/care/patients',
    '/care/monitoring/timeline',
    '/care/care-tasks/schedule',
    '/care/vitals/history',
  ])('renders the shell and its page body at %s', (path) => {
    const { getByText } = renderAt(path);
    expect(getByText('page body')).toBeInTheDocument();
  });

  it('unmounts cleanly and leaves no classes on <body>', () => {
    // The layout used to own a body class; assert it leaves nothing behind now,
    // so /live is never handed a stale admin class.
    const { unmount } = renderAt('/care');
    unmount();
    expect(document.body.className).toBe('');
  });

  it('survives a route change within the admin', () => {
    renderAt('/care/patients');
    cleanup();
    const { getByText } = renderAt('/care/monitoring/ventilator');
    expect(getByText('page body')).toBeInTheDocument();
  });
});
