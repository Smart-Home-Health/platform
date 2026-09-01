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
// AdminV2Backup on the vc cfg-* chassis.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';

vi.mock('./AdminV2Layout', () => ({ default: ({ children }) => <div>{children}</div> }));

const { authCtx } = vi.hoisted(() => ({ authCtx: { user: { is_system_admin: true } } }));
vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => authCtx }));

vi.mock('../../contexts/AdminPatientContext', () => ({
  useAdminPatient: () => ({
    patients: [
      { id: 5, first_name: 'Eli', last_name: 'Carty', medical_record_number: 'MRN-42', is_active: true },
      { id: 9, first_name: 'Old', last_name: 'Record', is_active: false },
    ],
    loadingPatients: false,
  }),
}));

const { apiFetch } = vi.hoisted(() => ({ apiFetch: vi.fn() }));
vi.mock('../../config', () => ({ default: { apiUrl: '' }, apiFetch }));

import AdminV2Backup from './AdminV2Backup';

beforeEach(() => {
  authCtx.user = { is_system_admin: true };
  apiFetch.mockReset();
});

const renderPage = async () => { await act(async () => { render(<AdminV2Backup />); }); };

describe('AdminV2Backup', () => {
  it('renders vc sections rather than shadcn cards', async () => {
    await renderPage();
    expect([...document.querySelectorAll('.cfg-title')].map(t => t.textContent))
      .toEqual(['Export Patient', 'Restore Patient']);
    expect(document.querySelector('.tw')).not.toBeInTheDocument();
  });

  it('offers only active patients for export', async () => {
    await renderPage();
    const opts = [...document.querySelectorAll('#export-patient option')].map(o => o.textContent);
    expect(opts).toEqual(['-- Select patient --', 'Eli Carty (MRN MRN-42)']);
  });

  it('blocks export until a patient is chosen, then calls the export endpoint', async () => {
    await renderPage();
    const btn = screen.getByRole('button', { name: /Download Backup/i });
    expect(btn).toBeDisabled();

    await act(async () => {
      fireEvent.change(document.querySelector('#export-patient'), { target: { value: '5' } });
    });
    apiFetch.mockResolvedValue({
      ok: true, status: 200,
      headers: { get: () => 'attachment; filename="shh-backup-5.tar.gz"' },
      blob: async () => new Blob(['x']),
    });
    // jsdom has no object-URL plumbing, and clicking the download anchor would
    // try to navigate ("Not implemented" noise), so both are stubbed.
    vi.stubGlobal('URL', { ...URL, createObjectURL: () => 'blob:x', revokeObjectURL: () => {} });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Download Backup/i })); });
    expect(apiFetch).toHaveBeenCalledWith('/api/backup/export/5');
    expect(click).toHaveBeenCalled();
    expect(document.querySelector('.em-success')).toHaveTextContent('shh-backup-5.tar.gz');
    click.mockRestore();
  });

  it('surfaces an export failure in the shared em-error box', async () => {
    await renderPage();
    await act(async () => {
      fireEvent.change(document.querySelector('#export-patient'), { target: { value: '5' } });
    });
    apiFetch.mockResolvedValue({
      ok: false, status: 500, text: async () => JSON.stringify({ detail: 'no such patient' }),
    });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Download Backup/i })); });
    expect(document.querySelector('.em-error')).toHaveTextContent('no such patient');
  });

  it('restores a chosen file and lists the per-table counts', async () => {
    await renderPage();
    apiFetch.mockResolvedValue({
      ok: true, status: 200,
      json: async () => ({ new_patient_id: 12, inserted: { vitals: 8421, medications: 34 } }),
    });
    const file = new File(['x'], 'backup.tar.gz', { type: 'application/gzip' });
    await act(async () => {
      fireEvent.change(document.querySelector('#restore-file-input'), { target: { files: [file] } });
    });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Restore From Backup/i })); });

    const box = document.querySelector('.em-success');
    expect(box).toHaveTextContent('Restored patient as new id 12');
    // 8421 + 34 across 2 tables
    expect(box).toHaveTextContent('Inserted 8455 rows across 2 tables');
    expect([...box.querySelectorAll('.cfg-kv li')].map(li => li.textContent))
      .toEqual(['vitals8421', 'medications34']);
  });

  it('shows the access-denied section to a non-admin', async () => {
    authCtx.user = { is_system_admin: false };
    await renderPage();
    expect(document.querySelector('.cfg-title')).toHaveTextContent('Access Denied');
    expect(screen.queryByRole('button', { name: /Download Backup/i })).not.toBeInTheDocument();
  });
});
