# Smart Home Health Hub
# Copyright (C) 2026 John Carty
#
# This program is free software: you can redistribute it and/or modify
# it under the terms of the GNU Affero General Public License as published by
# the Free Software Foundation, either version 3 of the License, or
# (at your option) any later version.
#
# This program is distributed in the hope that it will be useful,
# but WITHOUT ANY WARRANTY; without even the implied warranty of
# MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
# GNU Affero General Public License for more details.
#
# You should have received a copy of the GNU Affero General Public License
# along with this program.  If not, see <https://www.gnu.org/licenses/>.
"""Wave 5 — per-IP auth rate limiting. The harness disables it globally
(RATE_LIMIT_ENABLED=false); here we flip it on for the middleware and hammer a
public auth endpoint to prove the 429 + Retry-After response."""

import pytest

import rate_limit

# /api/auth/verify-pin is public and capped at 5/min — the lowest specific cap.
PIN_PATH = "/api/auth/verify-pin"
PIN_BODY = {"user_id": 999999, "pin": "0000"}


@pytest.fixture
def rate_limiting_on(monkeypatch):
    monkeypatch.setattr(rate_limit, "RATE_LIMIT_ENABLED", True)
    # The block path writes an audit row via its own SessionLocal() — neutralize
    # it so the test transaction stays clean.
    monkeypatch.setattr(rate_limit, "_audit_block", lambda *a, **k: None)
    rate_limit._hits.clear()
    yield
    rate_limit._hits.clear()


def test_auth_endpoint_rate_limited(client, rate_limiting_on):
    statuses = [client.post(PIN_PATH, json=PIN_BODY).status_code for _ in range(12)]
    assert 429 in statuses, statuses
    # The 429 must arrive only after the allowed burst, and carry Retry-After.
    first_block = statuses.index(429)
    assert first_block >= 5
    blocked = client.post(PIN_PATH, json=PIN_BODY)
    assert blocked.status_code == 429
    assert int(blocked.headers["Retry-After"]) >= 1


def test_no_limit_when_disabled(client):
    """With the harness default (disabled), the same burst is never throttled."""
    rate_limit._hits.clear()
    statuses = [client.post(PIN_PATH, json=PIN_BODY).status_code for _ in range(12)]
    assert 429 not in statuses
