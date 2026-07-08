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
// Guided HTTPS setup, shared by Configuration → Security and the first-run
// flow. Three paths: DuckDNS + Let's Encrypt (guided, recommended), an
// external reverse proxy, or uploading an existing certificate. Self-contained
// (.tw root) so it renders correctly outside the admin-v2 shell too.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import config, { apiFetch } from '../config';
import { canonicalHttpsUrl } from '../lib/httpsSetup';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import {
  ShieldIcon, KeyIcon, WifiIcon, CheckIcon, InfoIcon, RefreshIcon, BackArrowIcon,
} from './Icons';

const PROGRESS_STATUSES = [
  'queued', 'validating_token', 'setting_dns', 'waiting_dns',
  'requesting_cert', 'finalizing',
];

const STEP_SEQUENCE = [
  ['validating_token', 'Checking your DuckDNS token'],
  ['setting_dns', 'Publishing the verification DNS record'],
  ['waiting_dns', 'Waiting for DNS to update (can take 1–5 minutes)'],
  ['requesting_cert', "Requesting the certificate from Let's Encrypt"],
  ['finalizing', 'Finalizing and installing the certificate'],
];

const ERROR_HELP = {
  bad_token: 'Double-check the subdomain and token on duckdns.org — the token is the long string shown at the top of your DuckDNS account page.',
  dns_timeout: 'DNS was slow to update. This usually resolves itself — wait a few minutes and try again.',
  acme_rate_limited: "Let's Encrypt limits how often the same certificate can be issued (5 per week). Wait before retrying.",
  network_error: 'The server could not reach DuckDNS or Let’s Encrypt. Check the internet connection and try again.',
  acme_error: 'Let’s Encrypt reported a problem. The full message below may help.',
  internal: 'Something unexpected went wrong. The full message below may help.',
};

const api = (path) => `${config.apiUrl}/api/security${path}`;

