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
// (own sw-* stylesheet + em-* vocabulary) so it renders correctly outside the
// admin-v2 shell too.
import { useCallback, useEffect, useRef, useState } from 'react';
import config, { apiFetch } from '../config';
import { canonicalHttpsUrl, generateSubdomain } from '../lib/httpsSetup';
import './vc/entity-card.css';
import './security-wizard.css';
import {
  ShieldIcon, KeyIcon, WifiIcon, CheckIcon, InfoIcon, RefreshIcon, BackArrowIcon,
  CopyIcon,
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

// navigator.clipboard needs a secure context — which this wizard, by its very
// purpose, usually doesn't have yet. Fall back to the textarea trick.
async function copyText(text) {
  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch { /* fall through */ }
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

const PathCard = ({ icon: Icon, title, badge, description, onClick }) => (
  <button type="button" onClick={onClick} className="sw-path">
    <span className="sw-path-icon" aria-hidden>{Icon && <Icon size={22} />}</span>
    <span className="sw-path-body">
      <span className="sw-path-title">
        {title}
        {badge && <span className="sw-badge">{badge}</span>}
      </span>
      <span className="sw-path-desc">{description}</span>
    </span>
  </button>
);

const DnsRebindNotice = () => (
  <p className="sw-note">
    <strong>If the new address doesn&apos;t load:</strong> some routers block public
    names that point at home-network addresses (&quot;DNS rebind protection&quot;). Look
    for that setting in your router and allow <code>duckdns.org</code>, or keep
    using the regular HTTP address on devices where it happens.
  </p>
);

const SuccessCard = ({ url, onDone, doneLabel }) => (
  <div className="sw-stack">
    <div className="em-success" role="status">
      HTTPS is set up. Your secure address is ready.
    </div>
    {url && (
      <div className="sw-addr">
        <div className="sw-addr-label">Secure address</div>
        <a href={url} target="_blank" rel="noreferrer">{url}</a>
        <p>
          Use this address anywhere you want the connection encrypted — phones,
          tablets, or away from home. The regular address keeps working too.
        </p>
      </div>
    )}
    <DnsRebindNotice />
    {onDone && (
      <div className="sw-actions">
        <button type="button" className="em-submit" onClick={onDone}>{doneLabel || 'Done'}</button>
      </div>
    )}
  </div>
);

const SecuritySetupWizard = ({ onFinished }) => {
  const [step, setStep] = useState('choose');
  const [status, setStatus] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  // DuckDNS form — prefilled with a valid random name the user can copy
  // into duckdns.org instead of typing one (phone keyboards mangle these).
  const [subdomain, setSubdomain] = useState(generateSubdomain);
  const [token, setToken] = useState('');
  const [copied, setCopied] = useState(false);
  const copyTimerRef = useRef(null);
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

  const copySubdomain = async () => {
    if (await copyText(subdomain.trim())) {
      setCopied(true);
      clearTimeout(copyTimerRef.current);
      copyTimerRef.current = setTimeout(() => setCopied(false), 2000);
    }
  };

  useEffect(() => () => clearTimeout(copyTimerRef.current), []);

  const httpsUrl = status ? canonicalHttpsUrl(status.domain, status.public_port) : null;

  if (status?.ingress) {
    return (
      <p className="sw-note">
        This install runs inside Home Assistant, which already provides a
        secure (HTTPS) connection — there is nothing to set up here.
      </p>
    );
  }

  const errorBox = error && (
    <div className="em-error" role="alert" data-testid="wizard-error">
      {error.error_code && ERROR_HELP[error.error_code] && <div>{ERROR_HELP[error.error_code]}</div>}
      <div>{error.error}</div>
    </div>
  );

  return (
    <div className="sw" data-testid="security-wizard">
      {step === 'choose' && (
        <div className="sw-stack">
          <p className="sw-path-desc">
            A secure (HTTPS) address keeps your connection encrypted, so health
            data never crosses the network in the clear. Pick the option that
            fits:
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
        <form onSubmit={startDuckdns} className="sw-stack">
          {errorBox}
          <div className="sw-note">
            <p className="sw-strong" style={{ margin: 0 }}>Before you start (2 minutes):</p>
            <ol>
              <li>Go to <a className="sw-link" href="https://www.duckdns.org" target="_blank" rel="noreferrer">duckdns.org</a> and sign in (Google/GitHub works).</li>
              <li>
                Add a subdomain — use the suggested name below (tap Copy, then
                paste it there) or pick your own. It becomes your secure address.
              </li>
              <li>Copy the <strong>token</strong> shown at the top of the page.</li>
            </ol>
          </div>
          <div className="sw-field">
            <label className="em-label" htmlFor="duckdns-subdomain">DuckDNS subdomain</label>
            <div className="sw-field-row">
              <input
                id="duckdns-subdomain"
                className="em-input"
                value={subdomain}
                onChange={(e) => setSubdomain(e.target.value)}
                placeholder="myhome"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                required
              />
              <span className="sw-suffix">.duckdns.org</span>
              <button
                type="button"
                className="em-cancel"
                onClick={copySubdomain}
                aria-label="Copy subdomain"
              >
                {copied ? <CheckIcon size={16} /> : <CopyIcon size={16} />}
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
          </div>
          <div className="sw-field">
            <label className="em-label" htmlFor="duckdns-token">DuckDNS token</label>
            <input
              id="duckdns-token"
              className="em-input"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="e.g. 6a7b8c9d-1234-5678-9abc-def012345678"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              required
            />
          </div>
          <button
            type="button"
            className="sw-linklike"
            onClick={() => setShowAdvanced((v) => !v)}
          >
            {showAdvanced ? 'Hide advanced options' : 'Advanced options'}
          </button>
          {showAdvanced && (
            <div className="sw-advanced">
              <div className="sw-field">
                <label className="em-label" htmlFor="https-port">Published HTTPS port</label>
                <input
                  id="https-port"
                  className="em-input"
                  type="number"
                  min="1"
                  max="65535"
                  value={publicPort}
                  onChange={(e) => setPublicPort(e.target.value)}
                />
                <p className="em-hint">
                  The port your secure address uses (APP_HTTPS_PORT in Docker; 443 gives a portless URL).
                </p>
              </div>
              <label className="em-check-row">
                <input
                  type="checkbox"
                  className="em-check"
                  checked={staging}
                  onChange={(e) => setStaging(e.target.checked)}
                />
                <span className="em-check-label">
                  Use Let&apos;s Encrypt staging (test certificate, not trusted by browsers)
                </span>
              </label>
            </div>
          )}
          <div className="sw-actions">
            <button type="button" className="em-cancel" onClick={backToChoose}>
              <BackArrowIcon size={16} /> Back
            </button>
            <button type="submit" className="em-submit" disabled={busy}>
              {busy ? 'Starting…' : 'Get my certificate'}
            </button>
          </div>
        </form>
      )}

      {step === 'duckdns-progress' && (
        <div className="sw-stack" data-testid="duckdns-progress">
          <p className="sw-path-desc">
            Setting up your certificate — this normally takes a few minutes.
            You can leave this page; setup continues in the background.
          </p>
          <ul className="sw-steps">
            {STEP_SEQUENCE.map(([key, label]) => {
              const currentIdx = PROGRESS_STATUSES.indexOf(jobState?.status || 'queued');
              const stepIdx = PROGRESS_STATUSES.indexOf(key);
              const state = currentIdx > stepIdx ? 'done' : currentIdx === stepIdx ? 'active' : 'pending';
              return (
                <li key={key} data-state={state}>
                  {state === 'done' && <span className="sw-step-done"><CheckIcon size={16} /></span>}
                  {state === 'active' && <span className="sw-step-active"><RefreshIcon size={16} /></span>}
                  {state === 'pending' && <span className="sw-step-pending" aria-hidden />}
                  <span>{label}</span>
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
        <div className="sw-stack">
          {errorBox}
          <p className="sw-path-desc">
            Keep this app on plain HTTP and let your proxy terminate TLS. Two
            things to configure:
          </p>
          <div className="sw-field">
            <div className="em-label">1. Tell the app to trust the proxy&apos;s headers</div>
            <pre className="sw-pre"><code>{`# environment for the app container
SHH_BEHIND_PROXY: "1"
# optionally restrict which proxy IPs are trusted (default: all)
# FORWARDED_ALLOW_IPS: "172.18.0.2"`}</code></pre>
          </div>
          <div className="sw-field">
            <div className="em-label">2. Route your proxy to the app (Traefik example)</div>
            <pre className="sw-pre"><code>{`labels:
  - traefik.enable=true
  - traefik.http.routers.shh.rule=Host(\`hub.example.com\`)
  - traefik.http.routers.shh.entrypoints=websecure
  - traefik.http.routers.shh.tls.certresolver=letsencrypt
  - traefik.http.services.shh.loadbalancer.server.port=8000`}</code></pre>
          </div>
          <p className="sw-path-desc">
            WebSockets are used on <code>/ws</code> and <code>/api/readers/ws</code> —
            Traefik and Caddy proxy them automatically; for nginx add the
            usual <code>Upgrade</code>/<code>Connection</code> headers.
          </p>
          <div className="sw-actions">
            <button type="button" className="em-cancel" onClick={backToChoose}>
              <BackArrowIcon size={16} /> Back
            </button>
            <button type="button" className="em-submit" onClick={enableProxy} disabled={busy}>
              {busy ? 'Saving…' : "I've configured my proxy"}
            </button>
          </div>
        </div>
      )}

      {step === 'proxy-status' && status && (
        <div className="sw-stack" data-testid="proxy-checklist">
          <div className="em-success" role="status">Reverse-proxy mode is on.</div>
          <ul className="sw-checks">
            <li>
              {status.behind_proxy
                ? <span className="sw-check-ok"><CheckIcon size={16} /></span>
                : <span className="sw-check-warn"><InfoIcon size={16} /></span>}
              <span>
                {status.behind_proxy
                  ? 'SHH_BEHIND_PROXY is set — the app trusts the proxy’s headers.'
                  : 'SHH_BEHIND_PROXY is NOT set on the container yet. Add it and restart, or secure cookies and client addresses won’t work correctly.'}
              </span>
            </li>
            <li>
              {window.location.protocol === 'https:'
                ? <span className="sw-check-ok"><CheckIcon size={16} /></span>
                : <span className="sw-check-dim"><InfoIcon size={16} /></span>}
              <span>
                {window.location.protocol === 'https:'
                  ? 'You are viewing this page over HTTPS through the proxy.'
                  : 'Open the app through your proxy’s HTTPS address to finish checking.'}
              </span>
            </li>
          </ul>
          {onFinished && (
            <div className="sw-actions">
              <button type="button" className="em-submit" onClick={onFinished}>Finish</button>
            </div>
          )}
        </div>
      )}

      {step === 'byo' && (
        <form onSubmit={uploadByo} className="sw-stack">
          {errorBox}
          <p className="sw-path-desc">
            Upload a PEM certificate chain (<code>fullchain.pem</code>) and its
            unencrypted private key (<code>privkey.pem</code>). The domain on the
            certificate must point at this server.
          </p>
          <div className="sw-field">
            <label className="em-label" htmlFor="byo-fullchain">Certificate chain</label>
            <input id="byo-fullchain" className="em-input" name="fullchain" type="file" accept=".pem,.crt,.cer" />
          </div>
          <div className="sw-field">
            <label className="em-label" htmlFor="byo-privkey">Private key</label>
            <input id="byo-privkey" className="em-input" name="privkey" type="file" accept=".pem,.key" />
          </div>
          <div className="sw-actions">
            <button type="button" className="em-cancel" onClick={backToChoose}>
              <BackArrowIcon size={16} /> Back
            </button>
            <button type="submit" className="em-submit" disabled={busy}>
              {busy ? 'Uploading…' : 'Install certificate'}
            </button>
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
