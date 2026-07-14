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
// AdminV2Environment: Open-Meteo connector card — load/save config, geocode
// search filling coordinates, backfill kickoff.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act, fireEvent, waitFor } from '@testing-library/react';

vi.mock('./AdminV2Layout', () => ({ default: ({ children }) => <div>{children}</div> }));

const { apiFetchMock } = vi.hoisted(() => ({ apiFetchMock: vi.fn() }));
vi.mock('../../config', () => ({
  default: { apiUrl: '' },
  apiFetch: apiFetchMock,
}));

import AdminV2Environment from './AdminV2Environment';

const baseConnector = {
  slug: 'open_meteo',
  name: 'Open-Meteo Weather',
  description: '',
  metrics_provided: ['barometric_pressure'],
  poll_capable: true,
  config_schema: { type: 'object', properties: {} },
  config: { enabled: true, latitude: 40.05, longitude: -75.4, location_label: 'Home' },
  configured: true,
  enabled: true,
  state: {
    last_poll_at: '2026-07-14T10:00:00+00:00',
    last_status: 'success',
    last_insert_count: 12,
    backfill: { status: 'done', completed_at: '2026-07-13T00:00:00+00:00', inserted: 9000 },
  },
};

const jsonResponse = (body, status = 200) => ({
  ok: status < 400,
  status,
  json: async () => body,
});

const renderPage = async () => {
  await act(async () => {
    render(<AdminV2Environment />);
  });
};

beforeEach(() => {
  apiFetchMock.mockReset();
  vi.unstubAllGlobals();
});

describe('AdminV2Environment', () => {
  it('renders connector status and config from the API', async () => {
    apiFetchMock.mockResolvedValue(jsonResponse([baseConnector]));
    await renderPage();

    expect(screen.getByText('Outdoor weather (Open-Meteo)')).toBeInTheDocument();
    expect(screen.getByText('Collecting')).toBeInTheDocument();
    expect(screen.getByLabelText('Latitude')).toHaveValue(40.05);
    expect(screen.getByLabelText('Longitude')).toHaveValue(-75.4);
    expect(screen.getByLabelText('Label')).toHaveValue('Home');
    expect(screen.getByText(/OK — 12 new readings/)).toBeInTheDocument();
  });

  it('saving issues a PUT with the edited config', async () => {
    apiFetchMock.mockResolvedValueOnce(jsonResponse([baseConnector]));
    await renderPage();

    apiFetchMock.mockResolvedValueOnce(jsonResponse(baseConnector));
    fireEvent.change(screen.getByLabelText('Latitude'), { target: { value: '41.5' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    });

    const [url, opts] = apiFetchMock.mock.calls[1];
    expect(url).toContain('/api/environment/connectors/open_meteo/config');
    expect(opts.method).toBe('PUT');
    const body = JSON.parse(opts.body);
    expect(body.latitude).toBe(41.5);
    expect(body.enabled).toBe(true);
    expect(await screen.findByText(/Saved/)).toBeInTheDocument();
  });

  it('backfill confirms then POSTs', async () => {
    const idle = { ...baseConnector, state: { ...baseConnector.state, backfill: {} } };
    apiFetchMock.mockResolvedValueOnce(jsonResponse([idle]));
    await renderPage();

    vi.stubGlobal('confirm', vi.fn(() => true));
    apiFetchMock.mockResolvedValueOnce(jsonResponse({ status: 'started', days: 90 }, 202));
    // The subsequent state-watch refetch
    apiFetchMock.mockResolvedValue(jsonResponse([baseConnector]));

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Import 90-day history' }));
    });

    expect(window.confirm).toHaveBeenCalled();
    const [url, opts] = apiFetchMock.mock.calls[1];
    expect(url).toContain('/api/environment/connectors/open_meteo/backfill');
    expect(opts.method).toBe('POST');
    expect(JSON.parse(opts.body)).toEqual({ days: 90 });
    expect(await screen.findByText(/Backfill started/)).toBeInTheDocument();
  });

  it('geocode search fills coordinates and label', async () => {
    apiFetchMock.mockResolvedValue(jsonResponse([baseConnector]));
    await renderPage();

    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({
      results: [{
        id: 1, name: 'Springfield', admin1: 'Pennsylvania', country: 'United States',
        country_code: 'US', latitude: 39.9307, longitude: -75.3202,
      }],
    })));

    fireEvent.change(screen.getByLabelText('Find your location'),
      { target: { value: 'Springfield' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Search/ }));
    });

    const result = await screen.findByText(/Springfield, Pennsylvania, United States/);
    await act(async () => {
      fireEvent.click(result);
    });

    await waitFor(() => {
      expect(screen.getByLabelText('Latitude')).toHaveValue(39.9307);
      expect(screen.getByLabelText('Longitude')).toHaveValue(-75.3202);
      expect(screen.getByLabelText('Label')).toHaveValue('Springfield, Pennsylvania, US');
    });
  });
});
