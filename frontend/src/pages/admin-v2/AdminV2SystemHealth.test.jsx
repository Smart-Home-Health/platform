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
// AdminV2SystemHealth on the vc cfg-* chassis.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';

vi.mock('./AdminV2Layout', () => ({ default: ({ children }) => <div>{children}</div> }));

const { authCtx } = vi.hoisted(() => ({ authCtx: { user: { is_system_admin: true } } }));
vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => authCtx }));

const { apiFetch } = vi.hoisted(() => ({ apiFetch: vi.fn() }));
vi.mock('../../config', () => ({ default: { apiUrl: '' }, apiFetch }));

import AdminV2SystemHealth from './AdminV2SystemHealth';

const HEALTH = {
  database: {
    name: 'shh', postgres_version: '16.3', timescaledb_version: '2.15.2', status: 'healthy',
    total_size_bytes: 4831838208, uptime_seconds: 923400,
    connections: { active: 7, max: 100 }, cache_hit_ratio: 0.9962,
  },
  tables: [
    { name: 'pulse_ox_data', rows: 18234991, size_bytes: 3221225472, hypertable: true, compressed: true, chunks: 142, oldest: '2025-11-02', newest: '2026-08-30' },
    { name: 'vitals', rows: 48211, size_bytes: 121634816, hypertable: true, compressed: false, chunks: 31, oldest: '2025-12-14', newest: '2026-08-30' },
    { name: 'medications', rows: 412, size_bytes: 262144, hypertable: false, compressed: false },
  ],
};
const ok = (body) => ({ ok: true, status: 200, json: async () => body });

// runMaintenance reloads health afterwards, so the mock has to route by URL —
// a blanket mockResolvedValue would feed the action's body back to loadHealth.
const routeApi = ({ maintenance } = {}) => {
  apiFetch.mockImplementation(async (url) => {
    if (url.includes('/maintenance/')) {
      return maintenance ?? ok({ target: 'all' });
    }
    return ok(HEALTH);
  });
};

beforeEach(() => {
  authCtx.user = { is_system_admin: true };
  apiFetch.mockReset();
  routeApi();
});

const renderPage = async () => { await act(async () => { render(<AdminV2SystemHealth />); }); };

describe('AdminV2SystemHealth', () => {
  it('renders vc sections rather than shadcn cards', async () => {
    await renderPage();
    expect([...document.querySelectorAll('.cfg-title')].map(t => t.textContent))
      .toEqual(['Database', 'Storage by Table', 'Maintenance', 'About this page']);
    expect(document.querySelector('.tw')).not.toBeInTheDocument();
  });

  it('shows the database metrics as stat tiles', async () => {
    await renderPage();
    const tiles = [...document.querySelectorAll('.cfg-stat')].map(t => t.textContent);
    expect(tiles[0]).toMatch(/Total Size4\.5 GB/);
    expect(tiles[2]).toMatch(/Connections7\/100/);
    expect(tiles[2]).toMatch(/7% of pool/);
  });

  it('carries database health on a dot badge, not a ● glyph', async () => {
    await renderPage();
    const badge = document.querySelector('.cfg-head .cfg-badge');
    expect(badge).toHaveTextContent('Healthy');
    expect(badge).toHaveClass('ok');
    expect(badge.textContent).not.toMatch(/[●○]/);
  });

  // One row markup re-flows to columns at >=900px, so every row must always
  // emit all six cells — omitting one would shift the grid for that row.
  it('renders storage as one row markup with a full cell set per table', async () => {
    await renderPage();
    expect(document.querySelector('table')).not.toBeInTheDocument();
    const rows = document.querySelectorAll('.cfg-table .cfg-trow');
    expect(rows).toHaveLength(3);
    rows.forEach(r => expect(r.querySelectorAll('.cfg-tcell')).toHaveLength(6));
    // A plain table has no chunk/range data but still fills those cells.
    const plain = rows[2];
    expect(plain.querySelector('.cfg-tcell.name')).toHaveTextContent('medications');
    expect([...plain.querySelectorAll('.cfg-tval')].map(v => v.textContent))
      .toEqual(['412', '256 KB', '—', '—']);
  });

  it('tags hypertables by compression state', async () => {
    await renderPage();
    const rows = document.querySelectorAll('.cfg-table .cfg-trow');
    expect(rows[0]).toHaveTextContent('compressed');
    expect(rows[1]).toHaveTextContent('uncompressed');
    expect(rows[2].querySelector('.cfg-tags')).toHaveTextContent('table');
  });

  it('offers maintenance only for hypertables', async () => {
    await renderPage();
    expect(document.querySelectorAll('.cfg-maint')).toHaveLength(2);
    expect(document.querySelector('#older-pulse_ox_data').value).toBe('90');
    // Already-compressed tables cannot be compressed again.
    const compress = screen.getAllByRole('button', { name: /^Compress$/ });
    expect(compress[0]).toBeDisabled();
    expect(compress[1]).toBeEnabled();
  });

  it('compresses through the maintenance endpoint', async () => {
    await renderPage();
    routeApi({ maintenance: ok({ table: 'vitals', chunks_compressed: 4 }) });
    await act(async () => {
      fireEvent.click(screen.getAllByRole('button', { name: /^Compress$/ })[1]);
    });
    const [url, opts] = apiFetch.mock.calls.find(([u]) => u.endsWith('/maintenance/compress'));
    expect(url).toBeTruthy();
    expect(JSON.parse(opts.body)).toEqual({ table: 'vitals', older_than_days: 90 });
    expect(document.querySelector('.em-success')).toHaveTextContent('Compressed 4 chunk(s)');
  });

  it('asks before pruning and only then calls the endpoint', async () => {
    await renderPage();
    await act(async () => {
      fireEvent.click(screen.getAllByRole('button', { name: /Prune…/ })[0]);
    });
    expect(screen.getByText(/permanently drops every data chunk/i)).toBeInTheDocument();
    expect(apiFetch.mock.calls.some(([u]) => u.endsWith('/maintenance/prune'))).toBe(false);

    routeApi({ maintenance: ok({ table: 'pulse_ox_data', chunks_dropped: 12 }) });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Prune permanently/i }));
    });
    const [, opts] = apiFetch.mock.calls.find(([u]) => u.endsWith('/maintenance/prune'));
    expect(JSON.parse(opts.body)).toEqual({ table: 'pulse_ox_data', older_than_days: 90 });
  });

  it('surfaces a maintenance failure in the shared em-error box', async () => {
    await renderPage();
    routeApi({ maintenance: { ok: false, status: 500, json: async () => ({ detail: 'locked' }) } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Run VACUUM ANALYZE/i }));
    });
    expect(document.querySelector('.em-error')).toHaveTextContent('VACUUM ANALYZE failed: locked');
  });

  it('shows the access-denied section to a non-admin', async () => {
    authCtx.user = { is_system_admin: false };
    await renderPage();
    expect(document.querySelector('.cfg-title')).toHaveTextContent('Access Denied');
  });
});
