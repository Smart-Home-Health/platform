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
// One shipment on the Deliveries list, from the mockup:
//
//   #78711852                              (SHIPPED)
//   PEDIATRIC HOME SERVICE
//   EXPECTED     TRACKING        ITEMS
//   AUG 21       1Z84…392        14
//   ●───────●───────◉───────○
//   BUILT   ORDERED  SHIPPED  RECEIVED
//   TRACK PACKAGE                         ›
//
// The three facts under the heading change with where the shipment is, since
// a draft has no tracking to show and a finished one has no date to wait for.
import { useEffect, useRef, useState } from 'react';
import { MoreVerticalIcon, ChevronRightIcon } from '../Icons';
import { statusInfo, stepStates, needsAttention } from '../../lib/shipmentStatus';
import './shipment-card.css';

/** The progress rail. Decorative — the status pill already states the state. */
function StepRail({ shipment }) {
  const steps = stepStates(shipment);
  return (
    <div className="sc-rail" aria-hidden="true">
      {steps.map((step, i) => (
        <div key={step.label} className={`sc-step is-${step.state}`}>
          {i > 0 && <span className="sc-rail-line" />}
          <span className="sc-rail-node" />
          <span className="sc-step-label">{step.label}</span>
        </div>
      ))}
    </div>
  );
}

export default function ShipmentCard({
  shipment,
  supplierName,
  details = [],   // [{ label, value }] — three at most, the mockup's grid
  action,         // { label, onClick } — the footer row
  menu = [],      // [{ label, onClick, danger? }]
  showRail = true,
  onOpen,
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);
  const info = statusInfo(shipment.status);
  const attention = needsAttention(shipment);

  useEffect(() => {
    if (!menuOpen) return undefined;
    const close = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [menuOpen]);

  const heading = shipment.order_number || shipment.po_number || `#${shipment.id}`;

  return (
    <article className={`sc-card tone-${info.tone} ${attention ? 'needs-attention' : ''}`}>
      <header className="sc-head">
        <div className="sc-head-text">
          <button type="button" className="sc-title" onClick={onOpen}>
            {heading}
          </button>
          {supplierName && <p className="sc-supplier">{supplierName}</p>}
        </div>
        <div className="sc-head-right">
          <span className={`sc-status tone-${info.tone}`}>{info.label}</span>
          {menu.length > 0 && (
            <div className="sc-menu-wrap" ref={menuRef}>
              <button type="button" className="sc-kebab" aria-label={`Actions for ${heading}`}
                      aria-haspopup="menu" aria-expanded={menuOpen}
                      onClick={() => setMenuOpen((v) => !v)}>
                <MoreVerticalIcon size={18} />
              </button>
              {menuOpen && (
                <div className="sc-menu" role="menu">
                  {menu.map((item) => (
                    <button key={item.label} type="button" role="menuitem"
                            className={`sc-menu-item ${item.danger ? 'danger' : ''}`}
                            onClick={() => { setMenuOpen(false); item.onClick(); }}>
                      {item.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </header>

      {details.length > 0 && (
        <dl className="sc-details">
          {details.map((d) => (
            <div key={d.label} className="sc-detail">
              <dt>{d.label}</dt>
              <dd>{d.value ?? '—'}</dd>
            </div>
          ))}
        </dl>
      )}

      {showRail && <StepRail shipment={shipment} />}

      {action && (
        <button type="button" className="sc-action" onClick={action.onClick}>
          <span>{action.label}</span>
          <ChevronRightIcon size={16} />
        </button>
      )}
    </article>
  );
}
