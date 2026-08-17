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
import React, { useState, useEffect } from 'react';
import { SettingsIcon, BrandMarkIcon } from '../Icons';

function Clock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  const pad = (n) => String(n).padStart(2, '0');
  const time = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
  const date = now.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  return (
    <div className="ld-clock">
      <div className="ld-clock-time">{time}</div>
      <div className="ld-clock-date">{date}</div>
    </div>
  );
}

/* Live dashboard top bar. Desktop: brand · patient chip · page label · icon
 * actions · clock. Mobile: brand + hamburger (the overlay menu itself stays
 * in Dashboard.jsx-provided `actions` and renders below).
 *
 * `actions` comes from buildTopBarActions (topBarActions.jsx). */
export default function TopBar({
  isMobile,
  isAlarmBlinking,
  isAlarmActive,
  patientName,
  onBrandClick,
  onPatientClick,
  actions,
  settingsActive,
  onSettingsClick,
  isMobileMenuOpen,
  onToggleMobileMenu,
}) {
  const cls = `header-section ld-topbar${isAlarmBlinking ? ' alarm-blink' : ''}${isAlarmActive ? ' alarm-active' : ''}`;

  if (isMobile) {
    return (
      <div className={cls}>
        <button type="button" className="ld-brand" onClick={onBrandClick}>
          <span className="ld-brand-mark" aria-hidden="true"><BrandMarkIcon size={28} /></span>
          <span className="ld-brand-name">Smart Home Health</span>
        </button>
        <button
          className="mobile-menu-button"
          onClick={onToggleMobileMenu}
          aria-label="Menu"
        >
          <div className={`hamburger ${isMobileMenuOpen ? 'open' : ''}`}>
            <span></span>
            <span></span>
            <span></span>
          </div>
        </button>
      </div>
    );
  }

  return (
    <div className={cls}>
      <button type="button" className="ld-brand" onClick={onBrandClick}>
        <span className="ld-brand-mark" aria-hidden="true"><BrandMarkIcon size={30} /></span>
        <span className="ld-brand-name">Smart Home Health</span>
      </button>

      <button type="button" className="ld-patient" onClick={onPatientClick} title="Switch patient">
        <span className="ld-topbar-caption">Patient</span>
        <span className="ld-patient-name">{patientName || 'Select patient'}</span>
      </button>

      <div className="ld-page-label">
        <span className="ld-topbar-caption">Page</span>
        <span>Live Monitor</span>
      </div>

      <div className="ld-topbar-spacer" />

      <div className="ld-actions">
        {actions.map(a => (
          <button
            key={a.key}
            type="button"
            className={`menu-button ld-action${a.active ? ' active' : ''}`}
            onClick={a.onClick}
            aria-label={a.label}
            title={a.label}
          >
            {a.icon}
            {a.badge > 0 && <div className="badge">{a.badge}</div>}
          </button>
        ))}
        <span className="ld-actions-divider" aria-hidden="true" />
        <button
          type="button"
          className={`menu-button ld-action${settingsActive ? ' active' : ''}`}
          onClick={onSettingsClick}
          aria-label="Settings"
          title="Settings"
        >
          <SettingsIcon />
        </button>
      </div>

      <Clock />
    </div>
  );
}
