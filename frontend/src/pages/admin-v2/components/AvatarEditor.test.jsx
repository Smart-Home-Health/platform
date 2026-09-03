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
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import AvatarEditor from './AvatarEditor';

const authState = { user: null };
vi.mock('../../../contexts/AuthContext', () => ({ useAuth: () => authState }));
vi.mock('../../../services/avatars', async (orig) => {
  const real = await orig();
  return {
    ...real,
    avatarService: { shuffle: vi.fn(), uploadPhoto: vi.fn(), removePhoto: vi.fn() },
  };
});
import { avatarService } from '../../../services/avatars';

const patient = { id: 5, avatar_seed: null, avatar_photo: null };

describe('AvatarEditor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404 }));
  });

  it('shows no controls to someone without the update permission', () => {
    authState.user = { is_system_admin: false, permissions: ['patients.read'] };
    const { container } = render(<AvatarEditor kind="patient" person={patient} name="Pat Ient" />);
    expect(container.querySelector('.pa svg')).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('lets a holder of patients.update shuffle, and reports the change', async () => {
    authState.user = { is_system_admin: false, permissions: ['patients.update'] };
    avatarService.shuffle.mockResolvedValue({ avatar_seed: 'new-uuid', avatar_photo: null });
    const onChange = vi.fn();
    const onNotice = vi.fn();
    const { container } = render(
      <AvatarEditor kind="patient" person={patient} name="Pat Ient" onChange={onChange} onNotice={onNotice} />,
    );
    const before = container.querySelector('.pa svg').innerHTML;
    fireEvent.click(screen.getByRole('button', { name: /change avatar/i }));
    fireEvent.click(screen.getByRole('menuitem', { name: /shuffle design/i }));
    await waitFor(() => expect(onChange).toHaveBeenCalledWith({ avatar_seed: 'new-uuid', avatar_photo: null }));
    expect(avatarService.shuffle).toHaveBeenCalledWith('patient', 5);
    expect(onNotice).toHaveBeenCalled();
    expect(container.querySelector('.pa svg').innerHTML).not.toBe(before);
    expect(screen.queryByRole('menu')).toBeNull(); // menu closes after acting
  });

  it('offers Remove photo only when there is one, and surfaces API errors', async () => {
    authState.user = { is_system_admin: true, permissions: [] };
    avatarService.removePhoto.mockRejectedValue(new Error('Photo not found'));
    const onError = vi.fn();
    render(<AvatarEditor kind="user" person={{ id: 2, avatar_photo: 'abc.jpg' }} name="J" onError={onError} />);
    fireEvent.click(screen.getByRole('button', { name: /change avatar/i }));
    expect(screen.getByRole('menuitem', { name: /replace photo/i })).toBeTruthy();
    fireEvent.click(screen.getByRole('menuitem', { name: /remove photo/i }));
    await waitFor(() => expect(onError).toHaveBeenCalledWith('Photo not found'));
  });

  it('hides Remove photo when there is no photo', () => {
    authState.user = { is_system_admin: true, permissions: [] };
    render(<AvatarEditor kind="user" person={{ id: 2 }} name="J" />);
    fireEvent.click(screen.getByRole('button', { name: /change avatar/i }));
    expect(screen.getByRole('menuitem', { name: /upload photo/i })).toBeTruthy();
    expect(screen.queryByRole('menuitem', { name: /remove photo/i })).toBeNull();
  });
});
