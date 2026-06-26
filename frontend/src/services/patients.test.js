/*
 * Smart Home Health Hub
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
// Wave 2 — patient REST wrappers. They use raw fetch(config.apiUrl + path);
// we mock global.fetch and assert URL/method/body and error propagation.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { patientService } from './patients';

const res = (body, { ok = true, status = 200 } = {}) => ({ ok, status, json: async () => body });

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(res({})));
});

const calledUrl = () => fetch.mock.calls[0][0];
const calledOpts = () => fetch.mock.calls[0][1] || {};

describe('patientService reads', () => {
  it('getPatients GETs the collection', async () => {
    fetch.mockResolvedValueOnce(res([{ id: 1 }]));
    const out = await patientService.getPatients();
    expect(calledUrl()).toContain('/api/patients/');
    expect(out).toEqual([{ id: 1 }]);
  });

  it('getPatient hits the id path', async () => {
    await patientService.getPatient(7);
    expect(calledUrl()).toContain('/api/patients/7');
  });

  it('getCurrentPatient hits /current', async () => {
    await patientService.getCurrentPatient();
    expect(calledUrl()).toContain('/api/patients/current');
  });

  it('throws when the response is not ok', async () => {
    fetch.mockResolvedValueOnce(res({}, { ok: false, status: 500 }));
    await expect(patientService.getPatients()).rejects.toThrow('Failed to fetch patients');
  });
});

describe('patientService writes', () => {
  it('createPatient POSTs JSON', async () => {
    await patientService.createPatient({ first_name: 'A' });
    expect(calledOpts().method).toBe('POST');
    expect(calledOpts().headers['Content-Type']).toBe('application/json');
    expect(JSON.parse(calledOpts().body)).toEqual({ first_name: 'A' });
  });

  it('updatePatient PUTs to the id path', async () => {
    await patientService.updatePatient(3, { last_name: 'B' });
    expect(calledUrl()).toContain('/api/patients/3');
    expect(calledOpts().method).toBe('PUT');
  });

  it('deactivatePatient DELETEs', async () => {
    await patientService.deactivatePatient(4);
    expect(calledUrl()).toContain('/api/patients/4');
    expect(calledOpts().method).toBe('DELETE');
  });

  it('setCurrentPatient POSTs to /set-current', async () => {
    await patientService.setCurrentPatient(5);
    expect(calledUrl()).toContain('/api/patients/5/set-current');
    expect(calledOpts().method).toBe('POST');
  });

  it('activatePatient POSTs to /activate', async () => {
    await patientService.activatePatient(6);
    expect(calledUrl()).toContain('/api/patients/6/activate');
    expect(calledOpts().method).toBe('POST');
  });
});
