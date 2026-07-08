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
// FirstRunSetup success screen: the optional "Secure this install" step is
// offered when HTTPS is unconfigured, hidden under ingress, and skippable.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';

const navigate = vi.fn();
vi.mock('react-router-dom', () => ({ useNavigate: () => navigate }));
vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({
    completeFirstRunSetup: vi.fn(async () => ({ success: true, data: { account_slug: 'test-family' } })),
  }),
}));

import FirstRunSetup from './FirstRunSetup';

const baseStatus = {
  mode: 'off', ingress: false, behind_proxy: false, request_scheme: 'http',
  https_active: false, domain: null, public_port: 8443, cert_installed: false,
  setup_state: null,
};

const stubSecurityStatus = (status) => {
  vi.stubGlobal('fetch', vi.fn(async (url) => {
    if (String(url).includes('/api/security/status')) {
      return { ok: true, status: 200, json: async () => status };
    }
    throw new Error(`Unmocked fetch: ${url}`);
  }));
};

const setField = (name, value) => {
  fireEvent.change(document.querySelector(`[name="${name}"]`), { target: { value } });
};

const completeForm = async () => {
  setField('full_name', 'Admin Person');
  setField('username', 'admin');
  setField('password', 'longpassword');
  setField('confirmPassword', 'longpassword');
  setField('account_password', 'accountpass1');
  setField('confirmAccountPassword', 'accountpass1');
  await act(async () => {
    fireEvent.submit(document.querySelector('form'));
  });
};

beforeEach(() => {
  vi.unstubAllGlobals();
  navigate.mockReset();
});

describe('FirstRunSetup secure-install step', () => {
  it('offers "Secure this install" after setup when HTTPS is unconfigured', async () => {
    stubSecurityStatus(baseStatus);
    render(<FirstRunSetup />);
    await completeForm();
    await waitFor(() => expect(screen.getByText('Setup Complete!')).toBeInTheDocument());
    await waitFor(() =>
      expect(screen.getByText('Secure this install (recommended)')).toBeInTheDocument());
    expect(screen.getByText('Continue to Dashboard')).toBeInTheDocument();
  });

  it('hides the offer under Home Assistant ingress', async () => {
    stubSecurityStatus({ ...baseStatus, ingress: true });
    render(<FirstRunSetup />);
    await completeForm();
    await waitFor(() => expect(screen.getByText('Setup Complete!')).toBeInTheDocument());
    expect(screen.queryByText('Secure this install (recommended)')).not.toBeInTheDocument();
  });

  it('enters the wizard and can skip to the dashboard', async () => {
    stubSecurityStatus(baseStatus);
    render(<FirstRunSetup />);
    await completeForm();
    await waitFor(() =>
      expect(screen.getByText('Secure this install (recommended)')).toBeInTheDocument());
    await act(async () => {
      fireEvent.click(screen.getByText('Secure this install (recommended)'));
    });
    // The shared wizard renders (it loads status itself → path chooser).
    await waitFor(() => expect(screen.getByTestId('security-wizard')).toBeInTheDocument());
    fireEvent.click(screen.getByText(/Skip for now/));
    expect(navigate).toHaveBeenCalledWith('/care', { replace: true });
  });
});
