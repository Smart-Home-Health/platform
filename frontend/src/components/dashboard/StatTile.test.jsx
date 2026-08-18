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
// The live-vital tile. What matters is that the desktop tile is unchanged by
// the phone flip, and that a flipped tile still shows its reading.
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import StatTile from './StatTile';

const base = {
  label: 'SpO₂',
  source: 'Pulse ox · live',
  value: 97,
  unit: '%',
  accent: '#4da7bd',
  stats: { avg: '97.4%', min: '94%', max: '99%' },
};

describe('StatTile', () => {
  it('is a plain tile with no flip handler, as on desktop', () => {
    const { container } = render(<StatTile {...base} />);
    expect(container.querySelector('button')).toBeNull();
    expect(container.querySelector('.ld-tile-value').textContent).toBe('97');
    expect(screen.getByText('97.4%')).toBeInTheDocument();
  });

  it('becomes a button once it can flip', () => {
    render(<StatTile {...base} onFlip={vi.fn()} chart={<svg />} />);
    const btn = screen.getByRole('button');
    expect(btn).toHaveAttribute('aria-pressed', 'false');
    expect(btn).toHaveAttribute('aria-label', 'SpO₂: show trend');
  });

  it('calls back on tap', () => {
    const onFlip = vi.fn();
    render(<StatTile {...base} onFlip={onFlip} chart={<svg />} />);
    fireEvent.click(screen.getByRole('button'));
    expect(onFlip).toHaveBeenCalledTimes(1);
  });

  it('keeps the reading visible behind the trace rather than swapping it out', () => {
    const { container } = render(
      <StatTile {...base} onFlip={vi.fn()} chart={<svg data-testid="trace" />} flipped />
    );
    expect(container.querySelector('.ld-tile-ghost-value').textContent).toBe('97');
    expect(container.querySelector('.ld-tile-ghost-unit').textContent).toBe('%');
    expect(screen.getByTestId('trace')).toBeInTheDocument();
    // The plain value row is what the ghost replaces.
    expect(container.querySelector('.ld-tile-value')).toBeNull();
  });

  it('keeps AVG/MIN/MAX while flipped', () => {
    render(<StatTile {...base} onFlip={vi.fn()} chart={<svg />} flipped />);
    expect(screen.getByText('94%')).toBeInTheDocument();
    expect(screen.getByText('99%')).toBeInTheDocument();
  });

  it('stays on the number when there is no trace to show', () => {
    const { container } = render(<StatTile {...base} onFlip={vi.fn()} chart={null} flipped />);
    expect(container.querySelector('.ld-tile-value').textContent).toBe('97');
    expect(container.querySelector('.ld-tile-ghost')).toBeNull();
  });

  it('shows a placeholder rather than blank when the sensor has nothing', () => {
    const { container } = render(<StatTile {...base} value={null} onFlip={vi.fn()} chart={<svg />} flipped />);
    expect(container.querySelector('.ld-tile-ghost-value').textContent).toBe('--');
  });

  it('carries the accent so the ghost can tint itself', () => {
    const { container } = render(<StatTile {...base} onFlip={vi.fn()} chart={<svg />} flipped />);
    expect(container.querySelector('.ld-tile').style.getPropertyValue('--ld-accent')).toBe('#4da7bd');
  });
});
