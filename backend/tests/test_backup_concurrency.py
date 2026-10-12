# Smart Home Health
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
"""A long patient import must not stall the API's event loop or live readers."""
import asyncio
import threading

import httpx


def test_health_request_runs_while_restore_is_in_progress(admin_client, monkeypatch):
    import routes.backup as backup_route
    from main import app

    entered = threading.Event()
    release = threading.Event()

    def slow_restore(*args):
        entered.set()
        assert release.wait(5), "Test restore was not released"
        return {"new_patient_id": 123, "inserted": {"patient": 1}}

    monkeypatch.setattr(backup_route, "restore_patient_from_targz", slow_restore)

    async def exercise():
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app),
            base_url="http://testserver",
            headers=dict(admin_client.headers),
        ) as client:
            # This timer also frees the original, event-loop-blocking endpoint
            # so a regression fails with an assertion instead of hanging pytest.
            failsafe = threading.Timer(3, release.set)
            failsafe.start()
            restore = asyncio.create_task(client.post(
                "/api/backup/import", files={"file": ("backup.tar.gz", b"synthetic")},
            ))
            try:
                assert await asyncio.to_thread(entered.wait, 2)
                response = await client.get("/api/status/health")
                assert response.status_code == 200
                assert not release.is_set(), "Health request stalled until the restore completed"
            finally:
                release.set()
                result = await restore
                failsafe.cancel()
            assert result.status_code == 200

    asyncio.run(exercise())
