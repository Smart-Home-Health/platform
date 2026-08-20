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
// Configuration → Directory: care profiles, users and access roles in one
// shell. The three lists differ only in what a row says, what the stats count,
// what can be filtered and how it sorts (see directoryTabs.js).
//
// The tabs are links, not local state: /patients, /users and /users/roles each
// still resolve on their own, so deep links, the back button and per-list
// permissions all keep working.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import AdminV2Layout from '../AdminV2Layout';
import config, { apiFetch } from '../../../config';
import { useAuth } from '../../../contexts/AuthContext';
import {
  ChevronRightIcon, FilterIcon, PatientsIcon, PlusIcon, SearchIcon, ShieldIcon, UsersIcon, XIcon,
} from '../../../components/Icons';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert } from '@/components/ui/alert';
import { Input } from '@/components/ui/input';
import HAIdentitiesCard from '../components/HAIdentitiesCard';
import DirectoryFilters from './DirectoryFilters';
import CreateCareProfileDialog from './CreateCareProfileDialog';
import CreateUserDialog from './CreateUserDialog';
import CreateRoleDialog from './CreateRoleDialog';
import {
  DEFAULT_FILTERS, SORTS, TABS, TAB_IDS, activeFilterChips, filterRows, profileRows,
  roleRows, sortRows, statsFor, tabForPath, userRows,
} from './directoryTabs';
import '../AdminV2.css';
import '../care-profile/care-profile.css';
import './directory.css';

const TAB_ICONS = { profiles: PatientsIcon, users: UsersIcon, roles: ShieldIcon };

