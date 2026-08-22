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
// Live camera modal chrome: the vc title, the stream-load error inline, and
// the empty state — without a real player.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ModalDockProvider } from '../contexts/ModalDockContext';
import CameraLiveModal from './CameraLiveModal';

vi.mock('hls.js', () => ({ default: { isSupported: () => false } }));
vi.mock('./ZoomableVideo', () => ({ default: () => <div data-testid="video" /> }));

const renderModal = () => render(
  <ModalDockProvider value={{ docked: true, expanded: false, toggleExpand: vi.fn(), setExpanded: vi.fn() }}>
    <CameraLiveModal patientId={5} patientName="Test Testerson" onClose={vi.fn()} />
  </ModalDockProvider>
);

beforeEach(() => { vi.unstubAllGlobals(); });

describe('CameraLiveModal', () => {
  it('shows a load failure inline under the vc title', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 503, json: async () => ({ detail: 'Frigate is offline' }) })));
    renderModal();
    expect(screen.getByText('Live camera')).toBeInTheDocument();
    expect(screen.getByText('Test Testerson · Live')).toBeInTheDocument();
    expect(await screen.findByText('Frigate is offline')).toHaveClass('em-error');
  });

  it('says so when the patient has no stream', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ camera: 'bedroom', live_url: null, snapshot_url: '/snap.jpg' }) })));
    renderModal();
    expect(await screen.findByText('No stream available')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open snapshot' })).toHaveAttribute('href', '/snap.jpg');
  });
});
