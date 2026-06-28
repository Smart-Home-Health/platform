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

/**
 * Global stale-JWT handler.
 *
 * Monkeypatches window.fetch once so EVERY request (apiFetch, authFetch, raw
 * fetch in services/pages) is covered. When a request comes back with a status
 * that means "your session is no longer good enough", it fires onStale() which
 * re-checks the session and lets ProtectedRoute re-route to the correct flow:
 *   - 401: both session_token and account_token expired -> back to /login.
 *   - 403 while authLevel === 'full': the 30-min session_token expired but the
 *     24h account_token is still valid, so the request was silently downgraded
 *     to account level and full-auth endpoints now 403. Recovery drops the
 *     client to account level -> admin routes go to /select-user, /live stays.
 *
 * Loop prevention:
 *   - /api/auth/* is always passed through (login, session, logout, lock,
 *     access...) — these are the recovery/public endpoints; reacting to them
 *     would cause redirect storms.
 *   - Single-flight + short debounce so a burst of failing requests triggers
 *     exactly one recovery cycle.
 *   - We only act when getAuthLevel() reports we currently think we're
 *     authenticated; once dropped to 'account'/null, further 403s are ignored.
 */

const RECOVERY_DEBOUNCE_MS = 1000;

let installed = false;

// Detect a cross-origin iframe (e.g. Home Assistant embedding). Same idiom as
// config.js (_isIframe) and AuthContext (isIframe). Computed once at load.
const isIframe = (() => {
  try { return window.self !== window.top; } catch { return true; }
})();

// Pull the path out of whatever the first fetch() arg is (string, URL, Request).
function getRequestPath(input) {
  try {
    const url = typeof input === 'string' ? input : input?.url ?? String(input);
    return new URL(url, window.location.origin).pathname;
  } catch {
    return '';
  }
}

// True only for same-origin requests, so we never attach the auth token to an
// external host.
function isSameOrigin(input) {
  try {
    const url = typeof input === 'string' ? input : input?.url ?? String(input);
    return new URL(url, window.location.origin).origin === window.location.origin;
  } catch {
    return false;
  }
}

// True if the caller already set an Authorization header (authFetch/apiFetch do),
// so we don't clobber it. Handles plain-object and Headers-instance init.headers.
function hasAuthHeader(init) {
  const headers = init?.headers;
  if (!headers) return false;
  if (typeof Headers !== 'undefined' && headers instanceof Headers) {
    return headers.has('Authorization');
  }
  return Object.keys(headers).some((k) => k.toLowerCase() === 'authorization');
}

// In a cross-origin iframe the SameSite session cookies are blocked, so attach
// the stored JWT as a Bearer header for same-origin requests. Returns possibly
// new fetch args; leaves args untouched outside the iframe (cookie auth path).
// Note: only the (url|URL, init) form is handled — Request inputs (which carry
// their own headers) are not used by this app's data fetches and pass through.
function withIframeAuth(args) {
  if (!isIframe) return args;
  const [input, init] = args;
  if (input instanceof Request) return args;
  if (!isSameOrigin(input) || hasAuthHeader(init)) return args;

  const token = sessionStorage.getItem('auth_token');
  if (!token) return args;

  const nextInit = { ...(init || {}) };
  if (typeof Headers !== 'undefined' && nextInit.headers instanceof Headers) {
    const merged = new Headers(nextInit.headers);
    merged.set('Authorization', `Bearer ${token}`);
    nextInit.headers = merged;
  } else {
    nextInit.headers = { ...nextInit.headers, Authorization: `Bearer ${token}` };
  }
  return [input, nextInit];
}

// Only the AuthenticationMiddleware's rejection carries `requires_auth: true`.
// An endpoint-level restriction (e.g. a read_restricted session) also 401s, but
// with a plain `{detail: "Not authenticated"}` body and must NOT trigger
// recovery — otherwise a normal restricted /live session would loop.
async function isMiddlewareAuthFailure(response) {
  try {
    const body = await response.clone().json();
    return body?.requires_auth === true;
  } catch {
    return false;
  }
}

export function installAuthInterceptor({ getAuthLevel, onStale }) {
  if (installed) return;
  installed = true;

  const originalFetch = window.fetch.bind(window);
  let handling = false;

  const triggerRecovery = () => {
    if (handling) return;
    handling = true;
    Promise.resolve()
      .then(() => onStale())
      .catch((err) => console.error('Auth recovery failed:', err))
      .finally(() => {
        // Brief debounce so concurrent failures collapse into one cycle.
        setTimeout(() => { handling = false; }, RECOVERY_DEBOUNCE_MS);
      });
  };

  window.fetch = async (...args) => {
    // Attach the Bearer header when embedded so raw fetch() data calls (which
    // rely on cookies) still authenticate in a cross-origin iframe.
    const response = await originalFetch(...withIframeAuth(args));

    const path = getRequestPath(args[0]);
    // Never react to the auth endpoints themselves (recovery + public probes).
    if (path.startsWith('/api/auth/')) return response;

    const authLevel = getAuthLevel();

    if (response.status === 401) {
      // Both tokens expired -> middleware rejection (requires_auth). A plain
      // restricted-read 401 is a valid session and is ignored here.
      if (await isMiddlewareAuthFailure(response)) triggerRecovery();
    } else if (response.status === 403 && authLevel === 'full') {
      // session_token expired but account_token still valid: the request was
      // silently downgraded to account level and a full-auth endpoint 403'd.
      triggerRecovery();
    }

    return response;
  };
}
