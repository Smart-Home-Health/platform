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
import React, { useCallback, useEffect, useState } from 'react';
import AdminV2Layout from './AdminV2Layout';
import { useAuth } from '../../contexts/AuthContext';
import config, { apiFetch } from '../../config';
import SecuritySetupWizard from '../../components/SecuritySetupWizard';
import { canonicalHttpsUrl } from '../../lib/httpsSetup';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert } from '@/components/ui/alert';
import { ShieldIcon, RefreshIcon } from '../../components/Icons';
import './AdminV2.css';

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

const Stat = ({ label, value, hint }) => (
  <div className="flex flex-col gap-1 rounded-lg border border-border bg-secondary/40 p-4">
    <span className="text-xs uppercase tracking-wide text-muted-foreground">{label}</span>
    <span className="text-lg font-semibold text-foreground break-all">{value}</span>
    {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
  </div>
);

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
        <div style={{ padding: '2rem', color: 'var(--muted-foreground)', textAlign: 'center' }}>
          <h3 style={{ color: 'var(--foreground)' }}>Access Denied</h3>
          <p>Security settings are only available to system administrators.</p>
        </div>
      </AdminV2Layout>
    );
  }

  if (isLoading) {
    return (
      <AdminV2Layout>
        <div className="admin-v2-page">
          <div className="admin-v2-loading">Loading security status…</div>
        </div>
      </AdminV2Layout>
    );
  }

  const httpsUrl = status ? canonicalHttpsUrl(status.domain, status.public_port) : null;
  const certActive = status && (status.mode === 'duckdns' || status.mode === 'byo');

  return (
    <AdminV2Layout>
      <div className="admin-v2-page">
        <div className="tw space-y-6">
          {error && <Alert variant="destructive">{error}</Alert>}
          {notice && <Alert variant="success">{notice}</Alert>}

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="text-muted-foreground" aria-hidden><ShieldIcon size={22} /></span>
                  <div className="flex flex-col gap-0.5">
                    <CardTitle>HTTPS / Secure access</CardTitle>
                    <p className="text-sm text-muted-foreground">
                      A secure address enables camera scanning on phones and encrypts your connection.
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {status && !status.ingress && (
                    <Badge variant={status.https_active || status.mode === 'proxy' ? 'success' : 'muted'}>
                      {status.mode === 'proxy'
                        ? 'Proxy mode'
                        : status.https_active ? '● HTTPS on' : '○ HTTPS off'}
                    </Badge>
                  )}
                  <Button variant="secondary" onClick={loadStatus} className="gap-1.5">
                    <RefreshIcon size={16} /> Refresh
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {status?.ingress ? (
                <Alert variant="info">
                  This install runs behind Home Assistant ingress, which already
                  provides HTTPS — nothing to configure here.
                </Alert>
              ) : (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                    <Stat label="Mode" value={MODE_LABELS[status?.mode] || status?.mode} />
                    {certActive && (
                      <Stat
                        label="Secure address"
                        value={httpsUrl || '—'}
                        hint={status.https_error ? undefined : 'Use this on phones/tablets for camera features'}
                      />
                    )}
                    {certActive && (
                      <Stat
                        label="Certificate expires"
                        value={status?.days_until_expiry != null ? `in ${status.days_until_expiry} days` : '—'}
                        hint={status?.mode === 'duckdns' ? 'Renews automatically ~30 days before expiry' : undefined}
                      />
                    )}
                    {status?.mode === 'proxy' && (
                      <Stat
                        label="Proxy header trust"
                        value={status.behind_proxy ? 'Enabled' : 'Missing'}
                        hint={status.behind_proxy
                          ? `This request arrived as ${status.request_scheme}`
                          : 'Set SHH_BEHIND_PROXY=1 on the container'}
                      />
                    )}
                  </div>

                  {status?.https_error && (
                    <Alert variant="destructive">HTTPS listener problem: {status.https_error}</Alert>
                  )}
                  {status?.last_renewal_error && (
                    <Alert variant="destructive">Last renewal failed: {status.last_renewal_error}</Alert>
                  )}

                  <div className="flex flex-wrap items-center gap-2">
                    {!showWizard && (
                      <Button onClick={() => setShowWizard(true)}>
                        {status?.mode === 'off' ? 'Set up HTTPS' : 'Change setup'}
                      </Button>
                    )}
                    {status?.mode === 'duckdns' && (
                      <Button
                        variant="secondary"
                        disabled={busy === 'Renew'}
                        onClick={() => runAction('Renew', 'duckdns/renew')}
                      >
                        {busy === 'Renew' ? 'Renewing…' : 'Renew now'}
                      </Button>
                    )}
                    {status?.mode && status.mode !== 'off' && (
                      <Button
                        variant="destructive"
                        disabled={busy === 'Disable HTTPS'}
                        onClick={() => runAction('Disable HTTPS', 'disable')}
                      >
                        {busy === 'Disable HTTPS' ? 'Disabling…' : 'Disable'}
                      </Button>
                    )}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {showWizard && !status?.ingress && (
            <Card>
              <CardHeader><CardTitle>Set up HTTPS</CardTitle></CardHeader>
              <CardContent>
                <SecuritySetupWizard onFinished={() => { setShowWizard(false); loadStatus(); }} />
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </AdminV2Layout>
  );
};

export default AdminV2Security;
