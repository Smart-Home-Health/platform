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
// The /care/schedule modals after moving off shadcn Dialog/Field/Input onto
// EntityModal + the shared em-* field vocabulary. The page body (vc-schedule
// skin) is unchanged and not covered here.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act, fireEvent, within } from '@testing-library/react';

vi.mock('./AdminV2Layout', () => ({ default: ({ children }) => <div>{children}</div> }));

const { authCtx, patientCtx } = vi.hoisted(() => ({
  authCtx: { user: { id: 1, is_system_admin: true, permissions: [] } },
  patientCtx: {
    selectedPatient: { id: 5, first_name: 'Eli', last_name: 'Carty' },
    patients: [], selectPatient: () => {},
  },
}));
vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => authCtx }));
vi.mock('../../contexts/AdminPatientContext', () => ({ useAdminPatient: () => patientCtx }));
vi.mock('react-router-dom', () => ({ useSearchParams: () => [new URLSearchParams(), () => {}] }));
vi.mock('../../config', () => ({ default: { apiUrl: '' } }));

import AdminV2Schedule from './AdminV2Schedule';
import { UpdateQuantityModal, CareTaskCompleteModal } from './components';

// The page filters /api/admin/medications/active down to as_needed.
const PRN_MEDS = [
  { id: 11, name: 'Acetaminophen', concentration: '160mg/5mL', last_administered: null, as_needed: true },
  { id: 12, name: 'Albuterol', concentration: null, last_administered: '2026-08-30T09:00:00Z', as_needed: true },
  { id: 13, name: 'Scheduled Only', as_needed: false },
];
let routes;
const stubFetch = () => {
  vi.stubGlobal('fetch', vi.fn(async (url) => {
    for (const [frag, body] of routes) {
      if (url.includes(frag)) return { ok: true, status: 200, json: async () => body };
    }
    return { ok: true, status: 200, json: async () => [] };
  }));
};

beforeEach(() => {
  // jsdom has no scrollIntoView; the page scrolls to the current hour on mount.
  Element.prototype.scrollIntoView = vi.fn();
  routes = [];
  stubFetch();
});

const renderPage = async () => { await act(async () => { render(<AdminV2Schedule />); }); };
const openPrn = async (name) => {
  await act(async () => { fireEvent.click(screen.getAllByRole('button', { name })[0]); });
};

describe('AdminV2Schedule modals', () => {
  it('leaves no shadcn dialog or field on the page', async () => {
    await renderPage();
    expect(document.querySelector('[data-slot="dialog-content"]')).not.toBeInTheDocument();
  });

  it('renders the PRN medication picker as vc pick rows', async () => {
    routes = [['/admin/medications/active', PRN_MEDS]];
    stubFetch();
    await renderPage();
    await openPrn(/PRN/i);

    const rows = document.querySelectorAll('.cfg-picklist .cfg-pick');
    // Only the two as_needed medications are offered.
    expect(rows.length).toBe(2);
    expect(rows[0].querySelector('.cfg-pick-name')).toHaveTextContent('Acetaminophen');
    expect(rows[0].querySelector('.cfg-pick-meta')).toHaveTextContent('Give');
    // vc modal chrome, not Radix dialog primitives.
    expect(document.querySelector('.em-panel')).toBeInTheDocument();
  });

  it('uses the shared em-input for the modal fields', async () => {
    routes = [['/admin/medications/active', PRN_MEDS]];
    stubFetch();
    await renderPage();
    await openPrn(/PRN/i);
    // EntityModal also renders its own X (aria-label Close), so scope to the
    // footer: the action button is the vc cancel, not a shadcn Button.
    const footer = document.querySelector('.em-footer');
    expect(within(footer).getByRole('button', { name: 'Close' })).toHaveClass('em-cancel');
  });

  it('opens the PRN dose modal on EntityModal with em fields', async () => {
    routes = [['/admin/medications/active', PRN_MEDS]];
    stubFetch();
    await renderPage();
    await openPrn(/PRN/i);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Acetaminophen/ }));
    });

    expect(screen.getByText('Record Dose — Acetaminophen')).toBeInTheDocument();
    // The shared MedicationDoseModal is off shadcn Dialog entirely.
    expect(document.querySelector('[data-slot="dialog-content"]')).not.toBeInTheDocument();
    expect(screen.getByLabelText(/Dose Amount/)).toHaveClass('em-input');
    const footer = document.querySelector('.em-footer');
    expect(within(footer).getByRole('button', { name: 'Record Administration' }))
      .toHaveClass('em-submit');
  });

  it('logs a PRN care task through the vc complete modal', () => {
    render(
      <CareTaskCompleteModal
        open onClose={() => {}} onSaved={() => {}} patient={{ id: 5 }}
        task={{ id: 3, name: 'Reposition', description: 'Turn to left side',
                category_name: 'Comfort', category_color: '#7fb39a' }}
      />
    );
    expect(screen.getByText('Log Care Task — Reposition')).toBeInTheDocument();
    expect(document.querySelector('[data-slot="dialog-content"]')).not.toBeInTheDocument();
    expect(screen.getByLabelText(/Completed At/)).toHaveClass('em-input');
    // Category colour rides on a dot inside the modal, not a coloured pill.
    expect(document.querySelector('.em-panel .sch-dot')).toBeTruthy();
  });

  it('renders the out-of-stock gate as a vc modal with an amber warning', () => {
    render(
      <UpdateQuantityModal
        info={{ medication_id: 1, medication_name: 'Acetaminophen',
                current_quantity: 2, quantity_unit: 'mL', requested_dose: 5 }}
        onClose={() => {}} onUpdated={() => {}}
      />
    );
    expect(screen.getByText('Out of Stock — Acetaminophen')).toBeInTheDocument();
    expect(document.querySelector('[data-slot="dialog-content"]')).not.toBeInTheDocument();
    expect(document.querySelector('.em-panel .sch-warn')).toBeTruthy();
    expect(screen.getByLabelText(/New on-hand quantity/)).toHaveClass('em-input');
  });

  it('puts the care-task category colour on a dot, not a left stripe', async () => {
    routes = [['/admin/medications/active', PRN_MEDS]];
    stubFetch();
    await renderPage();
    await openPrn(/PRN/i);
    // No pick row anywhere may carry a left-edge accent stripe.
    const rows = [...document.querySelectorAll('.cfg-pick')];
    expect(rows.length).toBeGreaterThan(0);
    rows.forEach(el => expect(el.getAttribute('style') || '').not.toMatch(/border-left/i));
  });
});
