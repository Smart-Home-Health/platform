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
// Live board Settings → Appearance: the shared theme / contrast picker in the
// st-* section chassis. Applies instantly; nothing to submit.
import AppearanceControls from '../vc/AppearanceControls';
import '../vc/entity-card.css';
import './settings-panel.css';

export default function AppearanceSettings() {
  return (
    <div className="st-form">
      <section className="st-section">
        <h3 className="st-section-title">Appearance</h3>
        <AppearanceControls />
        <p className="st-section-hint">The board and the care pages follow the same choice.</p>
      </section>
    </div>
  );
}
