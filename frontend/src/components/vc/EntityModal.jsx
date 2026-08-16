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
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { XIcon, ChevronDownIcon } from '../Icons';
import './entity-card.css';

export default function EntityModal({ open, onOpenChange, title, wide = false, children }) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="em-overlay" />
        <DialogPrimitive.Content
          className={`em-panel ${wide ? 'wide' : ''}`}
          aria-describedby={undefined}
        >
          <div className="em-head">
            <DialogPrimitive.Title className="em-title">{title}</DialogPrimitive.Title>
            <DialogPrimitive.Close className="em-close" aria-label="Close">
              <XIcon size={18} />
            </DialogPrimitive.Close>
          </div>
          {children}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

export function EmField({ label, required = false, optional = false, htmlFor, children }) {
  return (
    <div className="em-field">
      <label className="em-label" htmlFor={htmlFor}>
        {label}
        {required && <span className="em-req">Required</span>}
        {optional && <span className="em-optional">Optional</span>}
      </label>
      {children}
    </div>
  );
}

export function EmRow({ children }) {
  return <div className="em-row">{children}</div>;
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
