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
// The live dashboard's phone navigation, built to mirror the admin drawer:
// its own header, labelled groups, one row per destination.
//
// It renders from the same action list the top bar uses (buildTopBarActions),
// so a section can't appear in one and not the other — which is exactly what
// happened when Capture Vitals had to be added to a hand-written copy of this
// list separately.
import { NAV_GROUPS } from './topBarActions';
import { SettingsIcon, XIcon } from '../Icons';
import './dash-nav.css';

export default function DashboardNavDrawer({
  open,
  onClose,
  actions = [],
  patientName,
  onSettings,
}) {
  if (!open) return null;

  const groups = NAV_GROUPS
    .map(g => ({ ...g, items: actions.filter(a => a.group === g.key) }))
    .filter(g => g.items.length > 0);

  const run = (fn) => () => { onClose(); if (fn) fn(); };

  const row = (item) => (
    <button
      key={item.key}
      type="button"
      className={`dn-item${item.active ? ' active' : ''}`}
      onClick={run(item.onClick)}
    >
      <span className="dn-item-icon" aria-hidden="true">{item.icon}</span>
      <span className="dn-item-label">{item.label}</span>
      {item.badge > 0 && <span className="dn-item-badge">{item.badge > 99 ? '99+' : item.badge}</span>}
    </button>
  );

  return (
    <div className="dn-overlay" onClick={onClose} role="presentation">
      <nav
        className="dn-drawer"
        onClick={(e) => e.stopPropagation()}
        aria-label="Live monitor navigation"
      >
        <div className="dn-head">
          <button type="button" className="dn-close" onClick={onClose} aria-label="Close navigation">
            <XIcon size={18} />
            <span>Close</span>
          </button>
          <span className="dn-head-title">
            SHH <span className="dn-head-sep">/</span> Live monitor
          </span>
        </div>

        {patientName && (
          <div className="dn-patient">
            <span className="dn-patient-label">Patient</span>
            <span className="dn-patient-name">{patientName}</span>
          </div>
        )}

        <div className="dn-groups">
          {groups.map((group) => (
            <div key={group.key} className="dn-group">
              <span className="dn-group-label">{group.label}</span>
              <div className="dn-group-items">{group.items.map(row)}</div>
            </div>
          ))}

          {onSettings && (
            <div className="dn-group">
              <span className="dn-group-label">Account</span>
              <div className="dn-group-items">
                {row({ key: 'settings', label: 'Settings', icon: <SettingsIcon />, onClick: onSettings, badge: 0 })}
              </div>
            </div>
          )}
        </div>
      </nav>
    </div>
  );
}
