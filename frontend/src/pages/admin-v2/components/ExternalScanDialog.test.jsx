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
// ExternalScanDialog: keyboard-wedge capture. Enter/Tab commit, a short idle
// timeout commits terminator-less scanners (only for scanner-fast input),
// multi mode accumulates a deduped list handed back raw via onComplete.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';

// Radix portals + focus traps are noise here — render the shell inline.
vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({ children }) => <div>{children}</div>,
  DialogContent: ({ children }) => <div>{children}</div>,
  DialogHeader: ({ children }) => <div>{children}</div>,
  DialogTitle: ({ children }) => <h2>{children}</h2>,
}));

import ExternalScanDialog, { IDLE_COMMIT_MS, MIN_AUTO_COMMIT_LEN } from './ExternalScanDialog';

const input = () => screen.getByLabelText('Barcode input');
const advance = (ms) => act(() => { vi.advanceTimersByTime(ms); });

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('ExternalScanDialog (single)', () => {
  it('commits the raw value once on Enter and closes', () => {
    const onFound = vi.fn();
    const onClose = vi.fn();
    render(<ExternalScanDialog open onFound={onFound} onClose={onClose} />);
    fireEvent.change(input(), { target: { value: ' /IEA573717 ' } });
    fireEvent.keyDown(input(), { key: 'Enter' });
    fireEvent.keyDown(input(), { key: 'Enter' });
    expect(onFound).toHaveBeenCalledTimes(1);
    expect(onFound).toHaveBeenCalledWith('/IEA573717'); // trimmed, otherwise raw
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('treats Tab as a terminator and swallows it', () => {
    const onFound = vi.fn();
    render(<ExternalScanDialog open onFound={onFound} onClose={vi.fn()} />);
    fireEvent.change(input(), { target: { value: '0123456789' } });
    const notCancelled = fireEvent.keyDown(input(), { key: 'Tab' });
    expect(onFound).toHaveBeenCalledWith('0123456789');
    expect(notCancelled).toBe(false); // preventDefault fired — focus stays put
  });

  it('auto-commits scanner-fast input after the idle window', () => {
    const onFound = vi.fn();
    render(<ExternalScanDialog open onFound={onFound} onClose={vi.fn()} />);
    // One burst change event = scanner-fast
    fireEvent.change(input(), { target: { value: '0123456789' } });
    advance(IDLE_COMMIT_MS - 1);
    expect(onFound).not.toHaveBeenCalled();
    advance(1);
    expect(onFound).toHaveBeenCalledWith('0123456789');
  });

  it('never auto-commits fragments shorter than the minimum', () => {
    const onFound = vi.fn();
    render(<ExternalScanDialog open onFound={onFound} onClose={vi.fn()} />);
    fireEvent.change(input(), { target: { value: 'abc' } });
    expect('abc'.length).toBeLessThan(MIN_AUTO_COMMIT_LEN);
    advance(IDLE_COMMIT_MS * 5);
    expect(onFound).not.toHaveBeenCalled();
  });

  it('never auto-commits human-paced typing, but Enter still works', () => {
    const onFound = vi.fn();
    render(<ExternalScanDialog open onFound={onFound} onClose={vi.fn()} />);
    const chars = ['a', 'ab', 'abc', 'abcd', 'abcde'];
    chars.forEach((value, i) => {
      if (i > 0) advance(100); // ~100ms/keystroke — human, not a scanner
      fireEvent.change(input(), { target: { value } });
    });
    advance(IDLE_COMMIT_MS * 5);
    expect(onFound).not.toHaveBeenCalled();
    fireEvent.keyDown(input(), { key: 'Enter' });
    expect(onFound).toHaveBeenCalledWith('abcde');
  });

  it('refocuses the input after a blur while open', () => {
    render(<ExternalScanDialog open onFound={vi.fn()} onClose={vi.fn()} />);
    const el = input();
    el.blur();
    fireEvent.blur(el);
    expect(document.activeElement).not.toBe(el);
    advance(0);
    expect(document.activeElement).toBe(el);
  });
});

describe('ExternalScanDialog (multi)', () => {
  const scan = (code) => {
    fireEvent.change(input(), { target: { value: code } });
    fireEvent.keyDown(input(), { key: 'Enter' });
  };

  it('accumulates scans, dedupes with a flash, removes rows, and hands back the list', () => {
    const onComplete = vi.fn();
    render(<ExternalScanDialog open multi onComplete={onComplete} onClose={vi.fn()} />);

    scan('/IEA573717');
    expect(screen.getByText('1 barcode scanned')).toBeInTheDocument();
    scan('/IBX123456');
    expect(screen.getByText('2 barcodes scanned')).toBeInTheDocument();
    expect(input().value).toBe(''); // cleared for the next trigger-pull

    // Duplicate: no new row, a flash instead — and it fades
    scan('/IEA573717');
    expect(screen.getByText('2 barcodes scanned')).toBeInTheDocument();
    expect(screen.getByText('Already scanned · /IEA573717')).toBeInTheDocument();
    advance(1500);
    expect(screen.queryByText(/Already scanned/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Remove /IBX123456' }));
    expect(screen.getByText('1 barcode scanned')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Done — use these/ }));
    expect(onComplete).toHaveBeenCalledWith(['/IEA573717']);
  });

  it('disables Done until something is scanned', () => {
    render(<ExternalScanDialog open multi onComplete={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByRole('button', { name: /Done — use these/ })).toBeDisabled();
  });

  it('asks for the expected count first, then tracks progress against it', () => {
    render(<ExternalScanDialog open multi askExpected onComplete={vi.fn()} onClose={vi.fn()} />);
    expect(screen.queryByLabelText('Barcode input')).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Expected item count'), { target: { value: '3' } });
    fireEvent.click(screen.getByRole('button', { name: /Start scanning/ }));

    scan('/IEA111111');
    expect(screen.getByText('1 of 3 scanned')).toBeInTheDocument();
    scan('/IEA222222');
    scan('/IEA333333');
    expect(screen.getByText('all 3 scanned')).toBeInTheDocument();
  });

  it('"Not sure" skips the count and falls back to a plain tally', () => {
    render(<ExternalScanDialog open multi askExpected onComplete={vi.fn()} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /Not sure — just start/ }));
    scan('/IEA111111');
    expect(screen.getByText('1 barcode scanned')).toBeInTheDocument();
  });

  it('labels doubtful scans via warnFor so they are easy to remove', () => {
    render(
      <ExternalScanDialog
        open
        multi
        warnFor={(code) => (code.startsWith('/I') ? null : 'not an item barcode')}
        onComplete={vi.fn()}
        onClose={vi.fn()}
      />
    );
    scan('/IEA111111');
    scan('INV-000123'); // e.g. the invoice's own barcode
    expect(screen.getAllByText('not an item barcode')).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Remove INV-000123' }));
    expect(screen.queryByText('not an item barcode')).not.toBeInTheDocument();
  });

  it('starts fresh on reopen', () => {
    const { rerender } = render(
      <ExternalScanDialog open multi onComplete={vi.fn()} onClose={vi.fn()} />
    );
    scan('/IEA573717');
    expect(screen.getByText('1 barcode scanned')).toBeInTheDocument();
    rerender(<ExternalScanDialog open={false} multi onComplete={vi.fn()} onClose={vi.fn()} />);
    rerender(<ExternalScanDialog open multi onComplete={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByText('0 barcodes scanned')).toBeInTheDocument();
  });
});
