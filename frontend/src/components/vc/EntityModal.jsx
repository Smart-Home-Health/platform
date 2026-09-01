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
// THE standard add/edit dialog for entity pages, pairing with EntityCard.
// Bare Radix Dialog (focus trap + Escape) with vc chrome; form fields are
// native inputs/selects/textareas carrying the em-input class, wrapped in
// EmField/EmRow. Required fields get the amber REQUIRED tag (never a red
// asterisk — red stays clinical).
//
//   <EntityModal open={open} onOpenChange={...} title="Edit provider">
//     <form className="em-form" onSubmit={...}>
//       {error && <div className="em-error">{error}</div>}
//       <EmRow>
//         <EmField label="First name" required htmlFor="p-first">
//           <input id="p-first" className="em-input" ... />
//         </EmField>
//         ...
//       </EmRow>
//       <EmField label="Type"><EmSelect ...>{options}</EmSelect></EmField>
//       <label className="em-check-row">
//         <input type="checkbox" className="em-check" ... />
//         <span className="em-check-label">…</span>
//       </label>
//       <div className="em-footer">
//         <button type="button" className="em-cancel" ...>Cancel</button>
//         <button type="submit" className="em-submit" ...>Save</button>
//       </div>
//     </form>
//   </EntityModal>
import { useEffect, useRef, useState } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { XIcon, ChevronDownIcon } from '../Icons';
import './entity-card.css';

// `hideClose` removes the X for hard-gate dialogs (a patient MUST be picked);
// pair it with an onOpenChange that ignores dismissal.
export default function EntityModal({ open, onOpenChange, title, wide = false, hideClose = false, children }) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="em-overlay" />
        <DialogPrimitive.Content
          className={`em-panel ${wide ? 'wide' : ''}`}
          aria-describedby={undefined}
          // Taps on the in-app on-screen keyboard are input, not a request
          // to dismiss — without this, Radix treats them as outside
          // interactions and closes the dialog under the caregiver's finger.
          onPointerDownOutside={(e) => {
            if (e.target?.closest?.('.vkb-root')) e.preventDefault();
          }}
          onInteractOutside={(e) => {
            if (e.target?.closest?.('.vkb-root')) e.preventDefault();
          }}
          // With a multiselect popover open inside the panel, the first
          // Escape belongs to the popover (its own listener closes it) —
          // not to the dialog.
          onEscapeKeyDown={(e) => {
            if (document.querySelector('.em-multi-pop')) e.preventDefault();
          }}
        >
          <div className="em-head">
            <DialogPrimitive.Title className="em-title">{title}</DialogPrimitive.Title>
            {!hideClose && (
              <DialogPrimitive.Close className="em-close" aria-label="Close">
                <XIcon size={18} />
              </DialogPrimitive.Close>
            )}
          </div>
          {children}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

export function EmField({ label, required = false, optional = false, htmlFor, hint, children }) {
  return (
    <div className="em-field">
      <label className="em-label" htmlFor={htmlFor}>
        {label}
        {required && <span className="em-req">Required</span>}
        {optional && <span className="em-optional">Optional</span>}
      </label>
      {children}
      {hint && <p className="em-hint">{hint}</p>}
    </div>
  );
}

export function EmRow({ children }) {
  return <div className="em-row">{children}</div>;
}

// Multi-select: an em-input-shaped trigger that opens a checkbox popover, so
// a dozen options don't eat the whole form. `options` is [{ value, label }],
// `values` the selected value array, `onToggle(value)` flips one.
export function EmMultiSelect({ id, values = [], options = [], onToggle, placeholder = 'Select…' }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onDocDown = (e) => {
      if (!rootRef.current?.contains(e.target)) setOpen(false);
    };
    // Capture phase + stopPropagation: the first Escape closes just the
    // popover, not the EntityModal hosting it (Radix listens on bubble).
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setOpen(false);
      }
    };
    document.addEventListener('pointerdown', onDocDown);
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('pointerdown', onDocDown);
      document.removeEventListener('keydown', onKey, true);
    };
  }, [open]);

  const summary = options
    .filter((o) => values.includes(o.value))
    .map((o) => o.label)
    .join(', ');

  return (
    <div className="em-multi" ref={rootRef}>
      <button
        type="button"
        id={id}
        className="em-input em-multi-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span className={summary ? undefined : 'em-multi-placeholder'}>
          {summary || placeholder}
        </span>
        <ChevronDownIcon size={16} />
      </button>
      {open && (
        <div className="em-multi-pop">
          {options.map((o) => (
            <label key={o.value} className="em-check-row">
              <input
                type="checkbox"
                className="em-check"
                checked={values.includes(o.value)}
                onChange={() => onToggle(o.value)}
              />
              <span className="em-check-label">{o.label}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

// Native select with the vc chevron; forwards all props to <select>.
export function EmSelect({ children, ...props }) {
  return (
    <span className="em-select-wrap">
      <select className="em-input" {...props}>{children}</select>
      <ChevronDownIcon size={16} />
    </span>
  );
}
