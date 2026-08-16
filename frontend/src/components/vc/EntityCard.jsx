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
// THE standard entity card for config pages (providers, businesses,
// connections, diagnoses, …), from the providers mockup:
//
//   [avatar]  NAME                          ⋮
//             (badge) (badge)          TAG
//   ───────────────────────────────────────
//   icon | Label            │  [quick] [quick]
//        | VALUE            │
//   icon | Label            │
//        | VALUE            │
//
// All slots optional. Colors come from the vc tokens; keep new usages to
// the props here rather than custom card markup.
import { useEffect, useRef, useState } from 'react';
import { MoreVerticalIcon } from '../Icons';
import './entity-card.css';

export default function EntityCard({
  initials,          // avatar initials (string) — or pass `icon` instead
  icon,              // avatar icon node (e.g. <PlugIcon/>)
  title,
  badges = [],       // strings -> outline pills under the title
  tag,               // { label, tone?: 'accent'|'complete'|'due'|'idle' }
  inactive = false,  // dims the card
  details = [],      // [{ icon, label, value }]
  quickActions = [], // [{ icon, label, href?, onClick?, external? }] -> accent tiles
  menu = [],         // [{ label, onClick, danger? }] -> kebab menu
  children,          // optional extra content below the detail grid
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    if (!menuOpen) return undefined;
    const close = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [menuOpen]);

  return (
    <article className={`ec-card ${inactive ? 'inactive' : ''}`}>
      <header className="ec-head">
        <span className="ec-avatar" aria-hidden="true">
          {icon || initials}
        </span>
        <div className="ec-head-text">
          <h3 className="ec-title">{title}</h3>
          {(badges.length > 0 || tag) && (
            <div className="ec-badges">
              {badges.map((b) => <span key={b} className="ec-badge">{b}</span>)}
              {tag && (
                <span className={`ec-tag tone-${tag.tone || 'accent'}`}>{tag.label}</span>
              )}
            </div>
          )}
        </div>
        {menu.length > 0 && (
          <div className="ec-menu-wrap" ref={menuRef}>
            <button type="button" className="ec-kebab" aria-label={`Actions for ${title}`}
                    aria-haspopup="menu" aria-expanded={menuOpen}
                    onClick={() => setMenuOpen((v) => !v)}>
              <MoreVerticalIcon size={18} />
            </button>
            {menuOpen && (
              <div className="ec-menu" role="menu">
                {menu.map((item) => (
                  <button key={item.label} type="button" role="menuitem"
                          className={`ec-menu-item ${item.danger ? 'danger' : ''}`}
                          onClick={() => { setMenuOpen(false); item.onClick(); }}>
                    {item.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </header>

      {(details.length > 0 || quickActions.length > 0) && (
        <div className="ec-body">
          <div className="ec-details">
            {details.map((d) => (
              <div key={d.label} className="ec-detail">
                {d.icon && <span className="ec-detail-icon" aria-hidden="true">{d.icon}</span>}
                <span className="ec-detail-text">
                  <span className="ec-detail-label">{d.label}</span>
                  <span className="ec-detail-value">{d.value || d.value === 0 ? d.value : '—'}</span>
                </span>
              </div>
            ))}
          </div>
          {quickActions.length > 0 && (
            <div className="ec-quick">
              {quickActions.map((a) => {
                const inner = a.icon;
                return a.href ? (
                  <a key={a.label} className="ec-quick-btn" href={a.href}
                     aria-label={a.label} title={a.label}
                     {...(a.external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>{inner}</a>
                ) : (
                  <button key={a.label} type="button" className="ec-quick-btn"
                          aria-label={a.label} title={a.label}
                          onClick={a.onClick}>{inner}</button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {children}
    </article>
  );
}
