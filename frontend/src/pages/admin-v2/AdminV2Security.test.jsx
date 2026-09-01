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
// AdminV2Security: status states (off / duckdns / proxy / ingress), the
// system-admin gate, and surfacing renewal errors.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';

vi.mock('./AdminV2Layout', () => ({ default: ({ children }) => <div>{children}</div> }));

const mockUser = { is_system_admin: true };
vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => ({ user: mockUser }) }));

import AdminV2Security from './AdminV2Security';

const baseStatus = {
  mode: 'off', ingress: false, behind_proxy: false, request_scheme: 'http',
  https_active: false, https_error: null, domain: null, public_port: 8443,
  cert_installed: false, cert_expires_at: null, days_until_expiry: null,
  last_renewal_at: null, last_renewal_error: null, setup_state: null,
};

const stubStatus = (status) => {
  vi.stubGlobal('fetch', vi.fn(async () => ({
    ok: true, status: 200, json: async () => status,
  })));
};

beforeEach(() => {
  vi.unstubAllGlobals();
  mockUser.is_system_admin = true;
});

describe('AdminV2Security', () => {
  it('mode off: shows Set up HTTPS and no secure address', async () => {
    stubStatus(baseStatus);
    await act(async () => { render(<AdminV2Security />); });
    expect(screen.getByText('Set up HTTPS')).toBeInTheDocument();
    expect(screen.getByText('Not configured')).toBeInTheDocument();
    expect(screen.queryByText(/Secure address/)).not.toBeInTheDocument();
  });

  it('duckdns mode: shows the URL, expiry, renew and disable actions', async () => {
    stubStatus({
      ...baseStatus, mode: 'duckdns', https_active: true, cert_installed: true,
      domain: 'myhome.duckdns.org', days_until_expiry: 58,
    });
    await act(async () => { render(<AdminV2Security />); });
    expect(screen.getByText('https://myhome.duckdns.org:8443')).toBeInTheDocument();
    expect(screen.getByText('in 58 days')).toBeInTheDocument();
    expect(screen.getByText('Renew now')).toBeInTheDocument();
    expect(screen.getByText('Disable')).toBeInTheDocument();
  });

  it('surfaces a failed renewal', async () => {
    stubStatus({
      ...baseStatus, mode: 'duckdns', cert_installed: true,
      domain: 'x.duckdns.org', last_renewal_error: 'rate limited',
    });
    await act(async () => { render(<AdminV2Security />); });
    expect(screen.getByText(/Last renewal failed: rate limited/)).toBeInTheDocument();
  });

  it('proxy mode: shows header-trust state', async () => {
    stubStatus({ ...baseStatus, mode: 'proxy', behind_proxy: false });
    await act(async () => { render(<AdminV2Security />); });
    expect(screen.getByText('Missing')).toBeInTheDocument();
    expect(screen.getByText(/SHH_BEHIND_PROXY=1/)).toBeInTheDocument();
  });

  it('ingress: shows the Home Assistant notice instead of actions', async () => {
    stubStatus({ ...baseStatus, ingress: true });
    await act(async () => { render(<AdminV2Security />); });
    expect(screen.getByText(/Home Assistant ingress/)).toBeInTheDocument();
    expect(screen.queryByText('Set up HTTPS')).not.toBeInTheDocument();
  });

  it('denies non-system-admins', async () => {
    mockUser.is_system_admin = false;
    stubStatus(baseStatus);
    await act(async () => { render(<AdminV2Security />); });
    expect(screen.getByText('Access Denied')).toBeInTheDocument();
  });

  // --- vc chassis (migrated off shadcn Card/Badge/Alert) ---

  it('renders a vc section with no shadcn island left on the page', async () => {
    stubStatus(baseStatus);
    await act(async () => { render(<AdminV2Security />); });
    expect(document.querySelector('.cfg-title')).toHaveTextContent('HTTPS / Secure access');
    // The wizard owns its own `.tw`; the page itself must not have one.
    expect(document.querySelector('.cfg-card .tw')).not.toBeInTheDocument();
  });

  it('renders the cert facts as cfg-stat tiles', async () => {
    stubStatus({
      ...baseStatus, mode: 'duckdns', https_active: true, cert_installed: true,
      domain: 'myhome.duckdns.org', days_until_expiry: 58,
    });
    await act(async () => { render(<AdminV2Security />); });
    const tiles = [...document.querySelectorAll('.cfg-stat')].map(t => t.textContent);
    expect(tiles).toHaveLength(3);
    expect(tiles[0]).toMatch(/DuckDNS \+ Let’s Encrypt/);
  });

  it('carries HTTPS state on a dot badge rather than a ●/○ glyph', async () => {
    stubStatus({ ...baseStatus, mode: 'duckdns', https_active: true, domain: 'x.duckdns.org' });
    await act(async () => { render(<AdminV2Security />); });
    const badge = document.querySelector('.cfg-badge');
    expect(badge).toHaveTextContent('HTTPS on');
    expect(badge).toHaveClass('ok');
    expect(badge.querySelector('.cfg-badge-dot')).toBeInTheDocument();
    expect(badge.textContent).not.toMatch(/[●○]/);
  });

  it('uses the neutral badge when HTTPS is off', async () => {
    stubStatus(baseStatus);
    await act(async () => { render(<AdminV2Security />); });
    const badge = document.querySelector('.cfg-badge');
    expect(badge).toHaveTextContent('HTTPS off');
    expect(badge).not.toHaveClass('ok');
  });

  it('shows the ingress notice in the neutral cfg-note box, with no badge', async () => {
    stubStatus({ ...baseStatus, ingress: true });
    await act(async () => { render(<AdminV2Security />); });
    expect(document.querySelector('.cfg-note')).toHaveTextContent(/Home Assistant ingress/);
    expect(document.querySelector('.cfg-badge')).not.toBeInTheDocument();
    expect(document.querySelector('.cfg-stats')).not.toBeInTheDocument();
  });
});
