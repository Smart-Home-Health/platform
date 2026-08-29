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
// THE avatar for a person (user, patient, provider). Renders, in order of
// preference: their uploaded photo, else the generated identicon for their
// seed, else initials — the last only when there is no id to hash. The name
// always sits beside it in the UI, so pass `decorative` there; otherwise it
// is an image labelled with the name.
import { createElement } from 'react';
import { useAuthedImageUrl } from '../../hooks/useAuthedImageUrl';
import { avatarPhotoUrl } from '../../services/avatars';
import { IDENTICON_VIEWBOX, identiconElements } from '../../utils/identicon';
import { avatarSeed, initialsOf } from '../../utils/person';
import './person-avatar.css';

export default function PersonAvatar({
  kind,               // 'user' | 'patient' | 'provider'
  id,                 // record id — seeds "<kind>:<id>" when no override
  seed = null,        // avatar_seed from the API (set by "shuffle design")
  photo = null,       // avatar_photo filename from the API
  name = '',          // for the label and the initials fallback
  size = 36,          // px
  decorative = false, // true when the name is rendered right next to it
  className = '',
}) {
  const effectiveSeed = avatarSeed(kind, id, seed);
  const { src } = useAuthedImageUrl(avatarPhotoUrl(kind, id, photo));
  const a11y = decorative
    ? { 'aria-hidden': true }
    : { role: 'img', 'aria-label': name || 'Avatar' };

  return (
    <span className={`pa ${className}`.trim()} style={{ '--pa-size': `${size}px` }} {...a11y}>
      {effectiveSeed ? (
        <svg className="pa-svg" viewBox={IDENTICON_VIEWBOX} focusable="false" aria-hidden="true">
          {identiconElements(effectiveSeed).map(({ tag, attrs }, i) => createElement(tag, { key: i, ...attrs }))}
        </svg>
      ) : (
        <span className="pa-initials">{initialsOf(name)}</span>
      )}
      {src && <img className="pa-photo" src={src} alt="" draggable="false" />}
    </span>
  );
}
