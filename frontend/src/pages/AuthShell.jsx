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
import { Link } from 'react-router-dom';
import { BrandMarkIcon } from '../components/Icons';
import './auth.css';

/* Shared frame for the auth surfaces: brand bar + centered content column. */
export default function AuthShell({ children }) {
  return (
    <div className="vc-auth">
      <header className="au-brand">
        <Link to="/" className="au-brand-left">
          <span className="au-brand-mark" aria-hidden="true"><BrandMarkIcon size={34} /></span>
          <span>
            <span className="au-brand-name">Smart Home Health</span>
            <span className="au-brand-sub">Care System</span>
          </span>
        </Link>
        <span className="au-online"><span className="au-online-dot" aria-hidden="true" />System online</span>
      </header>
      <main className="au-main">{children}</main>
    </div>
  );
}
