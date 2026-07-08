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
// SecuritySetupWizard: path selection, the DuckDNS submit → progress → success
// timeline (polled), failure copy by error_code, proxy checklist, BYO
// validation, and the HA-ingress variant.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import SecuritySetupWizard, { canonicalHttpsUrl } from './SecuritySetupWizard';

const baseStatus = {
  mode: 'off', ingress: false, behind_proxy: false, request_scheme: 'http',
  https_active: false, https_error: null, domain: null, public_port: 8443,
  cert_installed: false, cert_expires_at: null, days_until_expiry: null,
  last_renewal_at: null, last_renewal_error: null, setup_state: null,
};

const ok = (body) => ({ ok: true, status: 200, json: async () => body });

// Route fetch calls by URL suffix; handlers may be functions (url, opts) => resp.
const mockApi = (routes) => {
  const calls = [];
  vi.stubGlobal('fetch', vi.fn(async (url, opts = {}) => {
    calls.push({ url: String(url), method: opts.method || 'GET', opts });
    const hit = Object.entries(routes).find(([suffix]) => {
      const [method, path] = suffix.split(' ');
      return (opts.method || 'GET') === method && String(url).includes(path);
    });
    if (!hit) throw new Error(`Unmocked fetch: ${opts.method || 'GET'} ${url}`);
    const resp = hit[1];
    return typeof resp === 'function' ? resp(String(url), opts) : ok(resp);
  }));
  return calls;
};

