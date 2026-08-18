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
// THE segmented control for the vc surfaces: one row of mutually exclusive
// options where seeing all the choices at once matters more than saving space
// (location, intake type, wetness, stool amount, Bristol 1-7, urine
// appearance, feed route). A native <select> hides the options behind a tap,
// which is the wrong trade during a care task.
//
//   <SegmentedControl
//     label="Location" required
//     options={[{ value: 'restroom', label: 'Restroom' }, ...]}
//     value={location} onChange={setLocation}
//   />
//
// Keyboard: it is a radiogroup with roving tabindex, so Tab reaches the
// selected option and the arrow keys move between them.
import { useRef } from 'react';
import './segmented-control.css';

export default function SegmentedControl({
  options = [],       // [{ value, label, icon?, title? }]
  value,
  onChange,
  label,              // optional section label rendered above
  required = false,
  optional = false,
  hint,               // small text to the right of the label
  columns,            // force an N-column grid instead of one flex row
  size = 'md',        // 'md' | 'sm' (sm = the compact Bristol 1-7 row)
  inline = false,     // put `hint` beside the track instead of in the label
  disabled = false,
  ariaLabel,
}) {
  const ref = useRef(null);

  const move = (event, index) => {
    const keys = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };
    const step = keys[event.key];
    if (!step) return;
    event.preventDefault();
    const enabled = options.filter((o) => !o.disabled);
    if (!enabled.length) return;
    const current = enabled.findIndex((o) => o.value === options[index].value);
    const next = enabled[(current + step + enabled.length) % enabled.length];
    onChange?.(next.value);
    // Follow focus so the arrow keys keep working from the new option.
    const node = ref.current?.querySelector(`[data-value="${CSS.escape(String(next.value))}"]`);
    node?.focus();
  };

  return (
    <div className={`vseg-field ${size}`}>
      {label && (
        <div className="vseg-label">
          <span>
            {label}
            {required && <span className="vseg-req">Required</span>}
            {optional && <span className="vseg-optional">Optional</span>}
          </span>
          {hint && !inline && <span className="vseg-hint">{hint}</span>}
        </div>
      )}
      <div className={inline ? 'vseg-inline' : undefined}>
      <div
        ref={ref}
        className={`vseg ${columns ? 'grid' : ''} ${disabled ? 'disabled' : ''}`}
        style={columns ? { gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` } : undefined}
        role="radiogroup"
        aria-label={ariaLabel || label}
      >
        {options.map((option, index) => {
          const selected = option.value === value;
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={selected}
              data-value={option.value}
              title={option.title}
              disabled={disabled || option.disabled}
              tabIndex={selected ? 0 : -1}
              className={`vseg-btn ${selected ? 'on' : ''} ${option.icon ? 'has-icon' : ''}`}
              onClick={() => onChange?.(option.value)}
              onKeyDown={(e) => move(e, index)}
            >
              {option.icon && <span className="vseg-icon">{option.icon}</span>}
              <span className="vseg-text">{option.label}</span>
            </button>
          );
        })}
      </div>
      {hint && inline && <span className="vseg-hint">{hint}</span>}
      </div>
    </div>
  );
}
