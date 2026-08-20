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
import { Alert } from '@/components/ui/alert';
import { displayName } from './userDetail';
import UserTabs from './UserTabs';
import '../AdminV2.css';
import '../care-profile/care-profile.css';
import './users.css';

export default function UserSection({
  userId, user, tab, title, description, loading, error, notice, children,
}) {
  return (
    <AdminV2Layout>
      <div className="admin-v2-page">
        <div className="tw flex flex-col gap-4">
          <Link
            to={`/care/configuration/users/${userId}`}
            className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ChevronLeftIcon size={16} />
            {user ? displayName(user) : 'User'}
          </Link>

          <div className="flex min-w-0 flex-col gap-1">
            <span className="cp-eyebrow">User</span>
            <h1 className="cp-title">{title}</h1>
            {description && (
              <p className="max-w-prose text-sm text-muted-foreground">{description}</p>
            )}
          </div>

          <UserTabs userId={userId} current={tab} />

          {error && <Alert variant="destructive" role="alert">{error}</Alert>}
          {notice && <Alert variant="success" role="status">{notice}</Alert>}

          {loading ? <div className="admin-v2-loading">Loading…</div> : children}
        </div>
      </div>
    </AdminV2Layout>
  );
}
