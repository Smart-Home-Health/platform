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
import React, { useState, useEffect } from 'react';
import AdminV2Layout from './AdminV2Layout';
import { useAuth } from '../../contexts/AuthContext';
import config, { apiFetch } from '../../config';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Alert } from '@/components/ui/alert';
import { Field } from '@/components/ui/field';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
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

// Section header matching the rest of admin-v2. `icon` is a component (from Icons.jsx).
const SectionHeader = ({ icon: Icon, title, subtitle, action }) => (
  <CardHeader>
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        {Icon && (
          <span className="text-muted-foreground" aria-hidden>
            <Icon size={22} />
          </span>
        )}
        <div className="flex flex-col gap-0.5">
          <CardTitle>{title}</CardTitle>
          {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
        </div>
      </div>
      {action}
    </div>
  </CardHeader>
);

// A labelled metric tile.
const Stat = ({ label, value, hint }) => (
  <div className="flex flex-col gap-1 rounded-lg border border-border bg-secondary/40 p-4">
    <span className="text-xs uppercase tracking-wide text-muted-foreground">{label}</span>
    <span className="text-2xl font-semibold text-foreground">{value}</span>
    {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
  </div>
);

// Type/compression badges for a table row (shared by the mobile cards + desktop table).
const TypeBadges = ({ t }) => (
  t.hypertable ? (
    <span className="flex flex-wrap items-center gap-1.5">
      <Badge variant="info">hypertable</Badge>
      {t.compressed
        ? <Badge variant="success">compressed</Badge>
        : <Badge variant="muted">uncompressed</Badge>}
    </span>
  ) : (
    <Badge variant="outline">table</Badge>
  )
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
        <div style={{ padding: '2rem', color: 'var(--muted-foreground)', textAlign: 'center' }}>
          <h3 style={{ color: 'var(--foreground)' }}>Access Denied</h3>
          <p>System Health is only available to system administrators.</p>
        </div>
      </AdminV2Layout>
    );
  }

  if (isLoading || !health) {
    return (
      <AdminV2Layout>
        <div className="admin-v2-page">
          <div className="admin-v2-loading">Loading system health…</div>
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
        <div className="tw space-y-6">
          {error && <Alert variant="destructive">{error}</Alert>}
          {notice && <Alert variant="success">{notice}</Alert>}

          {/* Database health */}
          <Card>
            <SectionHeader
              icon={DatabaseIcon}
              title="Database"
              subtitle={`${db.name} · PostgreSQL ${db.postgres_version} · TimescaleDB ${db.timescaledb_version}`}
              action={
                <div className="flex items-center gap-3">
                  <Badge variant={dbHealthy ? 'success' : 'danger'}>
                    {dbHealthy ? '● Healthy' : '● Unhealthy'}
                  </Badge>
                  <Button variant="secondary" onClick={loadHealth} className="gap-1.5">
                    <RefreshIcon size={16} />
                    Refresh
                  </Button>
                </div>
              }
            />
            <CardContent>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <Stat label="Total Size" value={formatBytes(db.total_size_bytes)} />
                <Stat label="Uptime" value={formatUptime(db.uptime_seconds)} />
                <Stat
                  label="Connections"
                  value={`${db.connections.active}/${db.connections.max}`}
                  hint={`${connPct}% of pool`}
                />
                <Stat
                  label="Cache Hit Ratio"
                  value={`${(db.cache_hit_ratio * 100).toFixed(1)}%`}
                  hint={db.cache_hit_ratio >= 0.99 ? 'Excellent' : 'Watch'}
                />
              </div>
            </CardContent>
          </Card>

          {/* Table storage */}
          <Card>
            <SectionHeader
              icon={BarChartIcon}
              title="Storage by Table"
              subtitle="Largest tables and time-series hypertables"
            />
            <CardContent>
              {/* Mobile: stacked cards */}
              <div className="flex flex-col gap-3 sm:hidden">
                {health.tables.map((t) => (
                  <div key={t.name} className="flex flex-col gap-2 rounded-lg border border-border p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-sm text-foreground">{t.name}</span>
                      <span className="text-sm font-medium text-foreground">{formatBytes(t.size_bytes)}</span>
                    </div>
                    <TypeBadges t={t} />
                    <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      <div className="flex justify-between"><dt>Rows</dt><dd className="text-foreground">{formatNumber(t.rows)}</dd></div>
                      {t.hypertable && (
                        <div className="flex justify-between"><dt>Chunks</dt><dd className="text-foreground">{t.chunks}</dd></div>
                      )}
                      {t.hypertable && (
                        <div className="col-span-2 flex justify-between"><dt>Range</dt><dd className="text-foreground">{t.oldest} → {t.newest}</dd></div>
                      )}
                    </dl>
                  </div>
                ))}
              </div>

              {/* sm+: table */}
              <div className="hidden overflow-x-auto sm:block">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                      <th className="px-3 py-2 font-medium">Table</th>
                      <th className="px-3 py-2 font-medium">Rows</th>
                      <th className="px-3 py-2 font-medium">Size</th>
                      <th className="px-3 py-2 font-medium">Type</th>
                      <th className="px-3 py-2 font-medium">Chunks</th>
                      <th className="px-3 py-2 font-medium">Range</th>
                    </tr>
                  </thead>
                  <tbody>
                    {health.tables.map((t) => (
                      <tr key={t.name} className="border-b border-border/60 last:border-0">
                        <td className="px-3 py-2 font-mono text-foreground">{t.name}</td>
                        <td className="px-3 py-2 text-muted-foreground">{formatNumber(t.rows)}</td>
                        <td className="px-3 py-2 text-foreground">{formatBytes(t.size_bytes)}</td>
                        <td className="px-3 py-2"><TypeBadges t={t} /></td>
                        <td className="px-3 py-2 text-muted-foreground">{t.hypertable ? t.chunks : '—'}</td>
                        <td className="px-3 py-2 text-muted-foreground">
                          {t.hypertable ? `${t.oldest} → ${t.newest}` : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {/* Maintenance / prune */}
          <Card>
            <SectionHeader
              icon={WrenchIcon}
              title="Maintenance"
              subtitle="Prune old time-series data and reclaim space. Destructive actions ask for confirmation."
            />
            <CardContent className="flex flex-col gap-6">
              <div className="flex flex-col gap-4">
                {health.tables.filter((t) => t.hypertable).map((t) => (
                  <div
                    key={t.name}
                    className="flex flex-col gap-3 rounded-lg border border-border p-4 sm:flex-row sm:items-end sm:justify-between"
                  >
                    <div className="flex flex-col gap-0.5">
                      <span className="font-mono text-sm text-foreground">{t.name}</span>
                      <span className="text-xs text-muted-foreground">
                        {formatNumber(t.rows)} rows · {formatBytes(t.size_bytes)} · oldest {t.oldest}
                      </span>
                    </div>
                    <div className="flex items-end gap-3">
                      <Field label="Older than (days)" className="w-36">
                        <Input
                          type="number"
                          min="1"
                          value={olderThanDays[t.name] ?? ''}
                          onChange={(e) =>
                            setOlderThanDays((p) => ({ ...p, [t.name]: e.target.value }))
                          }
                        />
                      </Field>
                      <Button
                        variant="secondary"
                        disabled={!!busy || t.compressed}
                        onClick={() => runMaintenance(
                          `Compress ${t.name}`, 'compress',
                          { table: t.name, older_than_days: Number(olderThanDays[t.name]) },
                        )}
                      >
                        {busy === `Compress ${t.name}` ? 'Compressing…' : 'Compress'}
                      </Button>
                      <Button
                        variant="destructive"
                        disabled={!!busy}
                        onClick={() => setPruneTarget({ table: t.name, days: Number(olderThanDays[t.name]) })}
                      >
                        Prune…
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
            <CardFooter className="flex flex-wrap gap-3">
              <Button
                variant="secondary"
                disabled={!!busy}
                onClick={() => runMaintenance('VACUUM ANALYZE', 'vacuum', {})}
              >
                {busy === 'VACUUM ANALYZE' ? 'Running…' : 'Run VACUUM ANALYZE'}
              </Button>
            </CardFooter>
          </Card>

          {/* About / scope note */}
          <Card>
            <SectionHeader icon={InfoIcon} title="About this page" />
            <CardContent className="text-sm text-muted-foreground">
              System Health is restricted to system administrators. Metrics are read live from the
              database (size, connections, chunk layout) using planner estimates, so rendering never
              scans the large sensor tables. Pruning drops whole TimescaleDB chunks older than the
              chosen cutoff; compression and VACUUM ANALYZE run on demand.
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Prune confirmation */}
      <Dialog open={!!pruneTarget} onOpenChange={(o) => !o && setPruneTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Prune {pruneTarget?.table}?</DialogTitle>
            <DialogDescription>
              This permanently drops every data chunk older than{' '}
              <strong>{pruneTarget?.days} days</strong> from{' '}
              <span className="font-mono">{pruneTarget?.table}</span>. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="secondary" disabled={!!busy} onClick={() => setPruneTarget(null)}>Cancel</Button>
            <Button
              variant="destructive"
              disabled={!!busy}
              onClick={() => runMaintenance(
                `Prune ${pruneTarget?.table}`, 'prune',
                { table: pruneTarget?.table, older_than_days: pruneTarget?.days },
              )}
            >
              {busy ? 'Pruning…' : 'Prune permanently'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminV2Layout>
  );
};

export default AdminV2SystemHealth;