const PathCard = ({ icon: Icon, title, badge, description, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className="flex w-full items-start gap-3 rounded-lg border border-border bg-secondary/40 p-4 text-left transition-colors hover:border-primary hover:bg-secondary"
  >
    <span className="mt-0.5 text-muted-foreground" aria-hidden>{Icon && <Icon size={22} />}</span>
    <span className="flex flex-col gap-1">
      <span className="flex items-center gap-2 font-medium text-foreground">
        {title}
        {badge && <Badge variant="info">{badge}</Badge>}
      </span>
      <span className="text-sm text-muted-foreground">{description}</span>
    </span>
  </button>
);

const DnsRebindNotice = () => (
  <Alert variant="info">
    <strong>If the new address doesn't load:</strong> some routers block public
    names that point at home-network addresses ("DNS rebind protection"). Look
    for that setting in your router and allow <code>duckdns.org</code>, or keep
    using the regular HTTP address on devices where it happens.
  </Alert>
);

const SuccessCard = ({ url, onDone, doneLabel }) => (
  <div className="space-y-4">
    <Alert variant="success">
      <span className="flex items-center gap-2">
        <CheckIcon size={18} />
        HTTPS is set up. Your secure address is ready.
      </span>
    </Alert>
    {url && (
      <div className="rounded-lg border border-border bg-secondary/40 p-4 text-center">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">Secure address</div>
        <a href={url} target="_blank" rel="noreferrer" className="text-lg font-semibold text-primary break-all">{url}</a>
        <p className="mt-2 text-sm text-muted-foreground">
          Use this address on phones and tablets — the camera features need it.
          You can keep using the regular address for everything else.
        </p>
      </div>
    )}
    <DnsRebindNotice />
    {onDone && <Button onClick={onDone}>{doneLabel || 'Done'}</Button>}
  </div>
);

const SecuritySetupWizard = ({ onFinished }) => {
  const [step, setStep] = useState('choose');
  const [status, setStatus] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  // DuckDNS form
  const [subdomain, setSubdomain] = useState('');
  const [token, setToken] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [staging, setStaging] = useState(false);
  const [publicPort, setPublicPort] = useState('8443');

  // Progress
  const [jobState, setJobState] = useState(null);
  const pollRef = useRef(null);

  const loadStatus = useCallback(async () => {
    const res = await apiFetch(api('/status'));
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    setStatus(data);
    setPublicPort(String(data.public_port || 8443));
    return data;
  }, []);

  useEffect(() => {
    loadStatus().then((data) => {
      // Resume a job that is still running (e.g. after a page reload).
      if (data?.setup_state && PROGRESS_STATUSES.includes(data.setup_state.status)) {
        setJobState(data.setup_state);
        setStep('duckdns-progress');
      }
    }).catch(() => {});
  }, [loadStatus]);

  // Poll the issuance job while on the progress step.
  useEffect(() => {
    if (step !== 'duckdns-progress') {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
      return undefined;
    }
    const poll = async () => {
      try {
        const res = await apiFetch(api('/duckdns/setup'));
        if (!res.ok) return;
        const { setup_state: s } = await res.json();
        setJobState(s);
        if (s && s.status === 'issued') {
          await loadStatus();
          setStep('duckdns-success');
        } else if (s && s.status === 'failed') {
          setStep('duckdns');
          setError(s);
        }
      } catch {
        /* transient poll errors are fine */
      }
    };
    poll();
    pollRef.current = setInterval(poll, 2000);
    return () => { clearInterval(pollRef.current); pollRef.current = null; };
  }, [step, loadStatus]);

  const postJson = async (path, body) => {
    const res = await apiFetch(api(path), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {}),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.detail || `HTTP ${res.status}`);
    return data;
  };

  const startDuckdns = async (e) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const portNum = Number(publicPort) || 8443;
      if (status && portNum !== status.public_port) {
        await postJson('/public-port', { port: portNum });
      }
      await postJson('/duckdns/setup', { subdomain, token, staging });
      setJobState({ status: 'queued' });
      setStep('duckdns-progress');
    } catch (err) {
      setError({ error: err.message, error_code: null });
    } finally {
      setBusy(false);
    }
  };

  const enableProxy = async () => {
    setError(null);
    setBusy(true);
    try {
      const data = await postJson('/proxy', { enabled: true });
      setStatus(data);
      setStep('proxy-status');
    } catch (err) {
      setError({ error: err.message, error_code: null });
    } finally {
      setBusy(false);
    }
  };

  const uploadByo = async (e) => {
    e.preventDefault();
    setError(null);
    const form = e.target;
    const fullchain = form.elements.fullchain.files[0];
    const privkey = form.elements.privkey.files[0];
    if (!fullchain || !privkey) {
      setError({ error: 'Choose both the certificate chain and the private key file.', error_code: null });
      return;
    }
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append('fullchain', fullchain);
      fd.append('privkey', privkey);
      const res = await apiFetch(api('/byo-cert'), { method: 'POST', body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || `HTTP ${res.status}`);
      setStatus(data);
      setStep('byo-success');
    } catch (err) {
      setError({ error: err.message, error_code: null });
    } finally {
      setBusy(false);
    }
  };

  const backToChoose = () => { setError(null); setStep('choose'); };

  const httpsUrl = status ? canonicalHttpsUrl(status.domain, status.public_port) : null;

  if (status?.ingress) {
    return (
      <div className="tw">
        <Alert variant="info">
          This install runs inside Home Assistant, which already provides a
          secure (HTTPS) connection — there is nothing to set up here.
        </Alert>
      </div>
    );
  }

  const errorBox = error && (
    <Alert variant="destructive" data-testid="wizard-error">
      <div className="space-y-1">
        {error.error_code && ERROR_HELP[error.error_code] && <div>{ERROR_HELP[error.error_code]}</div>}
        <div className="text-sm opacity-90">{error.error}</div>
      </div>
    </Alert>
  );

  return (
    <div className="tw space-y-4" data-testid="security-wizard">
      {step === 'choose' && (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            A secure (HTTPS) address lets phones and tablets use the camera for
            barcode and document scanning, and keeps your connection encrypted.
            Pick the option that fits:
          </p>
          <PathCard
            icon={ShieldIcon}
            title="Free secure address with DuckDNS"
            badge="Recommended"
            description="Get a free name like myhome.duckdns.org and a trusted certificate, automatically renewed. No router changes needed — takes about 5 minutes."
            onClick={() => { setError(null); setStep('duckdns'); }}
          />
          <PathCard
            icon={WifiIcon}
            title="I already use a reverse proxy"
            description="Traefik, nginx, Caddy or similar terminates HTTPS in front of this app. Shows the settings the app needs."
            onClick={() => { setError(null); setStep('proxy'); }}
          />
          <PathCard
            icon={KeyIcon}
            title="Upload my own certificate"
            description="You already have a certificate and private key for a domain that points at this server."
            onClick={() => { setError(null); setStep('byo'); }}
          />
        </div>
      )}

      {step === 'duckdns' && (
        <form onSubmit={startDuckdns} className="space-y-4">
          {errorBox}
          <div className="rounded-lg border border-border bg-secondary/40 p-4 text-sm text-muted-foreground space-y-2">
            <p className="font-medium text-foreground">Before you start (2 minutes):</p>
            <ol className="list-decimal space-y-1 pl-5">
              <li>Go to <a className="text-primary" href="https://www.duckdns.org" target="_blank" rel="noreferrer">duckdns.org</a> and sign in (Google/GitHub works).</li>
              <li>Create a subdomain — this becomes your secure address.</li>
              <li>Copy the <strong>token</strong> shown at the top of the page.</li>
            </ol>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground" htmlFor="duckdns-subdomain">DuckDNS subdomain</label>
            <div className="flex items-center gap-2">
              <Input
                id="duckdns-subdomain"
                value={subdomain}
                onChange={(e) => setSubdomain(e.target.value)}
                placeholder="myhome"
                required
              />
              <span className="whitespace-nowrap text-sm text-muted-foreground">.duckdns.org</span>
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground" htmlFor="duckdns-token">DuckDNS token</label>
            <Input
              id="duckdns-token"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="e.g. 6a7b8c9d-1234-5678-9abc-def012345678"
              required
            />
          </div>
          <button
            type="button"
            className="text-sm text-muted-foreground underline"
            onClick={() => setShowAdvanced((v) => !v)}
          >
            {showAdvanced ? 'Hide advanced options' : 'Advanced options'}
          </button>
          {showAdvanced && (
            <div className="space-y-3 rounded-lg border border-border p-4">
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground" htmlFor="https-port">Published HTTPS port</label>
                <Input
                  id="https-port"
                  type="number"
                  min="1"
                  max="65535"
                  value={publicPort}
                  onChange={(e) => setPublicPort(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  The port your secure address uses (APP_HTTPS_PORT in Docker; 443 gives a portless URL).
                </p>
              </div>
              <label className="flex items-center gap-2 text-sm text-foreground">
                <input
                  type="checkbox"
                  checked={staging}
                  onChange={(e) => setStaging(e.target.checked)}
                />
                Use Let&apos;s Encrypt staging (test certificate, not trusted by browsers)
              </label>
            </div>
          )}
          <div className="flex items-center gap-2">
            <Button type="button" variant="secondary" onClick={backToChoose} className="gap-1.5">
              <BackArrowIcon size={16} /> Back
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? 'Starting…' : 'Get my certificate'}
            </Button>
          </div>
        </form>
      )}

      {step === 'duckdns-progress' && (
        <div className="space-y-3" data-testid="duckdns-progress">
          <p className="text-sm text-muted-foreground">
            Setting up your certificate — this normally takes a few minutes.
            You can leave this page; setup continues in the background.
          </p>
          <ul className="space-y-2">
            {STEP_SEQUENCE.map(([key, label]) => {
              const currentIdx = PROGRESS_STATUSES.indexOf(jobState?.status || 'queued');
              const stepIdx = PROGRESS_STATUSES.indexOf(key);
              const state = currentIdx > stepIdx ? 'done' : currentIdx === stepIdx ? 'active' : 'pending';
              return (
                <li key={key} className="flex items-center gap-2 text-sm">
                  {state === 'done' && <span className="text-primary"><CheckIcon size={16} /></span>}
                  {state === 'active' && <span className="text-muted-foreground animate-pulse"><RefreshIcon size={16} /></span>}
                  {state === 'pending' && <span className="inline-block h-4 w-4 rounded-full border border-border" aria-hidden />}
                  <span className={state === 'pending' ? 'text-muted-foreground' : 'text-foreground'}>{label}</span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {step === 'duckdns-success' && (
        <SuccessCard url={httpsUrl} onDone={onFinished} doneLabel="Finish" />
      )}

      {step === 'proxy' && (
        <div className="space-y-4">
          {errorBox}
          <p className="text-sm text-muted-foreground">
            Keep this app on plain HTTP and let your proxy terminate TLS. Two
            things to configure:
          </p>
          <div className="space-y-1.5">
            <div className="text-sm font-medium text-foreground">1. Tell the app to trust the proxy&apos;s headers</div>
            <pre className="overflow-x-auto rounded-lg border border-border bg-secondary/40 p-3 text-xs"><code>{`# environment for the app container
SHH_BEHIND_PROXY: "1"
# optionally restrict which proxy IPs are trusted (default: all)
# FORWARDED_ALLOW_IPS: "172.18.0.2"`}</code></pre>
          </div>
          <div className="space-y-1.5">
            <div className="text-sm font-medium text-foreground">2. Route your proxy to the app (Traefik example)</div>
            <pre className="overflow-x-auto rounded-lg border border-border bg-secondary/40 p-3 text-xs"><code>{`labels:
  - traefik.enable=true
  - traefik.http.routers.shh.rule=Host(\`hub.example.com\`)
  - traefik.http.routers.shh.entrypoints=websecure
  - traefik.http.routers.shh.tls.certresolver=letsencrypt
  - traefik.http.services.shh.loadbalancer.server.port=8000`}</code></pre>
          </div>
          <p className="text-sm text-muted-foreground">
            WebSockets are used on <code>/ws</code> and <code>/api/readers/ws</code> —
            Traefik and Caddy proxy them automatically; for nginx add the
            usual <code>Upgrade</code>/<code>Connection</code> headers.
          </p>
          <div className="flex items-center gap-2">
            <Button type="button" variant="secondary" onClick={backToChoose} className="gap-1.5">
              <BackArrowIcon size={16} /> Back
            </Button>
            <Button onClick={enableProxy} disabled={busy}>
              {busy ? 'Saving…' : "I've configured my proxy"}
            </Button>
          </div>
        </div>
      )}

      {step === 'proxy-status' && status && (
        <div className="space-y-3" data-testid="proxy-checklist">
          <Alert variant="success">Reverse-proxy mode is on.</Alert>
          <ul className="space-y-2 text-sm">
            <li className="flex items-center gap-2">
              {status.behind_proxy
                ? <span className="text-primary"><CheckIcon size={16} /></span>
                : <span className="text-destructive"><InfoIcon size={16} /></span>}
              <span>
                {status.behind_proxy
                  ? 'SHH_BEHIND_PROXY is set — the app trusts the proxy’s headers.'
                  : 'SHH_BEHIND_PROXY is NOT set on the container yet. Add it and restart, or secure cookies and client addresses won’t work correctly.'}
              </span>
            </li>
            <li className="flex items-center gap-2">
              {window.location.protocol === 'https:'
                ? <span className="text-primary"><CheckIcon size={16} /></span>
                : <span className="text-muted-foreground"><InfoIcon size={16} /></span>}
              <span>
                {window.location.protocol === 'https:'
                  ? 'You are viewing this page over HTTPS through the proxy.'
                  : 'Open the app through your proxy’s HTTPS address to finish checking.'}
              </span>
            </li>
          </ul>
          {onFinished && <Button onClick={onFinished}>Finish</Button>}
        </div>
      )}

      {step === 'byo' && (
        <form onSubmit={uploadByo} className="space-y-4">
          {errorBox}
          <p className="text-sm text-muted-foreground">
            Upload a PEM certificate chain (<code>fullchain.pem</code>) and its
            unencrypted private key (<code>privkey.pem</code>). The domain on the
            certificate must point at this server.
          </p>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground" htmlFor="byo-fullchain">Certificate chain</label>
            <Input id="byo-fullchain" name="fullchain" type="file" accept=".pem,.crt,.cer" />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground" htmlFor="byo-privkey">Private key</label>
            <Input id="byo-privkey" name="privkey" type="file" accept=".pem,.key" />
          </div>
          <div className="flex items-center gap-2">
            <Button type="button" variant="secondary" onClick={backToChoose} className="gap-1.5">
              <BackArrowIcon size={16} /> Back
            </Button>
            <Button type="submit" disabled={busy}>{busy ? 'Uploading…' : 'Install certificate'}</Button>
          </div>
        </form>
      )}

      {step === 'byo-success' && (
        <SuccessCard url={httpsUrl} onDone={onFinished} doneLabel="Finish" />
      )}
    </div>
  );
};

export default SecuritySetupWizard;
