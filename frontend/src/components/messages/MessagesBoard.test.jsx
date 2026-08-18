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
// The shared board. Worth pinning: no coloured bar down the side of a card
// (the reason this was rebuilt), that severity is still legible without one,
// that the source filter narrows rather than hides, and that a message which
// cannot be dismissed explains itself instead of showing a dead button.
import { render, screen, fireEvent, within } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import MessagesBoard from './MessagesBoard';

const lowMed = (over = {}) => ({
  id: 1, type: 'low_medication', severity: 'warning',
  title: 'Ojemda is running low', body: '2 units remain.',
  dismissible: true, snoozable: true, ack_scope: 'anyone', patient_id: 2,
  created_at: '2026-06-26T02:22:00Z',
  data: { medication_id: 9, medication_name: 'Ojemda' }, ...over,
});
const manual = (over = {}) => ({
  id: 2, type: 'general', severity: 'info', title: 'Test', body: 'Testing',
  dismissible: true, snoozable: true, ack_scope: 'anyone',
  created_at: '2026-06-26T03:26:00Z', ...over,
});

const setup = (props = {}) =>
  render(<MessagesBoard items={[lowMed(), manual()]} {...props} />);

describe('MessagesBoard', () => {
  it('groups system messages ahead of manual ones', () => {
    const { container } = setup();
    const heads = [...container.querySelectorAll('.mx-group-head')].map(n => n.textContent);
    expect(heads).toEqual(['System messages1', 'Other1']);
  });

  it('carries severity on the badge and the icon, never on a side bar', () => {
    const { container } = setup();
    expect(screen.getByText('Warning')).toHaveClass('mx-badge', 'warning');
    expect(container.querySelector('.mx-icon.warning')).toBeInTheDocument();
    // The stripe is what the rebuild removed: no card may reintroduce it.
    const card = container.querySelector('.mx-card');
    expect(getComputedStyle(card).borderLeftWidth).toBe(getComputedStyle(card).borderRightWidth);
  });

  it('filters to one source and back', () => {
    const { container } = setup();
    expect(container.querySelectorAll('.mx-card')).toHaveLength(2);
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'low_medication' } });
    expect(container.querySelectorAll('.mx-card')).toHaveLength(1);
    expect(screen.getByText('Ojemda is running low')).toBeInTheDocument();
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'all' } });
    expect(container.querySelectorAll('.mx-card')).toHaveLength(2);
  });

  it('falls back to every source when the filtered one clears itself', () => {
    const { container, rerender } = setup();
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'low_medication' } });
    // The medication is restocked, so its message resolves out of the list. The
    // filter must not leave the panel looking empty.
    rerender(<MessagesBoard items={[manual(), manual({ id: 3, title: 'Second' })]} />);
    expect(container.querySelectorAll('.mx-card')).toHaveLength(2);
  });

  it('offers no filter when there is only one source to pick from', () => {
    setup({ items: [manual()] });
    expect(screen.queryByRole('combobox')).toBeNull();
  });

  it('dismisses, and labels the action by who it clears for', () => {
    const onDismiss = vi.fn();
    setup({ items: [manual({ ack_scope: 'per_user' })], onDismiss });
    fireEvent.click(screen.getByText('Acknowledge'));
    expect(onDismiss).toHaveBeenCalledWith(expect.objectContaining({ id: 2 }));
  });

  it('explains a message that clears itself instead of showing a dead button', () => {
    setup({ items: [lowMed({ dismissible: false })], onDismiss: vi.fn() });
    expect(screen.queryByText('Dismiss')).not.toBeInTheDocument();
    expect(screen.getByText(/Clears when the underlying condition/)).toBeInTheDocument();
  });

  it('keeps snooze and delete behind the overflow, not on the card face', () => {
    const onSnooze = vi.fn();
    const onDelete = vi.fn();
    const { container } = setup({ items: [manual()], onSnooze, onDelete });
    expect(container.querySelector('.mx-menu')).toBeNull();
    fireEvent.click(screen.getByLabelText('More actions for Test'));
    const menu = container.querySelector('.mx-menu');
    fireEvent.click(within(menu).getByText('4 hours'));
    expect(onSnooze).toHaveBeenCalledWith(expect.objectContaining({ id: 2 }), 240);
  });

  it('shows no overflow control when nothing is behind it', () => {
    const { container } = setup({ items: [manual({ snoozable: false })], onSnooze: vi.fn() });
    expect(container.querySelector('.mx-more')).toBeNull();
  });

  it('leaves no empty action row on an archived card', () => {
    // Dismissed and resolved messages take no actions but delete, so the row
    // must not render as a bare strip under the text — the one overflow
    // button moves up into the header instead.
    const { container } = setup({ items: [manual()], onDelete: vi.fn() });
    expect(container.querySelector('.mx-card-actions')).toBeNull();
    expect(container.querySelector('.mx-card-top .mx-more')).toBeInTheDocument();
  });

  it('links a low-stock message to the medication it is about', () => {
    const onReview = vi.fn();
    setup({ items: [lowMed()], onReview });
    fireEvent.click(screen.getByText('Review Ojemda'));
    expect(onReview).toHaveBeenCalledWith(
      expect.objectContaining({ id: 1 }),
      expect.objectContaining({ to: '/care/medications/manage?patient=2' })
    );
  });

  it('switches status and counts only the tab in view', () => {
    const onStatusChange = vi.fn();
    setup({ onStatusChange, statusCount: 2, status: 'active' });
    const tabs = screen.getAllByRole('tab');
    expect(within(tabs[0]).getByText('2')).toBeInTheDocument();
    expect(within(tabs[1]).queryByText('2')).not.toBeInTheDocument();
    fireEvent.click(tabs[1]);
    expect(onStatusChange).toHaveBeenCalledWith('dismissed');
  });

  it('drops the tab count when the tab is empty', () => {
    setup({ items: [], onStatusChange: vi.fn(), statusCount: 0 });
    expect(within(screen.getAllByRole('tab')[0]).queryByText('0')).toBeNull();
  });

  it('has no tabs where there is nothing to switch to', () => {
    setup();
    expect(screen.queryAllByRole('tab')).toHaveLength(0);
  });

  it('distinguishes an empty status from an empty filter', () => {
    const { rerender } = setup({ items: [], status: 'active' });
    expect(screen.getByText(/All caught up/)).toBeInTheDocument();
    rerender(<MessagesBoard items={[]} status="dismissed" />);
    expect(screen.getByText('No dismissed messages.')).toBeInTheDocument();
  });

  it('marks the narrow dock stop on the board, not from the viewport', () => {
    const { container } = setup({ dense: true });
    expect(container.querySelector('.mx-board')).toHaveClass('dense');
  });
});
