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
// Composing a broadcast. Every control has to map onto a real field of the
// create API — the point of this form is that what you set is what gets stored.
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import ComposeMessageSheet from './ComposeMessageSheet';

const setup = (props = {}) => {
  const onSubmit = vi.fn();
  const onClose = vi.fn();
  const utils = render(
    <ComposeMessageSheet open onClose={onClose} onSubmit={onSubmit} {...props} />
  );
  return { ...utils, onSubmit, onClose };
};

const type = (placeholder, value) =>
  fireEvent.change(screen.getByPlaceholderText(placeholder), { target: { value } });

describe('ComposeMessageSheet', () => {
  it('will not post without a title', () => {
    setup();
    expect(screen.getByText('Post message').closest('button')).toBeDisabled();
    type('What should everyone know?', 'Fridge is fixed');
    expect(screen.getByText('Post message').closest('button')).not.toBeDisabled();
  });

  it('treats a whitespace-only title as no title', () => {
    setup();
    type('What should everyone know?', '   ');
    expect(screen.getByText('Post message').closest('button')).toBeDisabled();
  });

  it('posts the defaults a manual broadcast should have', () => {
    const { onSubmit } = setup();
    type('What should everyone know?', '  Fridge is fixed  ');
    fireEvent.click(screen.getByText('Post message'));
    expect(onSubmit).toHaveBeenCalledWith({
      title: 'Fridge is fixed',       // trimmed
      body: null,                     // empty optional body, not ''
      severity: 'info',
      ack_scope: 'anyone',
      dismissible: true,
      snoozable: true,
    });
  });

  it('maps the priority row onto the severity the card will show', () => {
    const { onSubmit } = setup();
    type('What should everyone know?', 'Oxygen delivery moved');
    fireEvent.click(screen.getByText('Important'));
    fireEvent.click(screen.getByText('Post message'));
    expect(onSubmit.mock.calls[0][0].severity).toBe('warning');
  });

  it('keeps the urgent level the API already supports', () => {
    const { onSubmit } = setup();
    type('What should everyone know?', 'Call the nurse line');
    fireEvent.click(screen.getByText('Urgent'));
    fireEvent.click(screen.getByText('Post message'));
    expect(onSubmit.mock.calls[0][0].severity).toBe('critical');
  });

  it('carries the follow-up toggles through', () => {
    const { onSubmit } = setup();
    type('What should everyone know?', 'Standing note');
    fireEvent.click(screen.getByRole('switch', { name: 'Allow snoozing' }));
    fireEvent.click(screen.getByText('Post message'));
    expect(onSubmit.mock.calls[0][0].snoozable).toBe(false);
  });

  it('stops asking who clears it once nothing can clear it', () => {
    setup();
    expect(screen.getByText('Clear for everyone')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('switch', { name: 'Allow clearing' }));
    expect(screen.queryByText('Clear for everyone')).not.toBeInTheDocument();
  });

  it('records that each person must acknowledge', () => {
    const { onSubmit } = setup();
    type('What should everyone know?', 'Read the care plan update');
    fireEvent.click(screen.getByText('Each person clears their own'));
    fireEvent.click(screen.getByText('Post message'));
    expect(onSubmit.mock.calls[0][0].ack_scope).toBe('per_user');
  });

  it('counts down only as the real 255-character limit approaches', () => {
    setup();
    type('What should everyone know?', 'x'.repeat(200));
    expect(screen.queryByText(/left$/)).toBeNull();
    type('What should everyone know?', 'x'.repeat(230));
    expect(screen.getByText('25 left')).toBeInTheDocument();
  });

  it('clears the form on cancel so the next compose starts empty', () => {
    const { onClose } = setup();
    type('What should everyone know?', 'Draft');
    fireEvent.click(screen.getByText('Cancel'));
    expect(onClose).toHaveBeenCalled();
    expect(screen.getByPlaceholderText('What should everyone know?')).toHaveValue('');
  });

  it('does not post twice while the first post is in flight', () => {
    const { onSubmit } = setup({ saving: true });
    type('What should everyone know?', 'Fridge is fixed');
    expect(screen.getByText('Posting…').closest('button')).toBeDisabled();
    fireEvent.click(screen.getByText('Posting…'));
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
