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
// AdminV2HomeAssistant: connection card (supervisor banner vs token form),
// mappings table, and the add-mapping dialog's entity picker.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';

vi.mock('./AdminV2Layout', () => ({ default: ({ children }) => <div>{children}</div> }));

const { apiFetchMock } = vi.hoisted(() => ({ apiFetchMock: vi.fn() }));
vi.mock('../../config', () => ({
  default: { apiUrl: '' },
  apiFetch: apiFetchMock,
}));

import AdminV2HomeAssistant from './AdminV2HomeAssistant';

const jsonResponse = (body, status = 200) => ({
  ok: status < 400,
  status,
  json: async () => body,
});

const baseConfig = {
  enabled: false,
  mode: 'auto',
  base_url: '',
  token_set: false,
  supervisor_available: false,
  connection_available: false,
};

const baseStatus = { connected: false, mapping_count: 0 };

const sampleMapping = {
  id: 1,
  entity_id: 'sensor.spo2_ring',
  friendly_name: 'SpO2 Ring',
  device_class: null,
  source_unit: '%',
  target_kind: 'vital',
  patient_id: 5,
  vital_type: 'spo2',
  vital_group: null,
  metric: null,
  scope: null,
  location: null,
  enabled: true,
  min_interval_seconds: 0,
  last_seen_at: '2026-08-15T10:00:00+00:00',
  last_value: 97,
  last_error: null,
};

// Route the page's parallel fetches by URL.
const routeFetches = ({ config = baseConfig, status = baseStatus, mappings = [],
                        entities = [], patients = [], vitalTypes = [], metrics = [] } = {}) => {
  apiFetchMock.mockImplementation(async (url) => {
    if (url.includes('/home_assistant/config')) return jsonResponse(config);
    if (url.includes('/home_assistant/status')) return jsonResponse(status);
    if (url.includes('/home_assistant/mappings')) return jsonResponse(mappings);
    if (url.includes('/home_assistant/entities')) return jsonResponse(entities);
    if (url.includes('/home_assistant/vital-types')) return jsonResponse(vitalTypes);
    if (url.includes('/api/patients')) return jsonResponse(patients);
    if (url.includes('/api/environment/metrics')) return jsonResponse(metrics);
    return jsonResponse({}, 404);
  });
};

const renderPage = async () => {
  await act(async () => {
    render(<AdminV2HomeAssistant />);
  });
};

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  apiFetchMock.mockReset();
});

describe('AdminV2HomeAssistant', () => {
  it('shows the token form when not running as the add-on', async () => {
    routeFetches();
    await renderPage();

    expect(screen.getByLabelText('Home Assistant URL')).toBeInTheDocument();
    expect(screen.getByLabelText('Long-lived access token')).toBeInTheDocument();
    expect(screen.getByText('Not connected')).toBeInTheDocument();
  });

  it('shows the add-on banner instead of the token form under the Supervisor', async () => {
    routeFetches({
      config: { ...baseConfig, supervisor_available: true, connection_available: true },
      status: { ...baseStatus, connected: true },
    });
    await renderPage();

    expect(screen.getByText(/Running as the Home Assistant add-on/)).toBeInTheDocument();
    expect(screen.queryByLabelText('Home Assistant URL')).not.toBeInTheDocument();
    expect(screen.getByText('Connected')).toBeInTheDocument();
  });

  it('renders existing mappings with target and last value', async () => {
    routeFetches({ mappings: [sampleMapping] });
    await renderPage();

    expect(screen.getByText('SpO2 Ring')).toBeInTheDocument();
    expect(screen.getByText('Vital: spo2')).toBeInTheDocument();
    expect(screen.getByText('97 %')).toBeInTheDocument();
  });

  it('opens the add-mapping dialog and lists pickable entities', async () => {
    routeFetches({
      entities: [
        { entity_id: 'sensor.bedroom_temp', friendly_name: 'Bedroom Temp',
          state: '71', unit_of_measurement: '°F', device_class: 'temperature',
          domain: 'sensor', mapped: false },
        { entity_id: 'sensor.already', friendly_name: 'Already Mapped',
          state: '1', unit_of_measurement: null, device_class: null,
          domain: 'sensor', mapped: true },
      ],
      vitalTypes: [{ value: 'spo2', label: 'SpO2', groups: [] }],
      metrics: [{ name: 'temperature', label: 'Temperature', unit: '°C', derived: false }],
    });
    await renderPage();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Add mapping/ }));
    });

    expect(screen.getByText('Bedroom Temp')).toBeInTheDocument();
    const mappedRow = screen.getByText('Already Mapped').closest('button');
    expect(mappedRow).toBeDisabled();

    // Picking an entity captures its metadata into the form.
    await act(async () => {
      fireEvent.click(screen.getByText('Bedroom Temp').closest('button'));
    });
    expect(screen.getByText(/sensor\.bedroom_temp\s*·\s*°F/)).toBeInTheDocument();
  });

  it('filters entities by search text', async () => {
    routeFetches({
      entities: [
        { entity_id: 'sensor.bedroom_temp', friendly_name: 'Bedroom Temp',
          state: '71', unit_of_measurement: '°F', device_class: 'temperature',
          domain: 'sensor', mapped: false },
        { entity_id: 'sensor.pulse_ox', friendly_name: 'Pulse Ox',
          state: '97', unit_of_measurement: '%', device_class: null,
          domain: 'sensor', mapped: false },
      ],
    });
    await renderPage();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Add mapping/ }));
    });
    fireEvent.change(screen.getByPlaceholderText('Search entities…'),
                     { target: { value: 'pulse' } });

    expect(screen.getByText('Pulse Ox')).toBeInTheDocument();
    expect(screen.queryByText('Bedroom Temp')).not.toBeInTheDocument();
  });
});
