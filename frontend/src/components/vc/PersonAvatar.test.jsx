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
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import PersonAvatar from './PersonAvatar';
import { _resetAuthedImageCache } from '../../hooks/useAuthedImageUrl';

describe('PersonAvatar', () => {
  beforeEach(() => {
    _resetAuthedImageCache();
    vi.stubGlobal('fetch', vi.fn());
    URL.createObjectURL = vi.fn(() => 'blob:fake');
    URL.revokeObjectURL = vi.fn();
  });
  afterEach(() => { vi.restoreAllMocks(); });

  it('draws an identicon from kind:id and labels it with the name', () => {
    const { container } = render(<PersonAvatar kind="user" id={7} name="Jane Doe" />);
    const root = container.querySelector('.pa');
    expect(root).toHaveAttribute('role', 'img');
    expect(root).toHaveAttribute('aria-label', 'Jane Doe');
    expect(root.style.getPropertyValue('--pa-size')).toBe('36px');
    expect(container.querySelector('svg.pa-svg')).toBeTruthy();
    expect(container.querySelector('.pa-initials')).toBeNull();
    expect(container.querySelector('img')).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('is the same picture for the same person and different for a shuffled seed', () => {
    const a = render(<PersonAvatar kind="user" id={7} />).container.querySelector('svg').innerHTML;
    const b = render(<PersonAvatar kind="user" id={7} />).container.querySelector('svg').innerHTML;
    const c = render(<PersonAvatar kind="user" id={7} seed="some-uuid" />).container.querySelector('svg').innerHTML;
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });

  it('falls back to initials only when there is nothing to hash', () => {
    const { container } = render(<PersonAvatar kind="user" name="Mary Ann Smith" />);
    expect(container.querySelector('svg')).toBeNull();
    expect(container.querySelector('.pa-initials').textContent).toBe('MS');
  });

  it('is aria-hidden when decorative', () => {
    const { container } = render(<PersonAvatar kind="patient" id={1} name="P" decorative size={52} />);
    const root = container.querySelector('.pa');
    expect(root).toHaveAttribute('aria-hidden', 'true');
    expect(root).not.toHaveAttribute('role');
    expect(root.style.getPropertyValue('--pa-size')).toBe('52px');
  });

  it('shows the photo over the identicon once it loads, and revokes on unmount', async () => {
    fetch.mockResolvedValue({ ok: true, blob: () => Promise.resolve(new Blob(['x'])) });
    const { container, unmount } = render(
      <PersonAvatar kind="patient" id={5} photo="abc.jpg" name="Pat" />,
    );
    expect(container.querySelector('svg')).toBeTruthy(); // identicon underneath while loading
    await waitFor(() => expect(container.querySelector('img.pa-photo')).toBeTruthy());
    expect(container.querySelector('img').getAttribute('src')).toBe('blob:fake');
    expect(fetch.mock.calls[0][0]).toMatch(/\/api\/patients\/5\/avatar\/photo\/abc\.jpg$/);
    expect(fetch.mock.calls[0][1].credentials).toBe('include');
    unmount();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:fake');
  });

  it('fetches a shared photo once for many consumers', async () => {
    fetch.mockResolvedValue({ ok: true, blob: () => Promise.resolve(new Blob(['x'])) });
    const { container } = render(
      <>
        <PersonAvatar kind="user" id={1} photo="a.jpg" />
        <PersonAvatar kind="user" id={1} photo="a.jpg" />
      </>,
    );
    await waitFor(() => expect(container.querySelectorAll('img')).toHaveLength(2));
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('keeps the identicon when the photo fails', async () => {
    fetch.mockResolvedValue({ ok: false, status: 404 });
    const { container } = render(<PersonAvatar kind="user" id={1} photo="gone.jpg" />);
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 0));
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('svg')).toBeTruthy();
  });

  it('providers never fetch photos', () => {
    render(<PersonAvatar kind="provider" id={1} photo="x.jpg" />);
    expect(fetch).not.toHaveBeenCalled();
  });
});
