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
// Section primitives for the /care/configuration pages — the vc replacement
// for the shadcn Card / CardHeader / CardContent / CardFooter stack. Geometry
// lives in settings-page.css; fields come from the shared em-* vocabulary
// (components/vc/EntityModal.jsx exports EmField / EmRow / EmSelect).
import { CheckIcon } from '../../../components/Icons';
import './settings-page.css';

// One settings section: hairline card, mono header, optional saved flash and
// footer actions. `icon` is an SVG element from components/Icons.
export function CfgSection({ icon, title, subtitle, saved = false, aside, actions, children }) {
  return (
    <section className="cfg-card">
      <header className="cfg-head">
        {icon && <span className="cfg-head-icon" aria-hidden="true">{icon}</span>}
        <div className="cfg-head-text">
          <h2 className="cfg-title">{title}</h2>
          {subtitle && <p className="cfg-sub">{subtitle}</p>}
        </div>
        {saved && (
          <span className="cfg-saved" role="status">
            <CheckIcon size={13} />
            Saved
          </span>
        )}
        {aside && <div className="cfg-head-aside">{aside}</div>}
      </header>
      <div className="cfg-body">{children}</div>
      {actions && <footer className="cfg-foot">{actions}</footer>}
    </section>
  );
}

// A read-only fact tile (mode, address, expiry…).
export function CfgStat({ label, value, hint }) {
  return (
    <div className="cfg-stat">
      <span className="cfg-stat-label">{label}</span>
      <span className="cfg-stat-value">{value}</span>
      {hint && <span className="cfg-stat-hint">{hint}</span>}
    </div>
  );
}

// Status pill. `tone` is 'ok' | 'live' | undefined (neutral); the dot carries
// the state alongside the word, never a text glyph.
export function CfgBadge({ tone, children }) {
  return (
    <span className={`cfg-badge${tone ? ` ${tone}` : ''}`}>
      <span className="cfg-badge-dot" aria-hidden="true" />
      {children}
    </span>
  );
}

// A labelled group inside a section — divided from its neighbours by a
// hairline rather than nested in a card of its own.
export function CfgGroup({ title, hint, children }) {
  return (
    <div className="cfg-group">
      {(title || hint) && (
        <div className="cfg-group-head">
          {title && <h3 className="cfg-group-title">{title}</h3>}
          {hint && <p className="cfg-group-hint">{hint}</p>}
        </div>
      )}
      {children}
    </div>
  );
}

// Auto-fitting field grid: as many columns as fit, so a four-field threshold
// row stays on one line on a tablet instead of stacking. `narrow` widens the
// minimum track for fields with long labels or hints.
export function CfgFields({ narrow = false, children }) {
  return <div className={`cfg-fields${narrow ? ' narrow' : ''}`}>{children}</div>;
}
