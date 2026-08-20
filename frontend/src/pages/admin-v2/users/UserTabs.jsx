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
// The four views of one user. Links, not local state — same reasoning as the
// Directory tabs: a bookmark, the back button and a deep link all keep working,
// and each view fetches only what it draws.
import { Link } from 'react-router-dom';

const USER_TABS = [
  { id: 'overview', label: 'Overview', segment: '' },
  { id: 'access', label: 'Access', segment: '/access' },
  { id: 'security', label: 'Security', segment: '/security' },
  { id: 'activity', label: 'Activity', segment: '/activity' },
];

export default function UserTabs({ userId, current }) {
  return (
    <div className="cp-tabs" role="tablist" aria-label="User">
      {USER_TABS.map((t) => (
        <Link
          key={t.id}
          to={`/care/configuration/users/${userId}${t.segment}`}
          role="tab"
          aria-selected={current === t.id}
          className="cp-tab"
        >
          {t.label}
        </Link>
      ))}
    </div>
  );
}
