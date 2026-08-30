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
// Frame shared by every care-profile section page: the crumb back to the hub,
// the profile's name as an eyebrow, the section title, and the page's own
// status/notice slots. Keeps each section file to its actual content.
import { Link } from 'react-router-dom';
import AdminV2Layout from '../AdminV2Layout';
import { ChevronLeftIcon } from '../../../components/Icons';
import { CfgBadge } from '../settings/CfgSection';
import { fullName } from './careProfileFormat';
import '../../../components/vc/entity-card.css';
import '../AdminV2.css';
import './care-profile.css';

// STATUS_META tones (careProfileSections.js) → cfg-badge tones; 'muted' stays
// the neutral default.
const BADGE_TONE = { success: 'ok', warning: 'warn', danger: 'alert' };

export default function CareProfileSection({
  patientId, patient, title, description, status, loading, error, notice, children,
}) {
  return (
    <AdminV2Layout>
      <div className="admin-v2-page">
        <div className="cfg">
          <div className="cfg-crumb">
            <Link to={`/care/configuration/patients/${patientId}`} className="cfg-back">
              <ChevronLeftIcon size={14} />
              {patient ? fullName(patient) : 'Care profile'}
            </Link>
          </div>

          <div className="cfg-pagehead">
            <div className="cfg-pagehead-text">
              <span className="cfg-eyebrow">Care profile</span>
              <h1 className="cfg-h1">{title}</h1>
              {description && <p className="cfg-pagehead-desc">{description}</p>}
            </div>
            {status && <CfgBadge tone={BADGE_TONE[status.tone]}>{status.label}</CfgBadge>}
          </div>

          {error && <p className="em-error" role="alert">{error}</p>}
          {notice && <p className="em-success" role="status">{notice}</p>}

          {loading ? <p className="cfg-loading">Loading…</p> : children}
        </div>
      </div>
    </AdminV2Layout>
  );
}
