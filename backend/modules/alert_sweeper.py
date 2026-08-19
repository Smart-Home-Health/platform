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
"""Background pass that closes monitoring alerts nothing else can close.

The live engine in state_module only runs when a sample arrives. That is fine
while the reader is streaming, but it means an episode interrupted by an
unplugged reader, a disconnected patient or a process restart can never be
closed by it -- after a restart the engine has forgotten the alert exists at
all, since it tracked it only in memory. Those rows would stay open forever,
and reports would either drop them or invent a length for them.

So the two mechanisms cover different failures and neither replaces the other:
the gap rule inside the live engine handles a stream that resumes with a hole
in it, and this loop handles a stream that never resumes.

Assumes a single instance, like environment.poller does. startup_event fires
once (serve.py runs the HTTPS listener with lifespan off precisely so it
cannot fire twice) and uvicorn runs one worker. Two of these would both scan;
the writes are idempotent, so the cost would be wasted work rather than wrong
data, but it is worth knowing before adding workers.
"""
import asyncio
import logging

from db import get_db
from crud.alert_closure import sweep_open_alerts

logger = logging.getLogger("alert_sweeper")

TICK_SECONDS = 300
ERROR_RETRY_SECONDS = 60


async def alert_sweep_loop():
    """Startup task (see main.py): close stranded alerts forever."""
    logger.info("[alert_sweeper] Sweep loop started")
    while True:
        try:
            # Sleep first: nothing here is urgent, and a stranded row only
            # matters by the time someone reads a report.
            await asyncio.sleep(TICK_SECONDS)
            db = next(get_db())
            try:
                result = sweep_open_alerts(db)
                if result["examined"]:
                    logger.info(
                        "[alert_sweeper] examined=%s closed=%s indeterminate=%s %s",
                        result["examined"], result["closed"],
                        result["indeterminate"], result["by_outcome"],
                    )
            finally:
                db.close()
        except Exception as e:
            logger.error(f"[alert_sweeper] Sweep loop error: {e}")
            await asyncio.sleep(ERROR_RETRY_SECONDS)
