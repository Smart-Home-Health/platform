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
# tls_renewal.py
"""
Automatic certificate renewal for the DuckDNS/Let's Encrypt HTTPS mode.

An in-process asyncio loop (started from main.py's startup event, skipped
under HA ingress) checks twice a day and renews when the installed cert has
under RENEW_BEFORE_DAYS left. Failures are recorded to settings for the
Security page and retried next tick — the 30-day headroom absorbs outages.
"""
import asyncio
import logging
import os
from datetime import datetime, timezone

import tls_manager
from db import SessionLocal
from tls_acme import AcmeSetupError, DuckDnsIssuer, needs_renewal

logger = logging.getLogger(__name__)

RENEW_BEFORE_DAYS = 30
CHECK_INTERVAL_SECONDS = 12 * 3600
FIRST_CHECK_DELAY_SECONDS = 60


def renew_if_needed() -> bool:
    """Synchronous single renewal check; returns True when a renewal ran.
    Opens its own DB session (runs off the request path)."""
    from crud.settings import get_setting, save_setting

    db = SessionLocal()
    try:
        mode = get_setting(db, "https_mode", "off") or "off"
        if mode != "duckdns":
            return False
        if not needs_renewal(tls_manager.read_cert_expiry(),
                             renew_before_days=RENEW_BEFORE_DAYS):
            return False

        domain = get_setting(db, "https_domain") or ""
        token = tls_manager.read_duckdns_token()
        if not domain or not token:
            logger.warning("Renewal skipped: DuckDNS domain/token missing")
            return False

        logger.info("Renewing certificate for %s", domain)
        try:
            issuer = DuckDnsIssuer(domain, token)
            fullchain, privkey = issuer.issue()
            tls_manager.write_cert_atomic(fullchain, privkey)
            expiry = tls_manager.read_cert_expiry()
            if expiry:
                save_setting(db, "https_cert_expires_at", expiry.isoformat(),
                             description="Installed cert expiry (cache)")
            save_setting(db, "https_last_renewal_at",
                         datetime.now(timezone.utc).isoformat(),
                         description="Last successful cert renewal")
            save_setting(db, "https_last_renewal_error", "",
                         description="Last cert renewal error")
            tls_manager.request_https_restart()
            logger.info("Certificate renewed for %s", domain)
            return True
        except AcmeSetupError as e:
            logger.error("Certificate renewal failed: %s", e)
            save_setting(db, "https_last_renewal_error", str(e),
                         description="Last cert renewal error")
            return False
    finally:
        db.close()


async def tls_renewal_loop() -> None:
    if (os.environ.get("SHH_INGRESS", "") or "").strip().lower() in ("1", "true", "yes", "on"):
        return  # HA ingress terminates TLS; nothing to renew
    await asyncio.sleep(FIRST_CHECK_DELAY_SECONDS)
    logger.info("TLS renewal loop started (every %dh, renew <%dd)",
                CHECK_INTERVAL_SECONDS // 3600, RENEW_BEFORE_DAYS)
    while True:
        try:
            await asyncio.to_thread(renew_if_needed)
        except Exception as e:  # noqa: BLE001 - the loop must survive anything
            logger.error("TLS renewal check crashed: %s", e)
        await asyncio.sleep(CHECK_INTERVAL_SECONDS)
