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
"""Filesystem/crypto unit tests for tls_manager (no DB, no HTTP)."""
import datetime as dt
import os
import stat

import pytest
from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.x509.oid import NameOID

import tls_manager


def _make_cert(domains=("test.duckdns.org",), days_valid=90, key=None):
    """Self-signed cert + key PEMs for tests."""
    key = key or ec.generate_private_key(ec.SECP256R1())
    subject = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, domains[0])])
    now = dt.datetime.now(dt.timezone.utc)
    cert = (
        x509.CertificateBuilder()
        .subject_name(subject)
        .issuer_name(subject)
        .public_key(key.public_key())
        .serial_number(x509.random_serial_number())
        .not_valid_before(now + dt.timedelta(days=min(days_valid - 1, -1)))
        .not_valid_after(now + dt.timedelta(days=days_valid))
        .add_extension(
            x509.SubjectAlternativeName([x509.DNSName(d) for d in domains]),
            critical=False,
        )
        .sign(key, hashes.SHA256())
    )
    cert_pem = cert.public_bytes(serialization.Encoding.PEM)
    key_pem = key.private_bytes(
        serialization.Encoding.PEM,
        serialization.PrivateFormat.PKCS8,
        serialization.NoEncryption(),
    )
    return cert_pem, key_pem


@pytest.fixture()
def tls_dir(tmp_path, monkeypatch):
    d = tmp_path / "tls"
    monkeypatch.setattr(tls_manager, "TLS_DIR", str(d))
    return d


class TestCertAvailability:
    def test_unavailable_when_dir_missing(self, tls_dir):
        assert tls_manager.cert_available() is False

    def test_unavailable_with_only_one_file(self, tls_dir):
        cert_pem, key_pem = _make_cert()
        tls_manager.ensure_tls_dir()
        with open(tls_manager.cert_path(), "wb") as f:
            f.write(cert_pem)
        assert tls_manager.cert_available() is False

    def test_available_after_install(self, tls_dir):
        cert_pem, key_pem = _make_cert()
        tls_manager.write_cert_atomic(cert_pem, key_pem)
        assert tls_manager.cert_available() is True


class TestInstallPermissions:
    def test_files_are_0600_and_dir_0700(self, tls_dir):
        cert_pem, key_pem = _make_cert()
        tls_manager.write_cert_atomic(cert_pem, key_pem)
        assert stat.S_IMODE(os.stat(tls_dir).st_mode) == 0o700
        for p in (tls_manager.cert_path(), tls_manager.key_path()):
            assert stat.S_IMODE(os.stat(p).st_mode) == 0o600

    def test_no_tmp_droppings_after_install(self, tls_dir):
        cert_pem, key_pem = _make_cert()
        tls_manager.write_cert_atomic(cert_pem, key_pem)
        leftovers = [n for n in os.listdir(tls_dir) if n.startswith(".tmp-")]
        assert leftovers == []


class TestCertIntrospection:
    def test_read_cert_expiry(self, tls_dir):
        cert_pem, key_pem = _make_cert(days_valid=42)
        tls_manager.write_cert_atomic(cert_pem, key_pem)
        expiry = tls_manager.read_cert_expiry()
        expected = dt.datetime.now(dt.timezone.utc) + dt.timedelta(days=42)
        assert abs((expiry - expected).total_seconds()) < 120

    def test_read_cert_expiry_missing_file(self, tls_dir):
        assert tls_manager.read_cert_expiry() is None

    def test_read_cert_expiry_corrupt_file(self, tls_dir):
        tls_manager.ensure_tls_dir()
        with open(tls_manager.cert_path(), "wb") as f:
            f.write(b"not a pem")
        assert tls_manager.read_cert_expiry() is None

    def test_read_cert_domains_from_san(self, tls_dir):
        cert_pem, key_pem = _make_cert(domains=("a.duckdns.org", "b.duckdns.org"))
        tls_manager.write_cert_atomic(cert_pem, key_pem)
        assert tls_manager.read_cert_domains() == ["a.duckdns.org", "b.duckdns.org"]

    def test_read_cert_domains_missing_file(self, tls_dir):
        assert tls_manager.read_cert_domains() == []


class TestPairValidation:
    def test_valid_pair_passes(self):
        cert_pem, key_pem = _make_cert()
        tls_manager.validate_cert_key_pair(cert_pem, key_pem)  # no raise

    def test_mismatched_key_rejected(self):
        cert_pem, _ = _make_cert()
        _, other_key_pem = _make_cert()
        with pytest.raises(ValueError, match="does not match"):
            tls_manager.validate_cert_key_pair(cert_pem, other_key_pem)

    def test_garbage_cert_rejected(self):
        _, key_pem = _make_cert()
        with pytest.raises(ValueError, match="not a valid PEM certificate"):
            tls_manager.validate_cert_key_pair(b"garbage", key_pem)

    def test_garbage_key_rejected(self):
        cert_pem, _ = _make_cert()
        with pytest.raises(ValueError, match="private key"):
            tls_manager.validate_cert_key_pair(cert_pem, b"garbage")

    def test_expired_cert_rejected(self):
        cert_pem, key_pem = _make_cert(days_valid=-2)
        with pytest.raises(ValueError, match="expired"):
            tls_manager.validate_cert_key_pair(cert_pem, key_pem)

    def test_install_rejects_bad_pair(self, tls_dir):
        cert_pem, _ = _make_cert()
        _, other_key_pem = _make_cert()
        with pytest.raises(ValueError):
            tls_manager.write_cert_atomic(cert_pem, other_key_pem)
        assert tls_manager.cert_available() is False


class TestDuckdnsToken:
    def test_roundtrip_and_perms(self, tls_dir):
        tls_manager.write_duckdns_token("  tok-123  \n")
        assert tls_manager.read_duckdns_token() == "tok-123"
        mode = stat.S_IMODE(os.stat(tls_manager.duckdns_token_path()).st_mode)
        assert mode == 0o600

    def test_missing_token(self, tls_dir):
        assert tls_manager.read_duckdns_token() is None


class TestRestartSignal:
    def test_request_restart_without_supervisor(self, monkeypatch):
        monkeypatch.setattr(tls_manager, "_supervisor_loop", None)
        tls_manager.restart_event.clear()
        tls_manager.request_https_restart()
        assert tls_manager.restart_event.is_set()
        tls_manager.restart_event.clear()
