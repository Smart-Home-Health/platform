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
  ChevronRightIcon, FilterIcon, PatientsIcon, SearchIcon, ShieldIcon, UsersIcon, XIcon,
} from '../../../components/Icons';
import { CfgBadge } from '../settings/CfgSection';
import '../../../components/vc/entity-card.css';
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
import PersonAvatar from '../../../components/vc/PersonAvatar';

const TAB_ICONS = { profiles: PatientsIcon, users: UsersIcon, roles: ShieldIcon };
// Row status tones → cfg-badge tones; 'muted' stays the neutral default.
const BADGE_TONE = { success: 'ok', warning: 'warn', danger: 'alert' };

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
        <div className="cfg">
          <div className="cfg-pagehead">
            <div className="cfg-pagehead-text">
              <h1 className="cfg-h1">Directory</h1>
              <p className="cfg-pagehead-desc">
                Manage care profiles, users, and access roles.
              </p>
            </div>
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

          {error && <p className="em-error" role="alert">{error}</p>}

          <section className="cfg-card cp-stats">
              {stats.map((stat) => (
                <div className="cp-stat" key={stat.label} data-tone={stat.tone}>
                  <span className="cp-stat-value">{stat.value}</span>
                  <span className="cp-stat-label">{stat.label}</span>
                </div>
              ))}
          </section>

          {/* Toolbar */}
          <div className="dir-toolbar">
            <div className="dir-search">
              <span className="dir-search-icon" aria-hidden>
                <SearchIcon size={16} />
              </span>
              <input
                className="em-input"
                placeholder={meta.searchPlaceholder}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <button
              type="button"
              className="cfg-ghost dir-filter-button"
              onClick={() => setFiltersOpen(true)}
              aria-label={`Filter ${meta.noun[1]}`}
            >
              <FilterIcon size={16} />
              {chips.length > 0 && <span className="dir-filter-count">{chips.length}</span>}
            </button>
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
            <button type="button" className="em-submit dir-add" onClick={() => setCreating(true)}>
              {meta.addLabel}
            </button>
          )}

          {/* List */}
          {loading ? (
            <p className="cfg-loading">Loading {meta.noun[1]}…</p>
          ) : (
            <section className="cfg-card cp-rows">
                {visible.length === 0 ? (
                  <div className="cfg-nopatient">
                    {(() => { const Icon = TAB_ICONS[tab]; return <Icon size={32} />; })()}
                    <p>No {meta.noun[1]} match this view</p>
                    <p>
                      {search || chips.length
                        ? 'Try a different search, or clear the filters.'
                        : `Add a ${meta.noun[0]} to get started.`}
                    </p>
                  </div>
                ) : (
                  visible.map((row) => (
                    <Link key={row.key} className="cp-row cp-row-compact" to={row.to}>
                      {row.avatar ? (
                        <PersonAvatar {...row.avatar} size={36} decorative />
                      ) : (
                        <span className="dir-avatar" aria-hidden><ShieldIcon size={16} /></span>
                      )}
                      <span className="cp-row-body">
                        <span className="cp-row-title cp-row-title-plain">{row.title}</span>
                        <span className="cp-row-status">
                          {row.badge && <CfgBadge tone="live">{row.badge}</CfgBadge>}
                          <CfgBadge tone={BADGE_TONE[row.status.tone]}>
                            {row.status.label}
                          </CfgBadge>
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
            </section>
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
