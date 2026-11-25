import { describe, it, expect, vi, afterEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import AdminV2Connections from './AdminV2Connections';

vi.mock('./AdminV2Layout', () => ({ default: ({ children }) => <div>{children}</div> }));
vi.mock('../../contexts/AdminPatientContext', () => ({
  useAdminPatient: () => ({ selectedPatient: { id: 8 }, loadingPatients: false }),
}));
vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => ({ user: { is_system_admin: true } }) }));
afterEach(() => vi.unstubAllGlobals());

function serve(addons, addonHost = true) {
  const properties = {
    base_url: { type: 'string', title: 'Frigate Base URL' },
    auth_header: { type: 'string', title: 'Authorization' },
    camera: { type: 'string', title: 'Camera' },
    live_mode: { type: 'string', title: 'Live mode', default: 'hls' },
  };
  const response = (body) => ({ ok: true, json: async () => body });
  const fetch = vi.fn(async (url, opts = {}) => {
    const { pathname } = new URL(url);
    if (pathname.endsWith('/api/integrations')) return response([{
      name: 'Frigate NVR', slug: 'frigate', auth_type: 'local', auth_fields: ['base_url', 'auth_header', 'addon_slug'],
      config_schema: { properties, 'x-ha-addon-discovery': addonHost },
    }]);
    if (pathname.endsWith('/addons')) return response(addons);
    if (pathname.endsWith('/patient/8') && opts.method === 'POST') return response({
      id: 12, integration_slug: 'frigate', integration_name: 'Frigate NVR', is_enabled: false,
    });
    if (pathname.endsWith('/cameras')) return response([{ device_id: 'room', device_name: 'Room' }]);
    if (pathname.endsWith('/readers')) return response({ readers: [] });
    return response([]);
  });
  vi.stubGlobal('fetch', fetch);
  return fetch;
}

async function openFrigate() {
  render(<AdminV2Connections />);
  fireEvent.click(await screen.findByRole('button', { name: 'Add Frigate NVR' }));
}

describe('Frigate setup', () => {
  it('uses the running add-on and lets the caregiver pick a camera', async () => {
    const fetch = serve([{ slug: 'ccab4aaf_frigate', name: 'Frigate', running: true }]);
    await openFrigate();
    expect(await screen.findByText('Detected in Home Assistant')).toBeInTheDocument();
    const server = await screen.findByLabelText('Frigate server');
    expect(server).toHaveValue('ccab4aaf_frigate');
    expect(screen.queryByLabelText('Frigate Base URL')).toBeNull();
    fireEvent.change(server, { target: { value: '' } });
    expect(screen.getByLabelText('Frigate Base URL')).toBeInTheDocument();
    fireEvent.change(server, { target: { value: 'ccab4aaf_frigate' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add', exact: true }));
    expect(await screen.findByLabelText('Camera')).toHaveValue('room');
    const [, connect] = fetch.mock.calls.find(([url]) => url.endsWith('/12/connect'));
    expect(JSON.parse(connect.body)).toEqual({ addon_slug: 'ccab4aaf_frigate' });
    fireEvent.click(screen.getByRole('button', { name: 'Use this camera' }));
    await waitFor(() => expect(fetch.mock.calls.some(([url, opts]) =>
      url.endsWith('/8/select') && JSON.parse(opts.body).camera === 'room')).toBe(true));
  });

  it('keeps manual setup available when the recorder is absent', async () => {
    serve([]);
    await openFrigate();
    expect(await screen.findByText(/No Frigate recorder add-on/)).toBeInTheDocument();
    expect(screen.getByLabelText('Frigate Base URL')).toBeInTheDocument();
  });

  it('identifies a stopped recorder and explains how to connect it', async () => {
    serve([{ slug: 'ccab4aaf_frigate', name: 'Frigate', running: false }]);
    await openFrigate();
    expect(await screen.findByRole('option', { name: 'Frigate · Stopped' })).toBeDisabled();
    expect(screen.getByText(/Start Frigate in Home Assistant/)).toBeInTheDocument();
    expect(screen.getByLabelText('Frigate server')).toHaveValue('');
  });

  it('uses the existing URL form on standalone installs', async () => {
    const fetch = serve([], false);
    await openFrigate();
    expect(screen.getByLabelText('Frigate Base URL')).toBeInTheDocument();
    expect(fetch.mock.calls.some(([url]) => url.endsWith('/addons'))).toBe(false);
  });
});
