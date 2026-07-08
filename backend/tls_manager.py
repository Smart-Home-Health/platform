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
# tls_manager.py
"""
TLS certificate state shared between the serve.py supervisor, the security
routes, and the renewal loop.

Secret material (private key, cert chain, ACME account key, DuckDNS token)
lives on the filesystem under TLS_DIR — never in the database, because the
settings table is plaintext and flows into user-managed backups. Non-secret
state (https_mode, domain, expiry cache) lives in the settings table.

This module must stay import-light: it is imported by serve.py before the
FastAPI app, and by routes inside the app. It must not import main/serve.
"""
import asyncio
import logging
import os
import tempfile
from datetime import datetime, timezone
from typing import Optional

from cryptography import x509
from cryptography.hazmat.primitives import serialization
from cryptography.x509.oid import NameOID

logger = logging.getLogger(__name__)

# Overridable for tests (monkeypatch the module attribute) and dev setups.
TLS_DIR = os.environ.get("TLS_DIR", "/app/data/tls")

CERT_FILE = "fullchain.pem"
KEY_FILE = "privkey.pem"
ACME_ACCOUNT_KEY_FILE = "acme_account_key.pem"
DUCKDNS_TOKEN_FILE = "duckdns_token"

# Set by serve.py so restart requests coming from worker threads (the sync
# ACME job runs in a threadpool) can wake the supervisor loop safely.
_supervisor_loop: Optional[asyncio.AbstractEventLoop] = None

# Woken whenever the HTTPS listener should be (re)evaluated: first issuance,
# renewal, mode change, disable. serve.py owns clearing it.
restart_event = asyncio.Event()

# Live listener state, maintained by serve.py, read by the status endpoint.
# "running" means the HTTPS server reported successful startup; "error" holds
# the last startup/runtime failure (e.g. unreadable key) for the UI.
https_state = {"running": False, "error": None}


def bind_supervisor_loop(loop: asyncio.AbstractEventLoop) -> None:
    """Called once by serve.py so cross-thread restart requests are safe."""
    global _supervisor_loop
    _supervisor_loop = loop


def request_https_restart() -> None:
    """Ask the supervisor to stop/re-evaluate/restart the HTTPS listener.

    Safe to call from any thread (threadpool workers) or from the loop itself.
    A no-op when nothing is supervising (dev CLI, tests): the event is simply
    left set.
    """
    if _supervisor_loop is not None and not _supervisor_loop.is_closed():
        _supervisor_loop.call_soon_threadsafe(restart_event.set)
    else:
        restart_event.set()


def cert_path() -> str:
    return os.path.join(TLS_DIR, CERT_FILE)


def key_path() -> str:
    return os.path.join(TLS_DIR, KEY_FILE)


def acme_account_key_path() -> str:
    return os.path.join(TLS_DIR, ACME_ACCOUNT_KEY_FILE)


def duckdns_token_path() -> str:
    return os.path.join(TLS_DIR, DUCKDNS_TOKEN_FILE)


def ensure_tls_dir() -> str:
    """Create TLS_DIR (0700) if missing; returns the path."""
    os.makedirs(TLS_DIR, mode=0o700, exist_ok=True)
    return TLS_DIR


def cert_available() -> bool:
    """True when both the cert chain and private key exist and are readable."""
    return all(
        os.path.isfile(p) and os.access(p, os.R_OK)
        for p in (cert_path(), key_path())
    )


def _load_first_cert(pem_data: bytes) -> x509.Certificate:
    """Parse the leaf (first) certificate out of a PEM chain."""
    return x509.load_pem_x509_certificate(pem_data)


def read_cert_expiry() -> Optional[datetime]:
    """UTC expiry of the installed leaf cert, or None if absent/unparseable."""
    try:
        with open(cert_path(), "rb") as f:
            cert = _load_first_cert(f.read())
        return cert.not_valid_after_utc
    except FileNotFoundError:
        return None
    except Exception as e:  # noqa: BLE001 - corrupt file must not crash status
        logger.warning("Could not read certificate expiry: %s", e)
        return None


def read_cert_domains() -> list:
    """DNS names (SAN, falling back to CN) of the installed leaf cert."""
    try:
        with open(cert_path(), "rb") as f:
            cert = _load_first_cert(f.read())
    except FileNotFoundError:
        return []
    except Exception as e:  # noqa: BLE001
        logger.warning("Could not read certificate domains: %s", e)
        return []
    try:
        san = cert.extensions.get_extension_for_class(x509.SubjectAlternativeName)
        return san.value.get_values_for_type(x509.DNSName)
    except x509.ExtensionNotFound:
        cn = cert.subject.get_attributes_for_oid(NameOID.COMMON_NAME)
        return [attr.value for attr in cn]


def validate_cert_key_pair(cert_pem: bytes, key_pem: bytes) -> None:
    """Validate an uploaded cert/key pair; raises ValueError with a
    user-presentable message on any problem."""
    try:
        cert = _load_first_cert(cert_pem)
    except Exception:
        raise ValueError("The certificate file is not a valid PEM certificate.")
    try:
        key = serialization.load_pem_private_key(key_pem, password=None)
    except Exception:
        raise ValueError(
            "The private key file is not a valid unencrypted PEM private key."
        )
    cert_pub = cert.public_key().public_bytes(
        serialization.Encoding.DER,
        serialization.PublicFormat.SubjectPublicKeyInfo,
    )
    key_pub = key.public_key().public_bytes(
        serialization.Encoding.DER,
        serialization.PublicFormat.SubjectPublicKeyInfo,
    )
    if cert_pub != key_pub:
        raise ValueError("The private key does not match the certificate.")
    if cert.not_valid_after_utc <= datetime.now(timezone.utc):
        raise ValueError(
            f"The certificate expired on {cert.not_valid_after_utc.date().isoformat()}."
        )


def _write_private(path: str, data: bytes) -> None:
    """Atomically write a secret file with 0600 perms (tmp + os.replace)."""
    ensure_tls_dir()
    fd, tmp = tempfile.mkstemp(dir=TLS_DIR, prefix=".tmp-")
    try:
        # fdopen's buffered write loops over partial os.write results.
        with os.fdopen(fd, "wb") as f:
            f.write(data)
            f.flush()
            os.fsync(f.fileno())
        os.chmod(tmp, 0o600)
        os.replace(tmp, path)
    except BaseException:
        try:
            os.unlink(tmp)
        except OSError:
            pass
        raise


def write_cert_atomic(cert_pem: bytes, key_pem: bytes) -> None:
    """Install a new cert/key pair (validated first; each file written
    atomically). The HTTPS listener only re-reads these on restart, so a
    crash between the two writes can't feed a mismatched pair to a live
    listener — the pair is re-validated by the supervisor before starting."""
    validate_cert_key_pair(cert_pem, key_pem)
    _write_private(key_path(), key_pem)
    _write_private(cert_path(), cert_pem)


def write_duckdns_token(token: str) -> None:
    _write_private(duckdns_token_path(), token.strip().encode())


def read_duckdns_token() -> Optional[str]:
    try:
        with open(duckdns_token_path(), "r", encoding="utf-8") as f:
            return f.read().strip() or None
    except FileNotFoundError:
        return None