beforeEach(() => {
  vi.unstubAllGlobals();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('canonicalHttpsUrl', () => {
  it('includes non-443 ports and drops 443', () => {
    expect(canonicalHttpsUrl('x.duckdns.org', 8443)).toBe('https://x.duckdns.org:8443');
    expect(canonicalHttpsUrl('x.duckdns.org', 443)).toBe('https://x.duckdns.org');
    expect(canonicalHttpsUrl(null, 8443)).toBeNull();
  });
});

describe('SecuritySetupWizard', () => {
  it('shows the three setup paths', async () => {
    mockApi({ 'GET /api/security/status': baseStatus });
    await act(async () => { render(<SecuritySetupWizard />); });
    expect(screen.getByText(/Free secure address with DuckDNS/)).toBeInTheDocument();
    expect(screen.getByText(/I already use a reverse proxy/)).toBeInTheDocument();
    expect(screen.getByText(/Upload my own certificate/)).toBeInTheDocument();
    expect(screen.getByText('Recommended')).toBeInTheDocument();
  });

  it('shows the Home Assistant notice under ingress and no paths', async () => {
    mockApi({ 'GET /api/security/status': { ...baseStatus, ingress: true } });
    await act(async () => { render(<SecuritySetupWizard />); });
    expect(screen.getByText(/inside Home Assistant/)).toBeInTheDocument();
    expect(screen.queryByText(/DuckDNS/)).not.toBeInTheDocument();
  });

  it('walks the DuckDNS path: submit → progress → success with the secure URL', async () => {
    let statusResp = baseStatus;
    let jobState = null;
    const calls = mockApi({
      'GET /api/security/status': () => ok(statusResp),
      'POST /api/security/duckdns/setup': (url, opts) => {
        const body = JSON.parse(opts.body);
        expect(body).toMatchObject({ subdomain: 'myhome', token: 'tok-1', staging: false });
        jobState = { status: 'waiting_dns' };
        return ok({ ...baseStatus, setup_state: jobState });
      },
      'GET /api/security/duckdns/setup': () => ok({ setup_state: jobState }),
    });

    await act(async () => { render(<SecuritySetupWizard />); });
    fireEvent.click(screen.getByText(/Free secure address with DuckDNS/));
    fireEvent.change(document.getElementById('duckdns-subdomain'), { target: { value: 'myhome' } });
    fireEvent.change(document.getElementById('duckdns-token'), { target: { value: 'tok-1' } });
    await act(async () => { fireEvent.click(screen.getByText('Get my certificate')); });

    // Progress view polls immediately; the job reports waiting_dns.
    await waitFor(() => expect(screen.getByTestId('duckdns-progress')).toBeInTheDocument());
    expect(screen.getByText(/Waiting for DNS to update/)).toBeInTheDocument();

    // Next poll: issued → refreshed status carries the domain.
    jobState = { status: 'issued' };
    statusResp = {
      ...baseStatus, mode: 'duckdns', https_active: true,
      domain: 'myhome.duckdns.org', cert_installed: true,
    };
    await act(async () => { await new Promise((r) => setTimeout(r, 2100)); });
    await waitFor(() =>
      expect(screen.getByText('https://myhome.duckdns.org:8443')).toBeInTheDocument());
    expect(screen.getByText(/DNS rebind protection/)).toBeInTheDocument();
    expect(calls.some((c) => c.method === 'POST' && c.url.includes('/duckdns/setup'))).toBe(true);
  }, 15000);

  it('maps a failed job back to the form with error_code copy', async () => {
    const jobState = { status: 'failed', error: 'DuckDNS rejected the domain/token', error_code: 'bad_token' };
    mockApi({
      'GET /api/security/status': baseStatus,
      'POST /api/security/duckdns/setup': { ...baseStatus, setup_state: { status: 'queued' } },
      'GET /api/security/duckdns/setup': { setup_state: jobState },
    });
    await act(async () => { render(<SecuritySetupWizard />); });
    fireEvent.click(screen.getByText(/Free secure address with DuckDNS/));
    fireEvent.change(document.getElementById('duckdns-subdomain'), { target: { value: 'myhome' } });
    fireEvent.change(document.getElementById('duckdns-token'), { target: { value: 'bad' } });
    await act(async () => { fireEvent.click(screen.getByText('Get my certificate')); });

    await waitFor(() => expect(screen.getByTestId('wizard-error')).toBeInTheDocument());
    expect(screen.getByText(/Double-check the subdomain and token/)).toBeInTheDocument();
    expect(screen.getByText(/DuckDNS rejected the domain\/token/)).toBeInTheDocument();
    // Back on the form for a retry.
    expect(document.getElementById('duckdns-subdomain')).toBeInTheDocument();
  });

  it('proxy path: enabling shows the checklist with the env warning', async () => {
    mockApi({
      'GET /api/security/status': baseStatus,
      'POST /api/security/proxy': { ...baseStatus, mode: 'proxy', behind_proxy: false },
    });
    await act(async () => { render(<SecuritySetupWizard />); });
    fireEvent.click(screen.getByText(/I already use a reverse proxy/));
    expect(screen.getByText(/SHH_BEHIND_PROXY/)).toBeInTheDocument();
    await act(async () => { fireEvent.click(screen.getByText(/I've configured my proxy/)); });
    await waitFor(() => expect(screen.getByTestId('proxy-checklist')).toBeInTheDocument());
    expect(screen.getByText(/NOT set on the container yet/)).toBeInTheDocument();
  });

  it('byo path: requires both files before uploading', async () => {
    mockApi({ 'GET /api/security/status': baseStatus });
    await act(async () => { render(<SecuritySetupWizard />); });
    fireEvent.click(screen.getByText(/Upload my own certificate/));
    await act(async () => { fireEvent.click(screen.getByText('Install certificate')); });
    expect(screen.getByText(/Choose both the certificate chain and the private key/)).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledTimes(1); // only the initial status load
  });

  it('resumes a running job straight into the progress view', async () => {
    mockApi({
      'GET /api/security/status': { ...baseStatus, setup_state: { status: 'requesting_cert' } },
      'GET /api/security/duckdns/setup': { setup_state: { status: 'requesting_cert' } },
    });
    await act(async () => { render(<SecuritySetupWizard />); });
    await waitFor(() => expect(screen.getByTestId('duckdns-progress')).toBeInTheDocument());
  });
});
