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
// The care-profile pages after moving off shadcn onto the cfg chassis + the
// bespoke cp-* hub system. Data comes from a mocked useCareProfile.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';

vi.mock('../AdminV2Layout', () => ({ default: ({ children }) => <div>{children}</div> }));
vi.mock('../components/AvatarEditor', () => ({ default: () => <span data-testid="avatar" /> }));
vi.mock('../../../contexts/AdminPatientContext', () => ({
  useAdminPatient: () => ({ refreshPatients: () => {} }),
}));

const { record, fns } = vi.hoisted(() => {
  const ranges = [
    { vital_key: 'heart_rate', label: 'Heart rate', unit: 'bpm', expected_min: 60, expected_max: 100, required: true, builtin: true },
    { vital_key: 'spo2', label: 'SpO2', unit: '%', expected_min: null, expected_max: null, required: false, builtin: true },
  ];
  const record = {
    patient: {
      id: 5, first_name: 'Eli', last_name: 'Carty', is_active: true,
      care_area: 'Bedroom', notes: '', date_of_birth: '2016-01-01',
      created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-02T00:00:00Z',
    },
    setPatient: () => {},
    mqtt: {
      enabled: true, sections: { vitals: 'get' }, baseTopic: 'shh',
      integration: { id: 1, settings: {} },
      topicOverrides: { state_topic: '', set_topic: '' },
      sectionCount: 1,
    },
    measurements: { ranges, envRanges: [], customDefinitions: [] },
    loading: false,
    error: '',
    setError: () => {},
    reload: async () => {},
  };
  const fns = { updateCareProfile: vi.fn(async () => record.patient) };
  return { record, fns };
});
vi.mock('./useCareProfile', () => ({ default: () => record, ...fns }));
vi.mock('react-router-dom', () => ({
  useParams: () => ({ patientId: '5' }),
  useNavigate: () => vi.fn(),
  Link: ({ to, children, ...rest }) => <a href={to} {...rest}>{children}</a>,
}));
vi.mock('../../../config', () => ({
  default: { apiUrl: '' },
  apiFetch: (...args) => fetch(...args),
}));

import AdminV2CareProfileHub from './AdminV2CareProfileHub';
import AdminV2CareProfileEdit from './AdminV2CareProfileEdit';
import AdminV2CareProfileMeasurements from './measurements/AdminV2CareProfileMeasurements';
import AdminV2CareProfileHomeAssistant from './home-assistant/AdminV2CareProfileHomeAssistant';

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('fetch', vi.fn(async (url) => {
    if (String(url).includes('/api/mqtt/status')) {
      return { ok: true, status: 200, json: async () => ({ enabled: true, connected: true, broker: 'broker.local', port: 1883, base_topic: 'shh' }) };
    }
    if (String(url).includes('/entities')) {
      return { ok: true, status: 200, json: async () => ({ count: 1, entities: [] }) };
    }
    return { ok: true, status: 200, json: async () => ({}) };
  }));
});

const noShadcn = () => {
  expect(document.querySelector('[data-slot="dialog-content"]')).not.toBeInTheDocument();
  expect(document.querySelector('.tw')).not.toBeInTheDocument();
};

describe('care-profile pages on the vc chassis', () => {
  it('hub: cfg crumb + badge, cp rows, no shadcn left', async () => {
    await act(async () => { render(<AdminV2CareProfileHub />); });
    noShadcn();
    expect(document.querySelector('.cfg-crumb .cfg-back')).toBeInTheDocument();
    expect(document.querySelector('.cfg-badge')).toHaveTextContent('Active');
    expect(document.querySelectorAll('.cp-row').length).toBeGreaterThan(0);
  });

  it('edit: saves through the section-footer submit tied to the form id', async () => {
    await act(async () => { render(<AdminV2CareProfileEdit />); });
    noShadcn();
    expect(screen.getByLabelText(/First Name/)).toHaveClass('em-input');
    expect(screen.getByRole('button', { name: 'Save profile' }))
      .toHaveAttribute('form', 'cp-edit-form');
    await act(async () => { fireEvent.submit(document.getElementById('cp-edit-form')); });
    expect(fns.updateCareProfile).toHaveBeenCalledWith('5', expect.objectContaining({
      first_name: 'Eli',
    }));
  });

  it('measurements: a row opens the vc editor dialog with em fields', async () => {
    await act(async () => { render(<AdminV2CareProfileMeasurements />); });
    noShadcn();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Heart rate/ })); });
    expect(document.querySelector('.em-panel')).toBeInTheDocument();
    expect(screen.getByLabelText(/Expected min/)).toHaveClass('em-input');
    noShadcn();
  });

  it('home assistant: a permission group opens the vc dialog with native selects', async () => {
    await act(async () => { render(<AdminV2CareProfileHomeAssistant />); });
    noShadcn();
    const groupRow = document.querySelector('.cp-row.cp-row-button');
    expect(groupRow).toBeTruthy();
    await act(async () => { fireEvent.click(groupRow); });
    expect(document.querySelector('.em-panel')).toBeInTheDocument();
    expect(document.querySelector('.em-panel .em-select-wrap select')).toBeTruthy();
    noShadcn();
  });
});
