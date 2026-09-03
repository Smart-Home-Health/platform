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
import { useState, useEffect } from 'react';
import AdminV2Layout from './AdminV2Layout';
import { useAuth } from '../../contexts/AuthContext';
import config, { apiFetch } from '../../config';
import { EmField } from '../../components/vc/EntityModal';
import ConfirmSheet from '../../components/vc/ConfirmSheet';
import { CfgSection, CfgGroup, CfgStat, CfgBadge } from './settings/CfgSection';
import '../../components/vc/entity-card.css';
import './settings/settings-page.css';
import {
  DatabaseIcon,
  BarChartIcon,
  WrenchIcon,
  InfoIcon,
  RefreshIcon,
} from '../../components/Icons';
import './AdminV2.css';

function formatBytes(bytes) {
  if (bytes == null) return '—';
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let v = bytes / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i += 1; }
  return `${v.toFixed(v < 10 ? 1 : 0)} ${units[i]}`;
}

function formatNumber(n) {
  if (n == null) return '—';
  return n.toLocaleString();
}

function formatUptime(seconds) {
  if (seconds == null) return '—';
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

// Type/compression badges for a storage row.
const TypeBadges = ({ t }) => (
  <span className="cfg-tags">
    {t.hypertable ? (
      <>
        <CfgBadge tone="live">hypertable</CfgBadge>
        {t.compressed
          ? <CfgBadge tone="ok">compressed</CfgBadge>
          : <CfgBadge>uncompressed</CfgBadge>}
      </>
    ) : (
      <CfgBadge>table</CfgBadge>
    )}
  </span>
);

const AdminV2SystemHealth = () => {
  const { user } = useAuth();

  const [health, setHealth] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [busy, setBusy] = useState(null); // label of the in-flight maintenance action

  // Maintenance state
  const [pruneTarget, setPruneTarget] = useState(null); // { table, days }
  const [olderThanDays, setOlderThanDays] = useState({}); // per-table input

  useEffect(() => { loadHealth(); }, []);

  const loadHealth = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const res = await apiFetch(`${config.apiUrl}/api/system/health`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail || `HTTP ${res.status}`);
      }
      const data = await res.json();
      setHealth(data);
      // Seed default "older than" inputs for hypertables (only for new ones).
      setOlderThanDays((prev) => {
        const next = { ...prev };
        data.tables.filter((t) => t.hypertable).forEach((t) => {
          if (next[t.name] == null) next[t.name] = 90;
        });
        return next;
      });
    } catch (err) {
      console.error('Error loading system health:', err);
      setError(`Failed to load system health: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  // POST a maintenance action, surface the result, and refresh metrics.
  const runMaintenance = async (label, path, payload) => {
    setError(null);
    setNotice(null);
    setBusy(label);
    try {
      const res = await apiFetch(`${config.apiUrl}/api/system/maintenance/${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload || {}),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.detail || `HTTP ${res.status}`);

      if (body.chunks_dropped != null) {
        setNotice(`Pruned ${body.table}: dropped ${body.chunks_dropped} chunk(s).`);
      } else if (body.chunks_compressed != null) {
        setNotice(`Compressed ${body.chunks_compressed} chunk(s) on ${body.table}.`);
      } else {
        setNotice(`VACUUM ANALYZE complete (${body.target}).`);
      }
      await loadHealth();
    } catch (err) {
      console.error('Maintenance action failed:', err);
      setError(`${label} failed: ${err.message}`);
    } finally {
      setBusy(null);
      setPruneTarget(null);
    }
  };

  if (user && !user.is_system_admin) {
    return (
      <AdminV2Layout>
        <div className="admin-v2-page">
          <div className="cfg">
            <CfgSection icon={<DatabaseIcon size={16} />} title="Access Denied">
              <CfgGroup>
                <p className="cfg-empty">
                  System Health is only available to system administrators.
                </p>
              </CfgGroup>
            </CfgSection>
          </div>
        </div>
      </AdminV2Layout>
    );
  }

  if (isLoading || !health) {
    return (
      <AdminV2Layout>
        <div className="admin-v2-page">
          <p className="cfg-loading">Loading system health…</p>
        </div>
      </AdminV2Layout>
    );
  }

  const db = health.database;
  const connPct = db.connections.max ? Math.round((db.connections.active / db.connections.max) * 100) : 0;
  const dbHealthy = db.status === 'healthy';

  return (
    <AdminV2Layout>
      <div className="admin-v2-page">
        <div className="cfg">
          {error && <p className="em-error" role="alert">{error}</p>}
          {notice && <p className="em-success" role="status">{notice}</p>}

          <CfgSection
            icon={<DatabaseIcon size={16} />}
            title="Database"
            subtitle={`${db.name} · PostgreSQL ${db.postgres_version} · TimescaleDB ${db.timescaledb_version}`}
            aside={
              <>
                <CfgBadge tone={dbHealthy ? 'ok' : 'alert'}>
                  {dbHealthy ? 'Healthy' : 'Unhealthy'}
                </CfgBadge>
                <button type="button" className="cfg-ghost" onClick={loadHealth}>
                  <RefreshIcon size={14} /> Refresh
                </button>
              </>
            }
          >
            <CfgGroup>
              <div className="cfg-stats">
                <CfgStat label="Total Size" value={formatBytes(db.total_size_bytes)} />
                <CfgStat label="Uptime" value={formatUptime(db.uptime_seconds)} />
                <CfgStat
                  label="Connections"
                  value={`${db.connections.active}/${db.connections.max}`}
                  hint={`${connPct}% of pool`}
                />
                <CfgStat
                  label="Cache Hit Ratio"
                  value={`${(db.cache_hit_ratio * 100).toFixed(1)}%`}
                  hint={db.cache_hit_ratio >= 0.99 ? 'Excellent' : 'Watch'}
                />
              </div>
            </CfgGroup>
          </CfgSection>

          <CfgSection
            icon={<BarChartIcon size={16} />}
            title="Storage by Table"
            subtitle="Largest tables and time-series hypertables"
          >
            <CfgGroup>
              {/* One row markup: stacked label/value pairs on a phone, columns
                  at >=900px. No separate mobile-card tree to keep in sync. */}
              <div
                className="cfg-table"
                style={{ '--cfg-trow-cols': 'minmax(9rem, 1.4fr) 6rem 6rem minmax(0, 1.2fr) 5rem minmax(0, 1.4fr)' }}
              >
                <div className="cfg-thead" aria-hidden="true">
                  <span>Table</span><span>Rows</span><span>Size</span>
                  <span>Type</span><span>Chunks</span><span>Range</span>
                </div>
                {health.tables.map((t) => (
                  <div className="cfg-trow" key={t.name}>
                    <span className="cfg-tcell name">{t.name}</span>
                    <span className="cfg-tcell" data-label="Rows">
                      <span className="cfg-tval">{formatNumber(t.rows)}</span>
                    </span>
                    <span className="cfg-tcell" data-label="Size">
                      <span className="cfg-tval strong">{formatBytes(t.size_bytes)}</span>
                    </span>
                    <span className="cfg-tcell" data-label="Type"><TypeBadges t={t} /></span>
                    <span className="cfg-tcell" data-label="Chunks">
                      <span className="cfg-tval">{t.hypertable ? t.chunks : '—'}</span>
                    </span>
                    <span className="cfg-tcell" data-label="Range">
                      <span className="cfg-tval">
                        {t.hypertable ? `${t.oldest} → ${t.newest}` : '—'}
                      </span>
                    </span>
                  </div>
                ))}
              </div>
            </CfgGroup>
          </CfgSection>

          <CfgSection
            icon={<WrenchIcon size={16} />}
            title="Maintenance"
            subtitle="Prune old time-series data and reclaim space. Destructive actions ask for confirmation."
            actions={
              <button type="button" className="em-cancel" disabled={!!busy}
                      onClick={() => runMaintenance('VACUUM ANALYZE', 'vacuum', {})}>
                {busy === 'VACUUM ANALYZE' ? 'Running…' : 'Run VACUUM ANALYZE'}
              </button>
            }
          >
            {health.tables.filter((t) => t.hypertable).map((t) => (
              <CfgGroup key={t.name}>
                <div className="cfg-maint">
                  <div className="cfg-maint-id">
                    <span className="cfg-maint-name">{t.name}</span>
                    <span className="cfg-maint-meta">
                      {formatNumber(t.rows)} rows · {formatBytes(t.size_bytes)} · oldest {t.oldest}
                    </span>
                  </div>
                  <div className="cfg-maint-actions">
                    <EmField label="Older than (days)" htmlFor={`older-${t.name}`}>
                      <input
                        id={`older-${t.name}`}
                        className="em-input"
                        type="number"
                        min="1"
                        value={olderThanDays[t.name] ?? ''}
                        onChange={(e) => setOlderThanDays((p) => ({ ...p, [t.name]: e.target.value }))}
                      />
                    </EmField>
                    <button
                      type="button"
                      className="em-cancel"
                      disabled={!!busy || t.compressed}
                      onClick={() => runMaintenance(
                        `Compress ${t.name}`, 'compress',
                        { table: t.name, older_than_days: Number(olderThanDays[t.name]) },
                      )}
                    >
                      {busy === `Compress ${t.name}` ? 'Compressing…' : 'Compress'}
                    </button>
                    <button
                      type="button"
                      className="em-danger"
                      disabled={!!busy}
                      onClick={() => setPruneTarget({ table: t.name, days: Number(olderThanDays[t.name]) })}
                    >
                      Prune…
                    </button>
                  </div>
                </div>
              </CfgGroup>
            ))}
          </CfgSection>

          <CfgSection icon={<InfoIcon size={16} />} title="About this page">
            <CfgGroup>
              <div className="cfg-prose">
                <p>
                  System Health is restricted to system administrators. Metrics are read live from the
                  database (size, connections, chunk layout) using planner estimates, so rendering never
                  scans the large sensor tables. Pruning drops whole TimescaleDB chunks older than the
                  chosen cutoff; compression and VACUUM ANALYZE run on demand.
                </p>
              </div>
            </CfgGroup>
          </CfgSection>
        </div>
      </div>

      <ConfirmSheet
        open={!!pruneTarget}
        onOpenChange={(o) => !o && setPruneTarget(null)}
        title={`Prune ${pruneTarget?.table}?`}
        confirmLabel="Prune permanently"
        tone="destructive"
        busy={!!busy}
        onConfirm={() => runMaintenance(
          `Prune ${pruneTarget?.table}`, 'prune',
          { table: pruneTarget?.table, older_than_days: pruneTarget?.days },
        )}
      >
        This permanently drops every data chunk older than{' '}
        <strong>{pruneTarget?.days} days</strong> from {pruneTarget?.table}. This cannot be undone.
      </ConfirmSheet>
    </AdminV2Layout>
  );
};

export default AdminV2SystemHealth;
