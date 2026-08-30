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
// AdminV2Implants on the shared vc entity vocabulary (EntityToolbar/Card/Modal).
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';

vi.mock('./AdminV2Layout', () => ({ default: ({ children }) => <div>{children}</div> }));

// Stable identities: the load effects are keyed on these.
const { authCtx, patientCtx } = vi.hoisted(() => ({
  authCtx: { user: { is_system_admin: true, permissions: ['implants.create', 'implants.update', 'implants.delete'] } },
  patientCtx: { selectedPatient: { id: 5, first_name: 'Eli', last_name: 'Carty' } },
}));
vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => authCtx }));
vi.mock('../../contexts/AdminPatientContext', () => ({ useAdminPatient: () => patientCtx }));
vi.mock('../../config', () => ({ API_BASE_URL: '' }));

import AdminV2Implants from './AdminV2Implants';

const IMPLANTS = [
  { id: 1, name: 'Tracheostomy Tube', implant_type: 'airway', status: 'active', active: true,
    is_life_sustaining: true, mri_safe: 'conditional', body_location: 'Neck', body_side: 'n/a',
    manufacturer: 'Shiley', serial_number: 'TRQ-88201', notes_count: 3 },
  { id: 2, name: 'G-Tube', implant_type: 'feeding', status: 'active', active: true,
    is_life_sustaining: false, body_location: 'Abdomen', body_side: 'left', notes_count: 0 },
  { id: 3, name: 'Old Port', implant_type: 'vascular', status: 'removed', active: false,
    is_life_sustaining: false, body_location: 'Chest', notes_count: 0 },
];

let fetchMock;
const stubFetch = () => {
  fetchMock = vi.fn(async (url) => {
    const j = (b) => ({ ok: true, status: 200, json: async () => b });
    if (url.includes('/implants/types')) {
      return j([{ value: 'airway', label: 'Airway' }, { value: 'feeding', label: 'Feeding' },
                { value: 'vascular', label: 'Vascular' }]);
    }
    if (url.includes('/implants/statuses')) {
      return j([{ value: 'active', label: 'Active' }, { value: 'removed', label: 'Removed' }]);
    }
    if (url.includes('/providers')) return j([]);
    if (url.includes('/implants')) return j(IMPLANTS);
    return j([]);
  });
  vi.stubGlobal('fetch', fetchMock);
};

beforeEach(() => {
  authCtx.user = { is_system_admin: true, permissions: ['implants.create', 'implants.update', 'implants.delete'] };
  stubFetch();
});

const renderPage = async () => { await act(async () => { render(<AdminV2Implants />); }); };

describe('AdminV2Implants', () => {
  it('renders entity cards rather than shadcn cards', async () => {
    await renderPage();
    expect(document.querySelector('.tw')).not.toBeInTheDocument();
    // Active tab by default: two of the three are active.
    expect(document.querySelectorAll('.ec-card')).toHaveLength(2);
    expect(document.querySelector('.ec-toolbar')).toBeInTheDocument();
  });

  it('marks a life-sustaining implant without using an emoji', async () => {
    await renderPage();
    const card = [...document.querySelectorAll('.ec-card')]
      .find(c => c.textContent.includes('Tracheostomy Tube'));
    expect(card).toHaveTextContent('Life sustaining');
    expect(card.querySelector('.ec-avatar svg')).toBeInTheDocument();
    // No emoji anywhere on the page.
    expect(document.body.textContent).not.toMatch(/❤|️/);
  });

  it('keeps the note count visible even though quick actions are icon-only', async () => {
    await renderPage();
    const card = [...document.querySelectorAll('.ec-card')]
      .find(c => c.textContent.includes('Tracheostomy Tube'));
    expect(card).toHaveTextContent('Notes');
    expect(card.querySelector('.ec-quick-btn')).toHaveAttribute('title', 'Notes (3)');
  });

  it('switches to the inactive tab', async () => {
    await renderPage();
    await act(async () => { fireEvent.click(screen.getByRole('tab', { name: /Inactive/ })); });
    const cards = [...document.querySelectorAll('.ec-card')];
    expect(cards).toHaveLength(1);
    expect(cards[0]).toHaveTextContent('Old Port');
  });

  it('filters by search text', async () => {
    await renderPage();
    await act(async () => {
      fireEvent.change(screen.getByPlaceholderText('Search implants…'), { target: { value: 'g-tube' } });
    });
    expect(document.querySelectorAll('.ec-card')).toHaveLength(1);
    expect(document.querySelector('.ec-card')).toHaveTextContent('G-Tube');
  });

  it('hides create and row actions without the permissions', async () => {
    authCtx.user = { is_system_admin: true, permissions: [] };
    await renderPage();
    expect(screen.queryByRole('button', { name: /Add Implant/i })).not.toBeInTheDocument();
    expect(document.querySelector('.ec-menu-wrap')).not.toBeInTheDocument();
  });

  it('opens the add dialog as a vc EntityModal', async () => {
    await renderPage();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Add Implant/i })); });
    expect(screen.getByText('Add Implant', { selector: '.em-title' })).toBeInTheDocument();
    expect(document.querySelector('#imp-name')).toHaveClass('em-input');
    expect(document.querySelector('#imp-type')).toHaveClass('em-input');
  });
});
