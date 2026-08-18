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
// A collapsed section that keeps optional detail available without making
// every log walk past it: "Nutrition details", "Notes", "More urine details".
// Nothing is removed by collapsing — the fields are one tap away.
import { useId, useState } from 'react';
import { ChevronDownIcon } from '../Icons';
import './disclosure-row.css';

export default function DisclosureRow({
  label,
  optional = false,
  summary,              // one-line preview shown while collapsed
  defaultOpen = false,
  open: controlledOpen, // optional controlled mode
  onOpenChange,
  children,
}) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(defaultOpen);
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : uncontrolledOpen;
  const bodyId = useId();

  const toggle = () => {
    const next = !open;
    if (!isControlled) setUncontrolledOpen(next);
    onOpenChange?.(next);
  };

  return (
    <div className={`vdisc ${open ? 'open' : ''}`}>
      <button
        type="button"
        className="vdisc-head"
        aria-expanded={open}
        aria-controls={bodyId}
        onClick={toggle}
      >
        <span className="vdisc-label">
          {label}
          {optional && <span className="vdisc-optional">Optional</span>}
        </span>
        {summary && !open && <span className="vdisc-summary">{summary}</span>}
        <span className="vdisc-chevron" aria-hidden="true">
          <ChevronDownIcon size={18} />
        </span>
      </button>
      {open && <div className="vdisc-body" id={bodyId}>{children}</div>}
    </div>
  );
}
