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
// A person's avatar with the administrator's controls folded into a corner
// button: shuffle the generated design, upload/replace a photo, remove it.
// Self-contained — keeps the latest AvatarState itself so the page it sits in
// need not plumb setters; `onChange` is for refreshing shared state (the
// sidebar's patient list) and `onError`/`onNotice` feed the page's alerts.
import { useEffect, useRef, useState } from 'react';
import PersonAvatar from '../../../components/vc/PersonAvatar';
import { CameraIcon, EditIcon, RefreshIcon, TrashIcon } from '../../../components/Icons';
import { useAuth } from '../../../contexts/AuthContext';
import { avatarService } from '../../../services/avatars';
import { cropToSquareJpeg } from '../../../lib/imageCrop';
import './avatar-editor.css';

const PERMISSION = { user: 'users.update', patient: 'patients.update' };

export default function AvatarEditor({
  kind,              // 'user' | 'patient'
  person,            // { id, avatar_seed, avatar_photo }
  name = '',
  size = 64,
  onChange,          // (avatarState) => void
  onError,           // (message) => void
  onNotice,          // (message) => void
}) {
  const { user: me } = useAuth();
  const canEdit = Boolean(me && (me.is_system_admin || me.permissions?.includes(PERMISSION[kind])));
  const [state, setState] = useState({ avatar_seed: person?.avatar_seed ?? null, avatar_photo: person?.avatar_photo ?? null });
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const menuRef = useRef(null);
  const fileRef = useRef(null);

  // Follow the record when it (re)loads; local edits win in between.
  useEffect(() => {
    setState({ avatar_seed: person?.avatar_seed ?? null, avatar_photo: person?.avatar_photo ?? null });
  }, [person?.id, person?.avatar_seed, person?.avatar_photo]);

  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setOpen(false);
    };
    const esc = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);

  const apply = (next, notice) => {
    setState(next);
    onChange?.(next);
    if (notice) onNotice?.(notice);
  };

  const run = async (work) => {
    setBusy(true);
    onError?.('');
    try {
      await work();
    } catch (e) {
      onError?.(e.message || 'Something went wrong');
    } finally {
      setBusy(false);
      setOpen(false);
    }
  };

  const shuffle = () => run(async () => {
    apply(await avatarService.shuffle(kind, person.id), 'New design');
  });

  const remove = () => run(async () => {
    apply(await avatarService.removePhoto(kind, person.id), 'Photo removed');
  });

  const chosen = (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    run(async () => {
      const square = await cropToSquareJpeg(file);
      apply(await avatarService.uploadPhoto(kind, person.id, square), 'Photo updated');
    });
  };

  const hasPhoto = Boolean(state.avatar_photo);

  return (
    <div className="ave" ref={menuRef}>
      <PersonAvatar
        kind={kind}
        id={person?.id}
        seed={state.avatar_seed}
        photo={state.avatar_photo}
        name={name}
        size={size}
        decorative
      />
      {canEdit && person?.id != null && (
        <>
          <button
            type="button"
            className="ave-edit"
            aria-label={`Change avatar for ${name || 'this person'}`}
            aria-haspopup="menu"
            aria-expanded={open}
            disabled={busy}
            onClick={() => setOpen((v) => !v)}
          >
            <EditIcon size={13} />
          </button>
          {open && (
            <div className="ave-menu" role="menu">
              <button type="button" role="menuitem" className="ave-item" onClick={shuffle} disabled={busy}>
                <RefreshIcon size={15} /> Shuffle design
              </button>
              <button type="button" role="menuitem" className="ave-item" onClick={() => fileRef.current?.click()} disabled={busy}>
                <CameraIcon size={15} /> {hasPhoto ? 'Replace photo' : 'Upload photo'}
              </button>
              {hasPhoto && (
                <button type="button" role="menuitem" className="ave-item danger" onClick={remove} disabled={busy}>
                  <TrashIcon size={15} /> Remove photo
                </button>
              )}
            </div>
          )}
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            style={{ display: 'none' }}
            onChange={chosen}
            data-testid="ave-file"
          />
        </>
      )}
    </div>
  );
}
