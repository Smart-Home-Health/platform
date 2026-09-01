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
import { LeafIcon, RefreshIcon, SearchIcon } from '../../components/Icons';
import { EmField } from '../../components/vc/EntityModal';
import { CfgSection, CfgGroup, CfgFields, CfgStat, CfgBadge } from './settings/CfgSection';
import '../../components/vc/entity-card.css';
import './AdminV2.css';
import './settings/settings-page.css';

// Open-Meteo's free geocoder (no key, CORS-enabled) — called directly from
// the browser so the backend never proxies location searches.
const GEOCODE_URL = 'https://geocoding-api.open-meteo.com/v1/search';

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
          <p className="cfg-loading">Loading environment settings…</p>
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
        <div className="cfg">
          {error && <p className="em-error" role="alert">{error}</p>}
          {notice && <p className="em-success" role="status">{notice}</p>}

          <CfgSection
            icon={<LeafIcon size={16} />}
            title="Outdoor weather (Open-Meteo)"
            subtitle="Free hourly weather and air quality for your home location — pressure, temperature, humidity, AQI, pollen. No account or hardware needed."
            aside={
              <>
                <CfgBadge tone={connector?.enabled ? 'ok' : undefined}>
                  {connector?.enabled ? 'Collecting' : 'Off'}
                </CfgBadge>
                <button type="button" className="cfg-ghost" onClick={() => loadConnectors()}>
                  <RefreshIcon size={14} /> Refresh
                </button>
              </>
            }
            actions={
              <>
                <button type="button" className="em-cancel" onClick={testConnection}
                        disabled={busy === 'test' || !hasCoords}>
                  {busy === 'test' ? 'Testing…' : 'Test connection'}
                </button>
                <button type="button" className="em-cancel" onClick={startBackfill}
                        disabled={busy === 'backfill' || !connector?.configured || backfill.status === 'running'}>
                  {backfill.status === 'running' ? 'Backfill running…' : 'Import 90-day history'}
                </button>
                <button type="button" className="em-submit" onClick={saveConfig}
                        disabled={busy === 'save'}>
                  {busy === 'save' ? 'Saving…' : 'Save'}
                </button>
              </>
            }
          >
            <CfgGroup title="Location">
              <EmField label="Find your location" htmlFor="env-city-search">
                <div className="cfg-search-row">
                  <input
                    id="env-city-search"
                    className="em-input"
                    placeholder="Search city or town…"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') runSearch(); }}
                  />
                  <button type="button" className="cfg-ghost" onClick={runSearch} disabled={searching}>
                    <SearchIcon size={14} /> {searching ? 'Searching…' : 'Search'}
                  </button>
                </div>
              </EmField>

              {searchResults && (
                <div className="cfg-picklist">
                  {searchResults.length === 0 && <p className="cfg-empty">No matches found.</p>}
                  {searchResults.map((r) => (
                    <button key={r.id} type="button" className="cfg-pick" onClick={() => pickResult(r)}>
                      <span>{[r.name, r.admin1, r.country].filter(Boolean).join(', ')}</span>
                      <span className="cfg-pick-meta">
                        {r.latitude.toFixed(3)}, {r.longitude.toFixed(3)}
                      </span>
                    </button>
                  ))}
                </div>
              )}

              <CfgFields>
                <EmField label="Latitude" htmlFor="env-lat">
                  <input id="env-lat" className="em-input" type="number" step="0.0001" min="-90" max="90"
                         value={latitude} onChange={(e) => setLatitude(e.target.value)} />
                </EmField>
                <EmField label="Longitude" htmlFor="env-lon">
                  <input id="env-lon" className="em-input" type="number" step="0.0001" min="-180" max="180"
                         value={longitude} onChange={(e) => setLongitude(e.target.value)} />
                </EmField>
                <EmField label="Label" htmlFor="env-label">
                  <input id="env-label" className="em-input" placeholder="e.g. Home"
                         value={locationLabel} onChange={(e) => setLocationLabel(e.target.value)} />
                </EmField>
              </CfgFields>

              <label className="em-check-row" htmlFor="env-enabled">
                <input id="env-enabled" type="checkbox" className="em-check"
                       checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
                <span className="em-check-label">Collect weather data hourly</span>
              </label>
            </CfgGroup>

            <CfgGroup title="Status">
              <div className="cfg-stats">
                <CfgStat
                  label="Last poll"
                  value={formatWhen(state.last_poll_at)}
                  hint={state.last_status === 'error' ? undefined : 'Checks hourly while enabled'}
                />
                <CfgStat
                  label="Last result"
                  value={state.last_status
                    ? (state.last_status === 'success'
                      ? `OK — ${state.last_insert_count ?? 0} new readings`
                      : 'Error')
                    : '—'}
                />
                <CfgStat
                  label="History import"
                  value={backfill.status
                    ? backfill.status.charAt(0).toUpperCase() + backfill.status.slice(1)
                    : 'Not run'}
                  hint={backfill.completed_at ? `Finished ${formatWhen(backfill.completed_at)}` : undefined}
                />
              </div>

              {state.last_status === 'error' && state.last_error && (
                <p className="em-error" role="alert">Last poll failed: {state.last_error}</p>
              )}
              {backfill.status === 'error' && backfill.error && (
                <p className="em-error" role="alert">Backfill failed: {backfill.error}</p>
              )}
            </CfgGroup>
          </CfgSection>
        </div>
      </div>
    </AdminV2Layout>
  );
};

export default AdminV2Environment;
