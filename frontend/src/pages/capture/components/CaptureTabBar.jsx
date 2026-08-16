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
// Bottom tab bar. Overview/Schedule deep-link into the existing admin
// surface; Record is this page; More opens a small menu (patient switcher +
// link back to the full app).
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  CalendarIcon, CheckIcon, DashboardIcon, MoreHorizontalIcon, PlusSquareIcon,
} from '../../../components/Icons';

export default function CaptureTabBar({ patients, selectedPatient, onSelectPatient }) {
  const [moreOpen, setMoreOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    if (!moreOpen) return undefined;
    const close = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMoreOpen(false);
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [moreOpen]);

  return (
    <>
      {moreOpen && (
        <div className="vc-more-menu" ref={menuRef} role="menu">
          <span className="vc-more-heading vc-label">Patient</span>
          {patients.map((p) => (
            <button
              key={p.id}
              type="button"
              role="menuitem"
              className={`vc-more-item ${p.id === selectedPatient?.id ? 'selected' : ''}`}
              onClick={() => { onSelectPatient(p); setMoreOpen(false); }}
            >
              {p.id === selectedPatient?.id && <CheckIcon size={16} />}
              {p.first_name} {p.last_name}
            </button>
          ))}
          <span className="vc-more-heading vc-label">App</span>
          <Link className="vc-more-item" to="/care/vitals/history" role="menuitem"
                onClick={() => setMoreOpen(false)}>
            Vitals history
          </Link>
          <Link className="vc-more-item" to="/care" role="menuitem"
                onClick={() => setMoreOpen(false)}>
            Full care app
          </Link>
        </div>
      )}
      <nav className="vc-tabbar" aria-label="Capture sections">
        <Link className="vc-tab" to="/care">
          <DashboardIcon size={20} />
          <span className="vc-label">Overview</span>
        </Link>
        <Link className="vc-tab" to="/care/schedule">
          <CalendarIcon size={20} />
          <span className="vc-label">Schedule</span>
        </Link>
        <span className="vc-tab active" aria-current="page">
          <PlusSquareIcon size={20} />
          <span className="vc-label">Record</span>
        </span>
        <button type="button" className="vc-tab" aria-expanded={moreOpen}
                onClick={() => setMoreOpen((v) => !v)}>
          <MoreHorizontalIcon size={20} />
          <span className="vc-label">More</span>
        </button>
      </nav>
    </>
  );
}
