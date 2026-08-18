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
// Configuration → Environment: home location + environmental data connectors
// (Open-Meteo outdoor weather). Setup-only page — charts/overlays are #49.
import { useCallback, useEffect, useRef, useState } from 'react';
import AdminV2Layout from './AdminV2Layout';
import config, { apiFetch } from '../../config';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert } from '@/components/ui/alert';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { LeafIcon, RefreshIcon, SearchIcon } from '../../components/Icons';
import './AdminV2.css';

// Open-Meteo's free geocoder (no key, CORS-enabled) — called directly from
// the browser so the backend never proxies location searches.
const GEOCODE_URL = 'https://geocoding-api.open-meteo.com/v1/search';

const Stat = ({ label, value, hint }) => (
  <div className="flex flex-col gap-1 rounded-lg border border-border bg-secondary/40 p-4">
    <span className="text-xs uppercase tracking-wide text-muted-foreground">{label}</span>
    <span className="text-lg font-semibold text-foreground break-all">{value}</span>
    {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
  </div>
);

const formatWhen = (iso) => {
  if (!iso) return 'Never';
  const d = new Date(iso);
  return isNaN(d) ? 'Never' : d.toLocaleString('en-US', {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  });
};

const AdminV2Environment = () => {
  const [connector, setConnector] = useState(null); // open_meteo info blob
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [busy, setBusy] = useState(null);

  // Form state
  const [enabled, setEnabled] = useState(false);
  const [latitude, setLatitude] = useState('');
  const [longitude, setLongitude] = useState('');
  const [locationLabel, setLocationLabel] = useState('');

  // Geocode search
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState(null);
  const [searching, setSearching] = useState(false);

  const backfillTimer = useRef(null);

  const applyConnector = useCallback((info) => {
    setConnector(info);
    const cfg = info?.config || {};
    setEnabled(Boolean(cfg.enabled));
    setLatitude(cfg.latitude != null ? String(cfg.latitude) : '');
    setLongitude(cfg.longitude != null ? String(cfg.longitude) : '');
    setLocationLabel(cfg.location_label || '');
  }, []);

  const loadConnectors = useCallback(async ({ apply = true } = {}) => {
    try {
      setError(null);
      const res = await apiFetch(`${config.apiUrl}/api/environment/connectors`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail || `HTTP ${res.status}`);
      }
      const list = await res.json();
      const om = list.find((c) => c.slug === 'open_meteo') || null;
      if (apply) applyConnector(om);
      else setConnector(om);
      return om;
    } catch (err) {
      setError(`Failed to load environment connectors: ${err.message}`);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [applyConnector]);

  useEffect(() => {
    loadConnectors();
    return () => clearTimeout(backfillTimer.current);
  }, [loadConnectors]);

  // While a backfill runs, poll state without clobbering the form fields.
  const watchBackfill = useCallback(() => {
    clearTimeout(backfillTimer.current);
    backfillTimer.current = setTimeout(async () => {
      const om = await loadConnectors({ apply: false });
      if (om?.state?.backfill?.status === 'running') watchBackfill();
      else if (om?.state?.backfill?.status === 'done') {
        setNotice(`Backfill complete — ${om.state.backfill.inserted ?? 0} readings imported.`);
      }
    }, 3000);
  }, [loadConnectors]);

  const currentConfigBody = () => ({
    enabled,
    latitude: latitude === '' ? null : Number(latitude),
    longitude: longitude === '' ? null : Number(longitude),
    location_label: locationLabel || null,
  });

  const saveConfig = async () => {
    setError(null);
    setNotice(null);
    setBusy('save');
    try {
      const res = await apiFetch(`${config.apiUrl}/api/environment/connectors/open_meteo/config`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(currentConfigBody()),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        const detail = typeof body.detail === 'string' ? body.detail : `HTTP ${res.status}`;
        throw new Error(detail);
      }
      applyConnector(body);
      setNotice(enabled
        ? 'Saved. Weather data will start arriving within a few minutes.'
        : 'Saved.');
    } catch (err) {
      setError(`Save failed: ${err.message}`);
    } finally {
      setBusy(null);
    }
  };

  const testConnection = async () => {
    setError(null);
    setNotice(null);
    setBusy('test');
    try {
      const res = await apiFetch(`${config.apiUrl}/api/environment/connectors/open_meteo/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(currentConfigBody()),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        const detail = typeof body.detail === 'string' ? body.detail : `HTTP ${res.status}`;
        throw new Error(detail);
      }
      if (body.ok) setNotice('Open-Meteo is reachable and returned data for this location.');
      else setError('Open-Meteo did not return data — check the coordinates.');
    } catch (err) {
      setError(`Test failed: ${err.message}`);
    } finally {
      setBusy(null);
    }
  };

  const startBackfill = async () => {
    if (!window.confirm('Import the last 90 days of weather history for this location?')) return;
    setError(null);
    setNotice(null);
    setBusy('backfill');
    try {
      const res = await apiFetch(`${config.apiUrl}/api/environment/connectors/open_meteo/backfill`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ days: 90 }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        const detail = typeof body.detail === 'string' ? body.detail : `HTTP ${res.status}`;
        throw new Error(detail);
      }
      setNotice('Backfill started — this can take a minute.');
      watchBackfill();
    } catch (err) {
      setError(`Backfill failed: ${err.message}`);
    } finally {
      setBusy(null);
    }
  };

  const runSearch = async () => {
    if (!searchTerm.trim()) return;
    setSearching(true);
    setSearchResults(null);
    try {
      const url = `${GEOCODE_URL}?name=${encodeURIComponent(searchTerm.trim())}&count=5`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = await res.json();
      setSearchResults(body.results || []);
    } catch (err) {
      setError(`Location search failed: ${err.message}`);
    } finally {
      setSearching(false);
    }
  };

  const pickResult = (r) => {
    setLatitude(String(r.latitude));
    setLongitude(String(r.longitude));
    setLocationLabel([r.name, r.admin1, r.country_code].filter(Boolean).join(', '));
    setSearchResults(null);
    setSearchTerm('');
  };

  if (isLoading) {
    return (
      <AdminV2Layout>
        <div className="admin-v2-page">
          <div className="admin-v2-loading">Loading environment settings…</div>
        </div>
      </AdminV2Layout>
    );
  }

  const state = connector?.state || {};
  const backfill = state.backfill || {};
  const hasCoords = latitude !== '' && longitude !== '';

  return (
    <AdminV2Layout>
      <div className="admin-v2-page">
        <div className="tw space-y-6">
          {error && <Alert variant="destructive">{error}</Alert>}
          {notice && <Alert variant="success">{notice}</Alert>}

          <Card>
            <CardHeader>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-muted-foreground" aria-hidden><LeafIcon size={22} /></span>
                  <div className="flex flex-col gap-0.5">
                    <CardTitle>Outdoor weather (Open-Meteo)</CardTitle>
                    <p className="text-sm text-muted-foreground">
                      Free hourly weather and air quality for your home location —
                      pressure, temperature, humidity, AQI, pollen. No account or hardware needed.
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Badge variant={connector?.enabled ? 'success' : 'muted'}>
                    {connector?.enabled ? 'Collecting' : 'Off'}
                  </Badge>
                  <Button variant="secondary" onClick={() => loadConnectors()} className="gap-1.5">
                    <RefreshIcon size={16} /> Refresh
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-5">
                {/* Location search */}
                <div className="space-y-2">
                  <Label htmlFor="env-city-search">Find your location</Label>
                  <div className="flex gap-2">
                    <Input
                      id="env-city-search"
                      placeholder="Search city or town…"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') runSearch(); }}
                    />
                    <Button variant="secondary" onClick={runSearch} disabled={searching} className="gap-1.5 shrink-0">
                      <SearchIcon size={16} /> {searching ? 'Searching…' : 'Search'}
                    </Button>
                  </div>
                  {searchResults && (
                    <div className="rounded-lg border border-border divide-y divide-border">
                      {searchResults.length === 0 && (
                        <div className="p-3 text-sm text-muted-foreground">No matches found.</div>
                      )}
                      {searchResults.map((r) => (
                        <button
                          key={r.id}
                          type="button"
                          onClick={() => pickResult(r)}
                          className="flex w-full items-center justify-between p-3 text-left text-sm hover:bg-secondary/60"
                        >
                          <span>{[r.name, r.admin1, r.country].filter(Boolean).join(', ')}</span>
                          <span className="text-xs text-muted-foreground">
                            {r.latitude.toFixed(3)}, {r.longitude.toFixed(3)}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Coordinates */}
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <div className="space-y-2">
                    <Label htmlFor="env-lat">Latitude</Label>
                    <Input id="env-lat" type="number" step="0.0001" min="-90" max="90"
                           value={latitude} onChange={(e) => setLatitude(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="env-lon">Longitude</Label>
                    <Input id="env-lon" type="number" step="0.0001" min="-180" max="180"
                           value={longitude} onChange={(e) => setLongitude(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="env-label">Label</Label>
                    <Input id="env-label" placeholder="e.g. Home"
                           value={locationLabel} onChange={(e) => setLocationLabel(e.target.value)} />
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Checkbox id="env-enabled" checked={enabled}
                            onCheckedChange={(v) => setEnabled(Boolean(v))} />
                  <Label htmlFor="env-enabled">Collect weather data hourly</Label>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Button onClick={saveConfig} disabled={busy === 'save'}>
                    {busy === 'save' ? 'Saving…' : 'Save'}
                  </Button>
                  <Button variant="secondary" onClick={testConnection}
                          disabled={busy === 'test' || !hasCoords}>
                    {busy === 'test' ? 'Testing…' : 'Test connection'}
                  </Button>
                  <Button variant="secondary" onClick={startBackfill}
                          disabled={busy === 'backfill' || !connector?.configured || backfill.status === 'running'}>
                    {backfill.status === 'running' ? 'Backfill running…' : 'Import 90-day history'}
                  </Button>
                </div>

                {/* Status */}
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <Stat
                    label="Last poll"
                    value={formatWhen(state.last_poll_at)}
                    hint={state.last_status === 'error' ? undefined : 'Checks hourly while enabled'}
                  />
                  <Stat
                    label="Last result"
                    value={state.last_status
                      ? (state.last_status === 'success'
                        ? `OK — ${state.last_insert_count ?? 0} new readings`
                        : 'Error')
                      : '—'}
                  />
                  <Stat
                    label="History import"
                    value={backfill.status
                      ? backfill.status.charAt(0).toUpperCase() + backfill.status.slice(1)
                      : 'Not run'}
                    hint={backfill.completed_at ? `Finished ${formatWhen(backfill.completed_at)}` : undefined}
                  />
                </div>

                {state.last_status === 'error' && state.last_error && (
                  <Alert variant="destructive">Last poll failed: {state.last_error}</Alert>
                )}
                {backfill.status === 'error' && backfill.error && (
                  <Alert variant="destructive">Backfill failed: {backfill.error}</Alert>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </AdminV2Layout>
  );
};

export default AdminV2Environment;
