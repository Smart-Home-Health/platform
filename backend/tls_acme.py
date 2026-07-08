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
# tls_acme.py
"""
DuckDNS + Let's Encrypt (ACME DNS-01) certificate issuance.

Synchronous by design: it runs inside FastAPI BackgroundTasks' threadpool
(same pattern as the vent-import worker) and inside the renewal loop via
asyncio.to_thread. No FastAPI imports here.

Endpoints are env-overridable so tests/CI can point at pebble +
pebble-challtestsrv instead of DuckDNS / Cloudflare DoH / Let's Encrypt:
  SHH_DUCKDNS_URL     (default https://www.duckdns.org/update)
  SHH_DOH_URL         (default https://cloudflare-dns.com/dns-query)
  SHH_ACME_DIRECTORY  (overrides BOTH prod and staging directory choice)
"""
import logging
import os
import time
from datetime import datetime, timedelta

import httpx
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import ec, rsa

import tls_manager

logger = logging.getLogger(__name__)

DUCKDNS_URL = "https://www.duckdns.org/update"
DOH_URL = "https://cloudflare-dns.com/dns-query"
LE_PRODUCTION_DIRECTORY = "https://acme-v02.api.letsencrypt.org/directory"
LE_STAGING_DIRECTORY = "https://acme-staging-v02.api.letsencrypt.org/directory"

USER_AGENT = "smart-home-health-hub"
HTTP_TIMEOUT = 20  # seconds, DuckDNS + DoH calls
DNS_PROPAGATION_TIMEOUT = 300  # seconds to wait for the TXT record via DoH
DNS_POLL_INTERVAL = 15
ACME_DEADLINE = 90  # seconds for authorization polling / finalization


class AcmeSetupError(Exception):
    """Base for issuance failures; error_code maps to wizard copy."""
    error_code = "acme_error"


class BadTokenError(AcmeSetupError):
    error_code = "bad_token"


class DnsTimeoutError(AcmeSetupError):
    error_code = "dns_timeout"


class RateLimitedError(AcmeSetupError):
    error_code = "acme_rate_limited"


class NetworkError(AcmeSetupError):
    error_code = "network_error"


def normalize_subdomain(value: str) -> str:
    """Accepts 'myhub', 'myhub.duckdns.org', or a full URL paste; returns the
    bare DuckDNS subdomain. Raises ValueError on anything unusable."""
    sub = (value or "").strip().lower()
    for prefix in ("https://", "http://"):
        if sub.startswith(prefix):
            sub = sub[len(prefix):]
    sub = sub.strip("/")
    if sub.endswith(".duckdns.org"):
        sub = sub[: -len(".duckdns.org")]
    if not sub or not all(c.isalnum() or c == "-" for c in sub):
        raise ValueError("Enter your DuckDNS subdomain, e.g. myhub or myhub.duckdns.org")
    return sub


def _duckdns_url() -> str:
    return os.environ.get("SHH_DUCKDNS_URL", DUCKDNS_URL)


def _doh_url() -> str:
    return os.environ.get("SHH_DOH_URL", DOH_URL)


def directory_url(staging: bool) -> str:
    override = os.environ.get("SHH_ACME_DIRECTORY")
    if override:
        return override
    return LE_STAGING_DIRECTORY if staging else LE_PRODUCTION_DIRECTORY


def needs_renewal(expiry, now=None, renew_before_days: int = 30) -> bool:
    """Pure decision: renew when there's no cert or <renew_before_days left."""
    if expiry is None:
        return True
    now = now or datetime.now(expiry.tzinfo)
    return expiry - now < timedelta(days=renew_before_days)