export default function AdminV2Directory() {
  const { user } = useAuth();
  const { pathname } = useLocation();
  const tab = tabForPath(pathname);

  const [patients, setPatients] = useState([]);
  const [users, setUsers] = useState([]);
  const [roles, setRoles] = useState([]);
  const [permissions, setPermissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [sort, setSort] = useState('name');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [creating, setCreating] = useState(false);

  const can = useCallback((permission) => {
    if (!user) return false;
    if (user.is_system_admin) return true;
    return user.permissions?.includes(permission) || false;
  }, [user]);

  const canSee = useCallback((tabId) => TABS[tabId].readPermissions.some(can), [can]);

  // Each list is fetched only when the viewer is allowed to read it — the tab
  // counts would otherwise be built from 403s.
  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const reads = [];
      if (canSee('profiles')) {
        reads.push(apiFetch(`${config.apiUrl}/api/patients?active_only=false`)
          .then((r) => (r.ok ? r.json() : [])).then(setPatients));
      }
      if (canSee('users')) {
        reads.push(apiFetch(`${config.apiUrl}/api/users`)
          .then((r) => (r.ok ? r.json() : [])).then(setUsers));
      }
      if (canSee('roles')) {
        reads.push(apiFetch(`${config.apiUrl}/api/users/roles`)
          .then((r) => (r.ok ? r.json() : [])).then(setRoles));
        reads.push(apiFetch(`${config.apiUrl}/api/users/permissions`)
          .then((r) => (r.ok ? r.json() : [])).then(setPermissions));
      }
      await Promise.all(reads);
    } catch {
      setError('Could not load the directory.');
    } finally {
      setLoading(false);
    }
  }, [user, canSee]);

  useEffect(() => { load(); }, [load]);

  // A filter from one tab must not silently narrow another.
  useEffect(() => { setFilters(DEFAULT_FILTERS); setSearch(''); setSort('name'); }, [tab]);

  const allRows = useMemo(() => ({
    profiles: profileRows(patients),
    users: userRows(users),
    roles: roleRows(roles, canSee('users') ? users : null),
  }), [patients, users, roles, canSee]);

  const rows = allRows[tab];
  const visible = useMemo(
    () => sortRows(filterRows(rows, { search, filters, tab }), sort),
    [rows, search, filters, tab, sort],
  );
  const stats = statsFor(tab, { rows, permissionCount: permissions.length });
  const chips = activeFilterChips(filters, { tab, roles });
  const meta = TABS[tab];
  const visibleTabs = TAB_IDS.filter(canSee);

  const openCreated = () => { setCreating(false); load(); };

  return (
    <AdminV2Layout>
      <div className="admin-v2-page">
        <div className="tw flex flex-col gap-4">
          <div className="flex flex-col gap-0.5">
            <h1 className="cp-title">Directory</h1>
            <p className="text-sm text-muted-foreground">
              Manage care profiles, users, and access roles.
            </p>
          </div>

          {/* Tabs — real routes, so a bookmark still lands where it used to. */}
          <div className="cp-tabs" role="tablist" aria-label="Directory">
            {visibleTabs.map((id) => {
              const Icon = TAB_ICONS[id];
              return (
                <Link
                  key={id}
                  to={TABS[id].path}
                  role="tab"
                  aria-selected={tab === id}
                  className="cp-tab dir-tab"
                >
                  <Icon size={14} />
                  <span>{TABS[id].label}</span>
                  <span className="dir-tab-count">{allRows[id].length}</span>
                </Link>
              );
            })}
          </div>

          {error && <Alert variant="destructive" role="alert">{error}</Alert>}

          <Card>
            <CardContent className="cp-stats p-0">
              {stats.map((stat) => (
                <div className="cp-stat" key={stat.label} data-tone={stat.tone}>
                  <span className="cp-stat-value">{stat.value}</span>
                  <span className="cp-stat-label">{stat.label}</span>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Toolbar */}
          <div className="dir-toolbar">
            <div className="relative flex-1">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                <SearchIcon size={16} />
              </span>
              <Input
                className="pl-9"
                placeholder={meta.searchPlaceholder}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <Button
              variant="secondary"
              className="dir-filter-button"
              onClick={() => setFiltersOpen(true)}
              aria-label={`Filter ${meta.noun[1]}`}
            >
              <FilterIcon size={16} />
              {chips.length > 0 && <span className="dir-filter-count">{chips.length}</span>}
            </Button>
          </div>

          {chips.length > 0 && (
            <div className="dir-chips">
              {chips.map((chip) => (
                <button
                  key={chip.id}
                  type="button"
                  className="dir-chip"
                  onClick={() => setFilters((prev) => ({ ...prev, ...chip.reset }))}
                >
                  {chip.label}
                  <XIcon size={12} />
                </button>
              ))}
              <button
                type="button"
                className="dir-chip-clear"
                onClick={() => setFilters({ ...DEFAULT_FILTERS, status: 'all' })}
              >
                Clear
              </button>
            </div>
          )}

          {can(meta.createPermission) && (
            <Button className="w-full gap-1.5" onClick={() => setCreating(true)}>
              <PlusIcon size={16} /> {meta.addLabel}
            </Button>
          )}

          {/* List */}
          {loading ? (
            <div className="admin-v2-loading">Loading {meta.noun[1]}…</div>
          ) : (
            <Card>
              <CardContent className="cp-rows p-0">
                {visible.length === 0 ? (
                  <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
                    <span className="text-muted-foreground" aria-hidden>
                      {(() => { const Icon = TAB_ICONS[tab]; return <Icon size={32} />; })()}
                    </span>
                    <p className="text-sm text-foreground">No {meta.noun[1]} match this view</p>
                    <p className="text-sm text-muted-foreground">
                      {search || chips.length
                        ? 'Try a different search, or clear the filters.'
                        : `Add a ${meta.noun[0]} to get started.`}
                    </p>
                  </div>
                ) : (
                  visible.map((row) => (
                    <Link key={row.key} className="cp-row cp-row-compact" to={row.to}>
                      <span className="dir-avatar" aria-hidden>
                        {row.initials || <ShieldIcon size={16} />}
                      </span>
                      <span className="cp-row-body">
                        <span className="cp-row-title cp-row-title-plain">{row.title}</span>
                        <span className="cp-row-status">
                          {row.badge && <Badge variant="default">{row.badge}</Badge>}
                          <Badge variant={row.status.tone === 'muted' ? 'muted' : row.status.tone}>
                            {row.status.label}
                          </Badge>
                        </span>
                        <span className="cp-row-blurb">{row.meta}</span>
                      </span>
                      <span className="cp-chevron" aria-hidden><ChevronRightIcon size={18} /></span>
                    </Link>
                  ))
                )}

                <div className="dir-footer">
                  <span>
                    {visible.length}{visible.length === rows.length ? '' : ` of ${rows.length}`}{' '}
                    {visible.length === 1 ? meta.noun[0] : meta.noun[1]}
                  </span>
                  <label className="dir-sort">
                    <span className="sr-only">Sort {meta.noun[1]}</span>
                    <select value={sort} onChange={(e) => setSort(e.target.value)}>
                      {SORTS[tab].map((option) => (
                        <option key={option.id} value={option.id}>{option.label}</option>
                      ))}
                    </select>
                  </label>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Home Assistant identity mapping belongs with the people it maps. */}
          {tab === 'users' && !loading && (
            <HAIdentitiesCard
              users={users}
              roles={roles}
              patients={patients}
              onUsersChanged={load}
              onPatientsChanged={load}
            />
          )}
        </div>

        <DirectoryFilters
          tab={tab}
          filters={filters}
          roles={roles}
          open={filtersOpen}
          onOpenChange={setFiltersOpen}
          onApply={setFilters}
        />
        {tab === 'profiles' && (
          <CreateCareProfileDialog
            open={creating} onOpenChange={setCreating} onCreated={openCreated} />
        )}
        {tab === 'users' && (
          <CreateUserDialog
            open={creating} onOpenChange={setCreating} onCreated={openCreated}
            roles={roles} patients={patients} />
        )}
        {tab === 'roles' && (
          <CreateRoleDialog
            open={creating} onOpenChange={setCreating} onCreated={openCreated}
            permissions={permissions} />
        )}
      </div>
    </AdminV2Layout>
  );
}
