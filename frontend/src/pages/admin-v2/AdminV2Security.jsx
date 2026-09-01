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
// Configuration → Security: HTTPS status + the guided setup wizard.
import { useCallback, useEffect, useState } from 'react';
import AdminV2Layout from './AdminV2Layout';
import { useAuth } from '../../contexts/AuthContext';
import config, { apiFetch } from '../../config';
import SecuritySetupWizard from '../../components/SecuritySetupWizard';
import { canonicalHttpsUrl } from '../../lib/httpsSetup';
import { ShieldIcon, RefreshIcon } from '../../components/Icons';
import { CfgSection, CfgGroup, CfgStat, CfgBadge } from './settings/CfgSection';
import '../../components/vc/entity-card.css';
import './AdminV2.css';
import './settings/settings-page.css';

const MODE_LABELS = {
  off: 'Not configured',
  duckdns: 'DuckDNS + Let’s Encrypt',
  byo: 'Uploaded certificate',
  proxy: 'External reverse proxy',
};

const IN_PROGRESS = [
  'queued', 'validating_token', 'setting_dns', 'waiting_dns',
  'requesting_cert', 'finalizing',
];

const AdminV2Security = () => {
  const { user } = useAuth();
  const [status, setStatus] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [busy, setBusy] = useState(null);
  const [showWizard, setShowWizard] = useState(false);

  const loadStatus = useCallback(async () => {
    try {
      setError(null);
      const res = await apiFetch(`${config.apiUrl}/api/security/status`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail || `HTTP ${res.status}`);
      }
      const data = await res.json();
      setStatus(data);
      if (data.setup_state && IN_PROGRESS.includes(data.setup_state.status)) {
        setShowWizard(true); // resume the running job's progress view
      }
    } catch (err) {
      setError(`Failed to load security status: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { loadStatus(); }, [loadStatus]);

  const runAction = async (label, path) => {
    setError(null);
    setNotice(null);
    setBusy(label);
    try {
      const res = await apiFetch(`${config.apiUrl}/api/security/${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.detail || `HTTP ${res.status}`);
      setStatus(body);
      if (path === 'duckdns/renew') {
        setNotice('Renewal started — progress appears below.');
        setShowWizard(true);
      } else {
        setNotice(`${label} done.`);
      }
      await loadStatus();
    } catch (err) {
      setError(`${label} failed: ${err.message}`);
    } finally {
      setBusy(null);
    }
  };

  if (user && !user.is_system_admin) {
    return (
      <AdminV2Layout>
        <div className="admin-v2-page">
          <div className="cfg">
            <CfgSection icon={<ShieldIcon size={16} />} title="Access Denied">
              <CfgGroup>
                <p className="cfg-empty">
                  Security settings are only available to system administrators.
                </p>
              </CfgGroup>
            </CfgSection>
          </div>
        </div>
      </AdminV2Layout>
    );
  }

  if (isLoading) {
    return (
      <AdminV2Layout>
        <div className="admin-v2-page">
          <p className="cfg-loading">Loading security status…</p>
        </div>
      </AdminV2Layout>
    );
  }

  const httpsUrl = status ? canonicalHttpsUrl(status.domain, status.public_port) : null;
  const certActive = status && (status.mode === 'duckdns' || status.mode === 'byo');

  return (
    <AdminV2Layout>
      <div className="admin-v2-page">
        <div className="cfg">
          {error && <p className="em-error" role="alert">{error}</p>}
          {notice && <p className="em-success" role="status">{notice}</p>}

          <CfgSection
            icon={<ShieldIcon size={16} />}
            title="HTTPS / Secure access"
            subtitle="A secure address encrypts your connection so health data never crosses the network in the clear."
            aside={
              <>
                {status && !status.ingress && (
                  status.mode === 'proxy'
                    ? <CfgBadge tone="live">Proxy mode</CfgBadge>
                    : status.https_active
                      ? <CfgBadge tone="ok">HTTPS on</CfgBadge>
                      : <CfgBadge>HTTPS off</CfgBadge>
                )}
                <button type="button" className="cfg-ghost" onClick={loadStatus}>
                  <RefreshIcon size={14} /> Refresh
                </button>
              </>
            }
          >
            {status?.ingress ? (
              <CfgGroup>
                <p className="cfg-note">
                  This install runs behind Home Assistant ingress, which already
                  provides HTTPS — nothing to configure here.
                </p>
              </CfgGroup>
            ) : (
              <CfgGroup>
                <div className="cfg-stats">
                  <CfgStat label="Mode" value={MODE_LABELS[status?.mode] || status?.mode} />
                  {certActive && (
                    <CfgStat
                      label="Secure address"
                      value={httpsUrl || '—'}
                      hint={status.https_error ? undefined : 'Use this anywhere you want the connection encrypted'}
                    />
                  )}
                  {certActive && (
                    <CfgStat
                      label="Certificate expires"
                      value={status?.days_until_expiry != null ? `in ${status.days_until_expiry} days` : '—'}
                      hint={status?.mode === 'duckdns' ? 'Renews automatically ~30 days before expiry' : undefined}
                    />
                  )}
                  {status?.mode === 'proxy' && (
                    <CfgStat
                      label="Proxy header trust"
                      value={status.behind_proxy ? 'Enabled' : 'Missing'}
                      hint={status.behind_proxy
                        ? `This request arrived as ${status.request_scheme}`
                        : 'Set SHH_BEHIND_PROXY=1 on the container'}
                    />
                  )}
                </div>

                {status?.https_error && (
                  <p className="em-error" role="alert">HTTPS listener problem: {status.https_error}</p>
                )}
                {status?.last_renewal_error && (
                  <p className="em-error" role="alert">Last renewal failed: {status.last_renewal_error}</p>
                )}

                <div className="cfg-actions">
                  {!showWizard && (
                    <button type="button" className="em-submit" onClick={() => setShowWizard(true)}>
                      {status?.mode === 'off' ? 'Set up HTTPS' : 'Change setup'}
                    </button>
                  )}
                  {status?.mode === 'duckdns' && (
                    <button
                      type="button"
                      className="em-cancel"
                      disabled={busy === 'Renew'}
                      onClick={() => runAction('Renew', 'duckdns/renew')}
                    >
                      {busy === 'Renew' ? 'Renewing…' : 'Renew now'}
                    </button>
                  )}
                  {status?.mode && status.mode !== 'off' && (
                    <button
                      type="button"
                      className="em-danger"
                      disabled={busy === 'Disable HTTPS'}
                      onClick={() => runAction('Disable HTTPS', 'disable')}
                    >
                      {busy === 'Disable HTTPS' ? 'Disabling…' : 'Disable'}
                    </button>
                  )}
                </div>
              </CfgGroup>
            )}
          </CfgSection>

          {showWizard && !status?.ingress && (
            <CfgSection icon={<ShieldIcon size={16} />} title="Set up HTTPS">
              <CfgGroup>
                {/* The wizard keeps its own `.tw` island for now — converting it
                    is tracked separately (it is 560 lines of its own flow). */}
                <SecuritySetupWizard onFinished={() => { setShowWizard(false); loadStatus(); }} />
              </CfgGroup>
            </CfgSection>
          )}
        </div>
      </div>
    </AdminV2Layout>
  );
};

export default AdminV2Security;
