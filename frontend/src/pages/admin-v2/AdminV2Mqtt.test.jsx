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
// AdminV2Mqtt on the vc cfg-* chassis: broker settings, test, discovery.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';

vi.mock('./AdminV2Layout', () => ({ default: ({ children }) => <div>{children}</div> }));

const { navigate } = vi.hoisted(() => ({ navigate: vi.fn() }));
vi.mock('react-router-dom', () => ({ useNavigate: () => navigate }));
vi.mock('../../config', () => ({ default: { apiUrl: '' } }));

import AdminV2Mqtt from './AdminV2Mqtt';

const SAVED = {
  mqtt_enabled: true, mqtt_broker: '192.168.1.40', mqtt_port: 1883,
  mqtt_username: 'shh', mqtt_password: 'secret',
  mqtt_client_id: 'sensor_monitor', mqtt_base_topic: 'shh',
};

let fetchMock;
const stubFetch = (settings = SAVED) => {
  fetchMock = vi.fn(async (url) => {
    if (url.endsWith('/api/mqtt/settings')) return { ok: true, status: 200, json: async () => settings };
    return { ok: true, status: 200, json: async () => ({}) };
  });
  vi.stubGlobal('fetch', fetchMock);
};

beforeEach(() => { navigate.mockReset(); stubFetch(); });

const renderPage = async () => { await act(async () => { render(<AdminV2Mqtt />); }); };
const postTo = (path) => fetchMock.mock.calls.find(([u, o]) => u.endsWith(path) && o?.method === 'POST');

describe('AdminV2Mqtt', () => {
  it('renders three vc sections rather than shadcn cards', async () => {
    await renderPage();
    expect([...document.querySelectorAll('.cfg-title')].map(t => t.textContent))
      .toEqual(['Connection', 'Home Assistant discovery', 'Per-patient settings']);
    expect(document.querySelector('.tw')).not.toBeInTheDocument();
  });

  it('loads the saved broker settings into the fields', async () => {
    await renderPage();
    expect(document.querySelector('#mqtt-broker').value).toBe('192.168.1.40');
    expect(document.querySelector('#mqtt-port').value).toBe('1883');
    expect(document.querySelector('#mqtt-base-topic').value).toBe('shh');
    expect(screen.getByLabelText('Enable MQTT').checked).toBe(true);
  });

  it('disables the broker fields and the MQTT actions when MQTT is off', async () => {
    stubFetch({ ...SAVED, mqtt_enabled: false });
    await renderPage();
    expect(document.querySelector('#mqtt-broker')).toBeDisabled();
    expect(screen.getByRole('button', { name: /^Test$/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Send discovery/i })).toBeDisabled();
    // Save stays live so MQTT can actually be turned back on.
    expect(screen.getByRole('button', { name: /^Save$/ })).toBeEnabled();
  });

  it('posts edited settings and flashes a success', async () => {
    await renderPage();
    await act(async () => {
      fireEvent.change(document.querySelector('#mqtt-broker'), { target: { value: 'broker.lan' } });
    });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /^Save$/ })); });

    const [, opts] = postTo('/api/mqtt/settings');
    expect(JSON.parse(opts.body)).toMatchObject({ mqtt_broker: 'broker.lan', mqtt_port: 1883 });
    expect(document.querySelector('.em-success')).toHaveTextContent('Connection settings saved.');
  });

  it('tests the connection against the test endpoint', async () => {
    await renderPage();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /^Test$/ })); });
    expect(postTo('/api/mqtt/test-connection')).toBeTruthy();
    expect(document.querySelector('.em-success')).toHaveTextContent('Connection test succeeded.');
  });

  it('sends discovery for all enabled patients', async () => {
    await renderPage();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Send discovery/i })); });
    expect(postTo('/api/mqtt/send-discovery')).toBeTruthy();
    expect(document.querySelector('.em-success')).toHaveTextContent('Discovery sent');
  });

  it('surfaces a save failure in the shared em-error box', async () => {
    await renderPage();
    fetchMock.mockResolvedValue({ ok: false, status: 400, json: async () => ({ detail: 'bad broker' }) });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /^Save$/ })); });
    expect(document.querySelector('.em-error')).toHaveTextContent('bad broker');
  });

  it('links through to the per-patient settings', async () => {
    await renderPage();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Go to Patients/i })); });
    expect(navigate).toHaveBeenCalledWith('/care/configuration/patients');
  });
});