class DuckDnsIssuer:
    """One-shot ACME DNS-01 issuance for <subdomain>.duckdns.org.

    progress_cb(step: str) is called at each phase transition with one of:
    validating_token, setting_dns, waiting_dns, requesting_cert, finalizing.
    """

    def __init__(self, subdomain: str, token: str, staging: bool = False):
        self.subdomain = normalize_subdomain(subdomain)
        self.domain = f"{self.subdomain}.duckdns.org"
        self.token = (token or "").strip()
        self.staging = staging
        if not self.token:
            raise BadTokenError("DuckDNS token is required")

    # -- DuckDNS / DNS ---------------------------------------------------------

    def _duckdns_call(self, params: dict) -> str:
        try:
            resp = httpx.get(_duckdns_url(), params={
                "domains": self.subdomain, "token": self.token, **params,
            }, timeout=HTTP_TIMEOUT)
            resp.raise_for_status()
        except httpx.HTTPError as e:
            raise NetworkError(f"Could not reach DuckDNS: {e}")
        return resp.text.strip()

    def preflight(self) -> None:
        """Dry-run TXT update: DuckDNS answers OK/KO for token+domain validity."""
        body = self._duckdns_call({"txt": "shh-preflight"})
        if not body.startswith("OK"):
            raise BadTokenError(
                "DuckDNS rejected the domain/token combination. Check both on duckdns.org."
            )

    def set_txt(self, value: str) -> None:
        body = self._duckdns_call({"txt": value})
        if not body.startswith("OK"):
            raise BadTokenError("DuckDNS rejected the DNS record update.")

    def clear_txt(self) -> None:
        try:
            self._duckdns_call({"txt": "cleared", "clear": "true"})
        except AcmeSetupError:
            pass  # best-effort cleanup; a stale TXT record is harmless

    def wait_for_txt(self, value: str,
                     timeout: int = DNS_PROPAGATION_TIMEOUT,
                     interval: int = DNS_POLL_INTERVAL) -> None:
        """Poll DoH until the ACME TXT value is visible on public DNS, so we
        only ask Let's Encrypt to validate once the record will be found."""
        name = f"_acme-challenge.{self.domain}"
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            try:
                resp = httpx.get(_doh_url(), params={"name": name, "type": "TXT"},
                                 headers={"accept": "application/dns-json"},
                                 timeout=HTTP_TIMEOUT)
                answers = resp.json().get("Answer") or []
                for ans in answers:
                    if value in (ans.get("data") or "").strip('"'):
                        return
            except Exception as e:  # noqa: BLE001 - transient DNS/network hiccups
                logger.debug("DoH poll error (retrying): %s", e)
            time.sleep(interval)
        raise DnsTimeoutError(
            "The DNS record did not become visible in time. This can happen when "
            "DNS is slow to update — wait a few minutes and try again."
        )

    # -- ACME ------------------------------------------------------------------

    def _account_key(self):
        """Load (or create once) the persisted ACME account key."""
        import josepy

        path = tls_manager.acme_account_key_path()
        try:
            with open(path, "rb") as f:
                key = serialization.load_pem_private_key(f.read(), password=None)
        except FileNotFoundError:
            key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
            pem = key.private_bytes(
                serialization.Encoding.PEM,
                serialization.PrivateFormat.PKCS8,
                serialization.NoEncryption(),
            )
            tls_manager._write_private(path, pem)
        return josepy.JWKRSA(key=key)

    def issue(self, progress_cb=None) -> tuple:
        """Run the full flow; returns (fullchain_pem: bytes, privkey_pem: bytes)."""
        from acme import challenges, client, crypto_util, errors, messages

        def progress(step: str) -> None:
            if progress_cb:
                progress_cb(step)

        progress("validating_token")
        self.preflight()

        # Test hook: pebble serves its ACME directory over a self-signed cert.
        verify_ssl = (os.environ.get("SHH_ACME_INSECURE", "") or "").strip().lower() not in (
            "1", "true", "yes", "on",
        )
        try:
            account_key = self._account_key()
            net = client.ClientNetwork(account_key, user_agent=USER_AGENT,
                                       verify_ssl=verify_ssl)
            directory = client.ClientV2.get_directory(directory_url(self.staging), net)
            acme_client = client.ClientV2(directory, net=net)
            try:
                acme_client.new_account(
                    messages.NewRegistration.from_data(terms_of_service_agreed=True)
                )
            except errors.ConflictError as e:
                # Account for this key already exists; reuse it.
                net.account = messages.RegistrationResource(uri=e.location)

            # Fresh leaf key per issuance (never reuse across renewals).
            leaf_key = ec.generate_private_key(ec.SECP256R1())
            leaf_key_pem = leaf_key.private_bytes(
                serialization.Encoding.PEM,
                serialization.PrivateFormat.PKCS8,
                serialization.NoEncryption(),
            )
            csr_pem = crypto_util.make_csr(leaf_key_pem, [self.domain])
            order = acme_client.new_order(csr_pem)

            challenge_body = None
            for authz in order.authorizations:
                for chall in authz.body.challenges:
                    if isinstance(chall.chall, challenges.DNS01):
                        challenge_body = chall
                        break
            if challenge_body is None:
                raise AcmeSetupError("Let's Encrypt offered no DNS challenge for the domain.")

            validation = challenge_body.chall.validation(account_key)
        except AcmeSetupError:
            raise
        except errors.Error as e:
            raise self._map_acme_error(e)
        except Exception as e:  # noqa: BLE001 - requests/network layer
            raise NetworkError(f"Could not reach Let's Encrypt: {e}")

        progress("setting_dns")
        self.set_txt(validation)
        try:
            progress("waiting_dns")
            self.wait_for_txt(validation)

            progress("requesting_cert")
            try:
                acme_client.answer_challenge(
                    challenge_body, challenge_body.response(account_key)
                )
                deadline = datetime.now() + timedelta(seconds=ACME_DEADLINE)
                order = acme_client.poll_authorizations(order, deadline)
                progress("finalizing")
                order = acme_client.finalize_order(order, deadline)
            except errors.Error as e:
                raise self._map_acme_error(e)
            except AcmeSetupError:
                raise
            except Exception as e:  # noqa: BLE001
                raise NetworkError(f"Certificate request failed: {e}")
        finally:
            self.clear_txt()

        fullchain = order.fullchain_pem
        if isinstance(fullchain, str):
            fullchain = fullchain.encode()
        logger.info("Issued certificate for %s (staging=%s)", self.domain, self.staging)
        return fullchain, leaf_key_pem

    @staticmethod
    def _map_acme_error(e) -> AcmeSetupError:
        detail = str(e)
        if "rateLimited" in detail or "rate limit" in detail.lower():
            return RateLimitedError(
                "Let's Encrypt rate limit reached (5 identical certificates per "
                "week). Wait before retrying, or use the staging option to test."
            )
        return AcmeSetupError(f"Let's Encrypt reported an error: {detail}")
