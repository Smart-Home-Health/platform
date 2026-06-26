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
"""Wave 4 — Frigate live proxy SSRF guard.

The live-segment proxy will only fetch URLs under the patient's configured
Frigate base URL; anything else is refused with 403 *before* any upstream
request is made (so these tests never touch the network)."""

from datetime import datetime, timezone

import pytest

BASE = "http://frigate.local:5000"
SEG = f"/api/integrations/frigate/patient/{{pid}}/live-seg"


@pytest.fixture
def frigate_integration(db_session, patient, account):
    from schemas.integration import Integration, PatientIntegration
    now = datetime.now(timezone.utc)
    integ = Integration(name="Frigate NVR", slug="frigate", auth_type="local",
                        is_active=True, created_at=now, updated_at=now)
    db_session.add(integ)
    db_session.flush()
    pi = PatientIntegration(
        account_id=account.id, patient_id=patient.id, integration_id=integ.id,
        is_enabled=True, credentials={"base_url": BASE},
        created_at=now, updated_at=now,
    )
    db_session.add(pi)
    db_session.flush()
    return pi


def test_foreign_upstream_url_refused(admin_client, patient, frigate_integration):
    resp = admin_client.get(SEG.format(pid=patient.id),
                            params={"u": "http://evil.example.com/secret"})
    assert resp.status_code == 403
    assert resp.json()["detail"] == "Upstream URL not allowed"


def test_base_url_prefix_spoof_refused(admin_client, patient, frigate_integration):
    """A URL that merely starts with the base host but isn't under base+'/'
    (e.g. a look-alike host) is still refused."""
    resp = admin_client.get(SEG.format(pid=patient.id),
                            params={"u": BASE + ".attacker.com/x.ts"})
    assert resp.status_code == 403


def test_404_when_no_frigate_configured(admin_client, patient):
    """No Frigate integration for this patient -> 404 (guard never reached)."""
    resp = admin_client.get(SEG.format(pid=patient.id),
                            params={"u": "http://whatever/x"})
    assert resp.status_code == 404


def test_requires_full_auth(account_client, patient):
    resp = account_client.get(SEG.format(pid=patient.id), params={"u": BASE})
    assert resp.status_code == 403


def test_requires_auth(client):
    assert client.get(SEG.format(pid=1), params={"u": BASE}).status_code == 401
