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
"""X25519 key agreement for reader pairing.

Hub and reader exchange ephemeral public keys and derive the same Fernet
key via ECDH + HKDF, so the symmetric key itself never crosses the network.
This defeats passive sniffing of the pairing exchange; an active MITM on
the LAN could still substitute public keys — full protection needs TLS
(out of scope). The mitigation is the Allow prompt on the reader showing
the requesting hub's IP.

The constants here must match the reader's pairing helper exactly
(PulseOX-Reader/pairing.py).
"""

import base64

from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric.x25519 import (
    X25519PrivateKey,
    X25519PublicKey,
)
from cryptography.hazmat.primitives.kdf.hkdf import HKDF
from cryptography.hazmat.primitives.serialization import Encoding, PublicFormat

PAIR_PROTOCOL_VERSION = 2
PAIR_HKDF_INFO = b"shh-reader-pairing-v2"


def public_key_b64(priv: X25519PrivateKey) -> str:
    return base64.urlsafe_b64encode(
        priv.public_key().public_bytes(Encoding.Raw, PublicFormat.Raw)
    ).decode()


def derive_fernet_key(priv: X25519PrivateKey, peer_pub_b64: str) -> str:
    peer = X25519PublicKey.from_public_bytes(base64.urlsafe_b64decode(peer_pub_b64))
    shared = priv.exchange(peer)
    key = HKDF(
        algorithm=hashes.SHA256(), length=32, salt=None, info=PAIR_HKDF_INFO
    ).derive(shared)
    return base64.urlsafe_b64encode(key).decode()  # valid Fernet key
