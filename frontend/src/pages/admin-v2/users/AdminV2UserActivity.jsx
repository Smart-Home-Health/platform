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
// User → Activity. Straight from the audit log: sign-ins, refused attempts and
// the administrative actions that named this user. Nothing here is inferred.
//
// Worth knowing what is *not* here: role and care-profile assignment changes
// made from these screens are not recorded by the API, so they never appear.
import { useParams } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { HistoryIcon } from '../../../components/Icons';
import useUserRecord from './useUserRecord';
import UserSection from './UserSection';
import { describeActivityList } from './userActivity';

export default function AdminV2UserActivity() {
  const { userId } = useParams();
  const { user, activity, loading, error } = useUserRecord(userId, { activity: 50 });
  const rows = describeActivityList(activity || []);

  return (
    <UserSection
      userId={userId}
      user={user}
      tab="activity"
      title="Account activity"
      description="Sign-ins and administrative changes recorded against this account."
      loading={loading}
      error={error}
    >
      <Card>
        <CardContent className="flex flex-col p-0">
          {activity === null && (
            <div className="px-4 py-10 text-center text-sm text-muted-foreground">
              You do not have permission to read this user&rsquo;s account log.
            </div>
          )}
          {activity?.length === 0 && (
            <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
              <span className="text-muted-foreground" aria-hidden><HistoryIcon size={32} /></span>
              <p className="text-sm text-foreground">Nothing recorded yet</p>
              <p className="text-sm text-muted-foreground">
                Sign-ins and password changes will appear here as they happen.
              </p>
            </div>
          )}
          {rows.map((row) => (
            <div className="ud-activity" key={row.id}>
              <span className="ud-activity-dot" data-tone={row.tone} aria-hidden />
              <span className="min-w-0">
                <span className="ud-activity-label" data-raw={!row.known}>{row.label}</span>
                {row.detail && <span className="ud-activity-detail">{row.detail}</span>}
              </span>
              <span className="ud-activity-when">{row.when}</span>
            </div>
          ))}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        Role and care-profile changes are not written to the account log, so they are not
        listed here.
      </p>
    </UserSection>
  );
}
