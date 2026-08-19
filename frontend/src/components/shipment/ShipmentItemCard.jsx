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
// One line on a shipment, from the mockup:
//
//   [1]  TRACH SUCTION CATHETER            ⋮
//        SKU 14FR-100                 [−] 30 [+]
//        CATEGORY AIRWAY
//        ─────────────────────
//        EXPECTED   RECEIVED
//        30         —
//
// The stepper edits the ordered quantity while the list is still being built.
// Once the shipment is placed the number stops being editable, because by
// then it is a claim about what the supplier sent rather than what we asked
// for -- that correction belongs to the receive step.
import { useEffect, useRef, useState } from 'react';
import { MoreVerticalIcon, PlusIcon, MinusIcon } from '../Icons';
import './shipment-card.css';

export default function ShipmentItemCard({
  index,
  item,
  editableQty = false,
  onQtyChange,
  menu = [],
  onOpen,
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

  const name = item.item_description || item.equipment_name || item.item_number || `Item ${item.id}`;
  const ordered = item.qty_ordered ?? 0;
  const received = item.qty_received ?? 0;
  const hasReceipts = (item.receipts || []).length > 0;

  const step = (delta) => onQtyChange?.(Math.max(0, ordered + delta));

  return (
    <article className="si-card">
      <span className="si-index" aria-hidden="true">{index}</span>

      <div className="si-body">
        <div className="si-head">
          <button type="button" className="si-name" onClick={onOpen} disabled={!onOpen}>
            {name}
          </button>
          {menu.length > 0 && (
            <div className="si-menu-wrap" ref={menuRef}>
              <button type="button" className="si-kebab" aria-label={`Actions for ${name}`}
                      aria-haspopup="menu" aria-expanded={menuOpen}
                      onClick={() => setMenuOpen((v) => !v)}>
                <MoreVerticalIcon size={16} />
              </button>
              {menuOpen && (
                <div className="si-menu" role="menu">
                  {menu.map((entry) => (
                    <button key={entry.label} type="button" role="menuitem"
                            className={`si-menu-item ${entry.danger ? 'danger' : ''}`}
                            onClick={() => { setMenuOpen(false); entry.onClick(); }}>
                      {entry.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <dl className="si-meta">
          {item.item_number && (
            <div><dt>SKU</dt><dd>{item.item_number}</dd></div>
          )}
          {item.manufacturer_name && (
            <div><dt>Maker</dt><dd>{item.manufacturer_name}</dd></div>
          )}
          {item.unit_of_measure && (
            <div><dt>Unit</dt><dd>{item.unit_of_measure}</dd></div>
          )}
        </dl>

        <div className="si-numbers">
          <div className="si-number">
            <span className="si-number-label">Expected</span>
            <span className="si-number-value">{ordered}</span>
          </div>
          <div className="si-number">
            <span className="si-number-label">Received</span>
            {/* An em dash means "nothing recorded yet", which is not the same
                claim as a recorded zero. */}
            <span className={`si-number-value ${received ? 'is-in' : ''}`}>
              {hasReceipts ? received : '—'}
            </span>
          </div>
          {item.qty_backordered > 0 && (
            <div className="si-number">
              <span className="si-number-label">To follow</span>
              <span className="si-number-value is-due">{item.qty_backordered}</span>
            </div>
          )}
        </div>
      </div>

      {editableQty && (
        <div className="si-stepper">
          <button type="button" onClick={() => step(-1)} disabled={ordered <= 0}
                  aria-label={`One fewer ${name}`}>
            <MinusIcon size={15} />
          </button>
          <input type="number" min="0" value={ordered}
                 aria-label={`Quantity of ${name}`}
                 onChange={(e) => onQtyChange?.(Math.max(0, parseInt(e.target.value, 10) || 0))} />
          <button type="button" onClick={() => step(1)} aria-label={`One more ${name}`}>
            <PlusIcon size={15} />
          </button>
        </div>
      )}
    </article>
  );
}
