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
// Inventory wizard scanner routing: every scan button asks camera-vs-external
// first; the external path feeds the exact same handlers as the camera path
// (handleScanComplete for slips, handleItemBarcode for the box barcode).
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('./AdminV2Layout', () => ({ default: ({ children }) => <div>{children}</div> }));

const testPatient = { id: 5, first_name: 'Test', last_name: 'Testerson' };
vi.mock('../../contexts/AdminPatientContext', () => ({
  useAdminPatient: () => ({
    patients: [testPatient],
    selectedPatient: testPatient,
    selectPatient: vi.fn(),
    loadingPatients: false,
  }),
}));

vi.mock('../../services/equipment', () => ({
  equipmentService: {
    list: vi.fn(async () => []),
    catalogImport: vi.fn(),
    setCount: vi.fn(),
  },
}));

vi.mock('../../config', () => ({
  default: { apiUrl: '' },
  apiFetch: vi.fn(async () => ({ ok: false })),
}));

// Camera dialogs are stubs: this suite is about the routing around them.
vi.mock('./components/PackingSlipCapture', () => ({
  default: ({ open }) => (open ? <div data-testid="capture-open" /> : null),
}));
vi.mock('./components/BarcodeScanDialog', () => ({
  default: ({ open }) => (open ? <div data-testid="item-scan-open" /> : null),
}));
vi.mock('./components/CsvItemImport', () => ({ default: () => null }));

import AdminV2InventorySetup from './AdminV2InventorySetup';

const renderWizard = async () => {
  await act(async () => {
    render(<MemoryRouter><AdminV2InventorySetup /></MemoryRouter>);
  });
};

const scanInput = () => screen.getByLabelText('Barcode input');
const wedgeScan = (code) => {
  fireEvent.change(scanInput(), { target: { value: code } });
  fireEvent.keyDown(scanInput(), { key: 'Enter' });
};

// Bank one slip through the external path: chooser -> external -> 2 scans -> Done.
const bankExternalSlip = async () => {
  fireEvent.click(screen.getByRole('button', { name: /Scan a packing slip/ }));
  fireEvent.click(screen.getByRole('button', { name: /Use an external scanner/ }));
  wedgeScan('/IEA573717');
  wedgeScan('/IBX123456');
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: /Done — use these/ }));
  });
};

beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
});

describe('AdminV2InventorySetup scanner choice', () => {
  it('asks camera-vs-external before opening the slip capture', async () => {
    await renderWizard();
    expect(screen.queryByTestId('capture-open')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Scan a packing slip/ }));
    expect(screen.getByText('How do you want to scan?')).toBeInTheDocument();
    expect(screen.queryByTestId('capture-open')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Use the camera/ }));
    expect(screen.getByTestId('capture-open')).toBeInTheDocument();
    expect(screen.queryByText('How do you want to scan?')).not.toBeInTheDocument();
  });

  it('external slip scanning banks a slip through handleScanComplete', async () => {
    await renderWizard();
    await bankExternalSlip();

    // Same "Slip N — X items" badge the camera path produces (real slipItemCount)
    expect(screen.getByText('Slip 1 — 2 items')).toBeInTheDocument();
    expect(screen.queryByLabelText('Barcode input')).not.toBeInTheDocument();
  });

  it('confirms the scanner once at review entry, then every card scans directly', async () => {
    await renderWizard();
    await bankExternalSlip();

    // Entering review asks ONCE — no navigation until a scanner is picked
    fireEvent.click(screen.getByRole('button', { name: /Done — show me what you found/ }));
    expect(screen.getByText('How will you scan the item boxes?')).toBeInTheDocument();
    expect(screen.queryByText("Here's what we found")).not.toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Use an external scanner/ }));
    });
    expect(screen.getByText("Here's what we found")).toBeInTheDocument();

    // Card scan goes straight to the chosen scanner — no chooser again
    fireEvent.click(screen.getByRole('button', { name: /Scan the item's barcode/ }));
    expect(screen.queryByText(/How will you scan|How do you want to scan/)).not.toBeInTheDocument();
    wedgeScan('012345678905');
    expect(screen.getByText(/box barcode saved · 012345678905/)).toBeInTheDocument();

    // A bad read is one tap to redo, straight into the same scanner
    const rescan = screen.getByRole('button', { name: /Rescan the item's barcode/ });
    fireEvent.click(rescan);
    wedgeScan('112345678906');
    expect(screen.getByText(/box barcode saved · 112345678906/)).toBeInTheDocument();
  });

  it('camera choice at review entry opens the camera scanner directly; Switch scanner re-asks', async () => {
    await renderWizard();
    await bankExternalSlip();

    fireEvent.click(screen.getByRole('button', { name: /Done — show me what you found/ }));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Use the camera/ }));
    });
    expect(screen.getByText("Here's what we found")).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Scan the item's barcode/ }));
    expect(screen.getByTestId('item-scan-open')).toBeInTheDocument();
    expect(screen.queryByText(/How do you want to scan/)).not.toBeInTheDocument();

    // Mid-session switch: chooser comes back, new pick opens the other scanner
    fireEvent.click(screen.getByRole('button', { name: 'Switch scanner' }));
    expect(screen.getByText('How do you want to scan?')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Use an external scanner/ }));
    expect(screen.getByLabelText('Barcode input')).toBeInTheDocument();
  });

  it('remembers the last-used scanner as the preselected option', async () => {
    await renderWizard();
    await bankExternalSlip();

    fireEvent.click(screen.getByRole('button', { name: /Scan another slip/ }));
    expect(screen.getByRole('button', { name: /Use an external scanner/ }))
      .toHaveAttribute('data-preselected');
  });
});
