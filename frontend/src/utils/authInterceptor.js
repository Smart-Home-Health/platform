/*
 * Smart Home Health Hub
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

// Pull the path out of whatever the first fetch() arg is (string, URL, Request).
function getRequestPath(input) {
  try {
    const url = typeof input === 'string' ? input : input?.url ?? String(input);
    return new URL(url, window.location.origin).pathname;
  } catch {
    return '';
  }
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
    const response = await originalFetch(...args);

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
