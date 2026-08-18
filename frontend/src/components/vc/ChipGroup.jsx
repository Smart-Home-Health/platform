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
// Compact chips for optional, low-commitment choices: meal context, the
// concern flags, and the one-tap prefill rows. Distinct from
// SegmentedControl, which is for a required pick among a fixed set.
//
// `mode="action"` chips do not hold state at all — they fire onSelect and let
// the parent prefill a form (the "Tap to prefill" rows in the mockups).
import './chip-group.css';

export default function ChipGroup({
  options = [],         // [{ value, label, icon?, sublabel? }]
  value,                // string (single) | array (multi) | unused for action
  onChange,
  onSelect,             // action mode: fired with the option
  mode = 'single',      // 'single' | 'multi' | 'action'
  label,
  optional = false,
  hint,
  tone = 'accent',      // 'accent' | 'due' — due is for the concern flags
  columns,
  scroll = false,       // keep on one line and scroll sideways instead of wrapping
}) {
  const selectedValues = mode === 'multi'
    ? (Array.isArray(value) ? value : [])
    : [value];

  const toggle = (option) => {
    if (mode === 'action') { onSelect?.(option); return; }
    if (mode === 'multi') {
      const next = selectedValues.includes(option.value)
        ? selectedValues.filter((v) => v !== option.value)
        : [...selectedValues, option.value];
      onChange?.(next);
      return;
    }
    // Single-select chips are clearable: tapping the active one turns it off,
    // since these back optional fields.
    onChange?.(value === option.value ? null : option.value);
  };

  if (!options.length) return null;

  return (
    <div className="vchips-field">
      {label && (
        <div className="vchips-label">
          <span>
            {label}
            {optional && <span className="vchips-optional">Optional</span>}
          </span>
          {hint && <span className="vchips-hint">{hint}</span>}
        </div>
      )}
      <div
        className={`vchips ${columns ? 'grid' : ''} ${scroll ? 'scroll' : ''} tone-${tone} ${mode === 'action' ? 'action' : ''}`}
        style={columns ? { gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` } : undefined}
        role={mode === 'action' ? undefined : 'group'}
        aria-label={label}
      >
        {options.map((option) => {
          const on = mode !== 'action' && selectedValues.includes(option.value);
          return (
            <button
              key={option.value}
              type="button"
              className={`vchip ${on ? 'on' : ''}`}
              aria-pressed={mode === 'action' ? undefined : on}
              onClick={() => toggle(option)}
            >
              {option.icon && <span className="vchip-icon">{option.icon}</span>}
              <span className="vchip-text">{option.label}</span>
              {option.sublabel && <span className="vchip-sub">{option.sublabel}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
