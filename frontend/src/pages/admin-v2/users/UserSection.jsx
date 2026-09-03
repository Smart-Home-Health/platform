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
// Frame shared by every user sub-page: the crumb back to the user, the tab bar,
// and the page's status slots. Keeps each section file to its own content.
import { Link } from 'react-router-dom';
import AdminV2Layout from '../AdminV2Layout';
import { ChevronLeftIcon } from '../../../components/Icons';
import { displayName } from './userDetail';
import UserTabs from './UserTabs';
import '../../../components/vc/entity-card.css';
import '../AdminV2.css';
import '../settings/settings-page.css';
import '../care-profile/care-profile.css';
import './users.css';

export default function UserSection({
  userId, user, tab, title, description, loading, error, notice, children,
}) {
  return (
    <AdminV2Layout>
      <div className="admin-v2-page">
        <div className="cfg">
          <div className="cfg-crumb">
            <Link to={`/care/configuration/users/${userId}`} className="cfg-back">
              <ChevronLeftIcon size={14} />
              {user ? displayName(user) : 'User'}
            </Link>
          </div>

          <div className="cfg-pagehead">
            <div className="cfg-pagehead-text">
              <span className="cfg-eyebrow">User</span>
              <h1 className="cfg-h1">{title}</h1>
              {description && <p className="cfg-pagehead-desc">{description}</p>}
            </div>
          </div>

          <UserTabs userId={userId} current={tab} />

          {error && <p className="em-error" role="alert">{error}</p>}
          {notice && <p className="em-success" role="status">{notice}</p>}

          {loading ? <p className="cfg-loading">Loading…</p> : children}
        </div>
      </div>
    </AdminV2Layout>
  );
}
