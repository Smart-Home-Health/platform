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
// The vc form skin (vc-forms.css) is gated on `vc-form-skin` being on <body>.
// It used to be an allowlist of three route prefixes, which silently left the
// rest of the admin on stock shadcn geometry. These tests pin the current
// contract: the class is bound to this layout's lifetime, not to the path.
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

describe('AdminV2Layout vc form skin', () => {
  beforeEach(() => {
    document.body.className = '';
  });

  // The three that were on the old allowlist, and five that were not. Every
  // /care page mounts this layout, so all of them must get the skin.
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
  ])('puts vc-form-skin on <body> at %s', (path) => {
    renderAt(path);
    expect(document.body.classList.contains('vc-form-skin')).toBe(true);
  });

  it('removes the class when the admin unmounts, so /live is unaffected', () => {
    const { unmount } = renderAt('/care');
    expect(document.body.classList.contains('vc-form-skin')).toBe(true);
    unmount();
    expect(document.body.classList.contains('vc-form-skin')).toBe(false);
  });

  it('keeps the class across a route change within the admin', () => {
    renderAt('/care/patients');
    expect(document.body.classList.contains('vc-form-skin')).toBe(true);
    cleanup();

    renderAt('/care/monitoring/ventilator');
    expect(document.body.classList.contains('vc-form-skin')).toBe(true);
  });
});
