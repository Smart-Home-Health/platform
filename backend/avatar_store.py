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
"""
On-disk store for people's profile photos.

Layout: ``{PHOTOS_DIR}/{kind}/{owner_id}/{uuid}{ext}`` where kind is
``user`` or ``patient``. The browser downscales to a 256px square JPEG before
uploading, so nothing here resizes; the server only checks the bytes really
are a JPEG/PNG (by magic number, never by the client's Content-Type) and caps
the size. The filename is random and changes on every upload, which is what
lets the GET route send an immutable Cache-Control.

The Home Assistant add-on re-exports PHOTOS_DIR under its persistent /data
(see addon/run.sh) — the default below only persists where /app/data is a
mounted volume (dev + prod compose).
"""
import os
import re
import uuid
from typing import Optional

# Lives under the existing ./data bind mount (see docker-compose.yml backend volumes).
PHOTOS_DIR = os.getenv("PHOTOS_DIR", "/app/data/avatars")

KINDS = ("user", "patient")
MAX_AVATAR_BYTES = 2 * 1024 * 1024
AVATAR_CACHE_CONTROL = "private, max-age=31536000, immutable"
FILENAME_RE = re.compile(r"^[0-9a-f]{32}\.(jpg|png)$")

_EXT_BY_TYPE = {"image/jpeg": ".jpg", "image/png": ".png"}
_TYPE_BY_EXT = {".jpg": "image/jpeg", ".png": "image/png"}


def sniff_image(content: bytes) -> Optional[str]:
    """Return the image media type by magic number, or None if not JPEG/PNG."""
    if content[:3] == b"\xff\xd8\xff":
        return "image/jpeg"
    if content[:8] == b"\x89PNG\r\n\x1a\n":
        return "image/png"
    return None


def media_type_for(filename: str) -> str:
    return _TYPE_BY_EXT.get(os.path.splitext(filename)[1].lower(), "application/octet-stream")


def _owner_dir(kind: str, owner_id: int) -> str:
    if kind not in KINDS:
        raise ValueError(f"unknown avatar kind {kind!r}")
    return os.path.join(PHOTOS_DIR, kind, str(int(owner_id)))


def avatar_path(kind: str, owner_id: int, filename: str) -> str:
    """Absolute path for a stored photo. Only ever call with the filename
    recorded on the row — never with a value from the URL."""
    if not FILENAME_RE.match(filename or ""):
        raise ValueError("malformed avatar filename")
    return os.path.join(_owner_dir(kind, owner_id), filename)


def save_avatar(kind: str, owner_id: int, content: bytes, content_type: str) -> str:
    """Write the bytes and return the new filename (not the full path)."""
    ext = _EXT_BY_TYPE[content_type]
    owner_dir = _owner_dir(kind, owner_id)
    os.makedirs(owner_dir, exist_ok=True)
    filename = f"{uuid.uuid4().hex}{ext}"
    with open(os.path.join(owner_dir, filename), "wb") as fh:
        fh.write(content)
    return filename


def delete_avatar(kind: str, owner_id: int, filename: Optional[str]) -> None:
    if not filename or not FILENAME_RE.match(filename):
        return
    try:
        os.remove(avatar_path(kind, owner_id, filename))
    except FileNotFoundError:
        pass
