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
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { fullName } from './careProfileFormat';
import '../AdminV2.css';
import './care-profile.css';

export default function CareProfileSection({
  patientId, patient, title, description, status, loading, error, notice, children,
}) {
  return (
    <AdminV2Layout>
      <div className="admin-v2-page">
        <div className="tw flex flex-col gap-6">
          <Link
            to={`/care/configuration/patients/${patientId}`}
            className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ChevronLeftIcon size={16} />
            {patient ? fullName(patient) : 'Care profile'}
          </Link>

          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex min-w-0 flex-col gap-1">
              <span className="cp-eyebrow">Care profile</span>
              <h1 className="cp-title">{title}</h1>
              {description && (
                <p className="max-w-prose text-sm text-muted-foreground">{description}</p>
              )}
            </div>
            {status && <Badge variant={status.tone}>{status.label}</Badge>}
          </div>

          {error && <Alert variant="destructive" role="alert">{error}</Alert>}
          {notice && <Alert variant="success" role="status">{notice}</Alert>}

          {loading ? <div className="admin-v2-loading">Loading…</div> : children}
        </div>
      </div>
    </AdminV2Layout>
  );
}
