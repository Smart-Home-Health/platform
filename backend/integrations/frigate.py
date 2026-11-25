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
Frigate NVR integration.

Each patient can connect to a Frigate instance on their LAN, the integration
discovers the configured cameras and the caregiver selects which camera covers
the patient. The integration does not produce vital readings - cameras are
exposed via integration_devices and the routes layer hands out live / snapshot /
clip URLs derived from `credentials.base_url` and `settings.camera`.

Frigate API endpoints used:
- GET /api/version          -> connectivity check
- GET /api/config           -> camera list (config["cameras"] dict)
- GET /api/<cam>            -> MJPEG preview for Home Assistant installs
- GET /api/<cam>/latest.jpg -> still snapshot
- HLS live (when restream is configured): /live/<cam>/index.m3u8
- Recording clip MP4:        /api/<cam>/start/<unix>/end/<unix>/clip.mp4
"""
import os
from datetime import datetime
from typing import Dict, Any, Optional, List
from urllib.parse import quote

import httpx

from homeassistant.client import supervisor_available

from .base import (
    BaseIntegration,
    DeviceInfo,
    SyncResult,
    AuthenticationError,
)
from .registry import register


DEFAULT_CLIP_PADDING_SECONDS = 5
DEFAULT_LIVE_MODE = "hls"  # "hls" | "webrtc"


# Frigate documents these Supervisor DNS names for the four NVR variants.
# The Proxy add-on serves a remote installation and is not itself a recorder.
HA_FRIGATE_ADDONS = {
    "ccab4aaf_frigate", "ccab4aaf_frigate-fa",
    "ccab4aaf_frigate-beta", "ccab4aaf_frigate-fa-beta",
}


def addon_base_url(slug):
    if not supervisor_available() or not isinstance(slug, str) or slug not in HA_FRIGATE_ADDONS:
        raise AuthenticationError("Select an installed Frigate Home Assistant add-on.")
    return f"http://{slug.replace('_', '-')}:5000"


async def installed_frigate_addons():
    """Only Supervisor receives its token. Return NVR metadata to the setup form."""
    if not supervisor_available():
        return []
    async with httpx.AsyncClient(timeout=5, trust_env=False) as http:
        response = await http.get("http://supervisor/supervisor/info", headers={
            "Authorization": f"Bearer {os.environ['SUPERVISOR_TOKEN']}",
        })
        response.raise_for_status()
        addons = response.json()["data"]["addons"]
    return [
        {"slug": app["slug"], "name": app["name"], "running": app.get("state") == "started"}
        for app in addons if app.get("slug") in HA_FRIGATE_ADDONS
    ]


@register
class FrigateIntegration(BaseIntegration):
    """
    Local Frigate NVR integration. One patient -> one Frigate instance ->
    one selected camera (additional cameras are still discovered and stored
    so the caregiver can switch later).
    """

    slug = "frigate"
    name = "Frigate NVR"
    description = "Local Frigate NVR for patient room cameras and event playback"
    auth_type = "local"
    supported_vitals: List[str] = []
    auth_fields = ["base_url", "auth_header", "addon_slug"]

    @classmethod
    def get_config_schema(cls) -> Dict[str, Any]:
        return {
            "type": "object",
            "x-ha-addon-discovery": supervisor_available(),
            "properties": {
                "addon_slug": {
                    "type": "string",
                    "title": "Home Assistant Frigate add-on",
                    "enum": sorted(HA_FRIGATE_ADDONS),
                },
                "base_url": {
                    "type": "string",
                    "title": "Frigate Base URL",
                    "description": "e.g. http://192.168.1.50:5000",
                },
                "auth_header": {
                    "type": "string",
                    "title": "Authorization Header (optional)",
                    "description": "Full value of the Authorization header if your Frigate is protected (e.g. 'Bearer ...' or 'Basic ...')",
                },
                "camera": {
                    "type": "string",
                    "title": "Selected Camera",
                    "description": "Pick a camera after discovery",
                },
                "clip_padding_seconds": {
                    "type": "integer",
                    "title": "Event clip padding (seconds)",
                    "default": DEFAULT_CLIP_PADDING_SECONDS,
                    "minimum": 0,
                },
                "live_mode": {
                    "type": "string",
                    "title": "Live stream mode",
                    "enum": ["hls", "webrtc"],
                    "default": DEFAULT_LIVE_MODE,
                },
            },
            "anyOf": [{"required": ["base_url"]}, {"required": ["addon_slug"]}],
        }

    @property
    def addon_slug(self) -> Optional[str]:
        return (self.credentials or {}).get("addon_slug")

    def http_client(self, timeout) -> httpx.AsyncClient:
        # Internal Supervisor DNS is local to the add-on network.
        return httpx.AsyncClient(timeout=timeout, trust_env=not self.addon_slug)

    def _base_url(self) -> str:
        if self.addon_slug:
            return addon_base_url(self.addon_slug)
        url = (self.credentials or {}).get("base_url", "").rstrip("/")
        if not url:
            raise AuthenticationError("Frigate base_url not configured")
        return url

    def _headers(self) -> Dict[str, str]:
        if self.addon_slug:
            return {}
        header = (self.credentials or {}).get("auth_header")
        return {"Authorization": header} if header else {}

    async def authenticate(self, auth_data: Dict[str, Any]) -> Dict[str, Any]:
        addon = auth_data.get("addon_slug")
        base_url = addon_base_url(addon) if addon else (auth_data.get("base_url") or "").rstrip("/")
        if not base_url:
            raise AuthenticationError("base_url is required")

        auth_header = None if addon else auth_data.get("auth_header") or None
        headers = {"Authorization": auth_header} if auth_header else {}

        async with httpx.AsyncClient(timeout=10.0, trust_env=not addon) as client:
            try:
                resp = await client.get(f"{base_url}/api/version", headers=headers)
            except httpx.HTTPError as e:
                raise AuthenticationError(f"Could not reach Frigate at {base_url}: {e}")

            if resp.status_code == 401 or resp.status_code == 403:
                raise AuthenticationError("Frigate rejected credentials")
            if not resp.is_success:
                raise AuthenticationError(f"Frigate /api/version returned {resp.status_code}")

        if addon:
            return {"addon_slug": addon}
        return {
            "base_url": base_url,
            "auth_header": auth_header,
        }

    async def refresh_credentials(self) -> Dict[str, Any]:
        # Local integration; nothing to refresh.
        return self.credentials or {}

    async def fetch_devices(self) -> List[DeviceInfo]:
        base_url = self._base_url()
        async with self.http_client(10.0) as client:
            resp = await client.get(f"{base_url}/api/config", headers=self._headers())
            resp.raise_for_status()
            cfg = resp.json()

        devices: List[DeviceInfo] = []
        for name, cam_cfg in (cfg.get("cameras") or {}).items():
            devices.append(DeviceInfo(
                device_id=name,
                device_type="camera",
                device_name=name,
                device_model="camera",
                extra_data={
                    "enabled": cam_cfg.get("enabled", True),
                    "detect": (cam_cfg.get("detect") or {}).get("enabled"),
                    "record": (cam_cfg.get("record") or {}).get("enabled"),
                },
            ))
        return devices

    async def sync_data(
        self,
        since: Optional[datetime] = None,
        device_ids: Optional[List[str]] = None,
    ) -> SyncResult:
        # Frigate doesn't produce vitals; return empty.
        return SyncResult(
            success=True,
            readings_count=0,
            readings=[],
            sync_timestamp=datetime.utcnow(),
        )

    # ------------------------------------------------------------------
    # URL helpers consumed by routes/frigate.py (step 2)
    # ------------------------------------------------------------------

    def selected_camera(self) -> Optional[str]:
        return (self.settings or {}).get("camera")

    def get_snapshot_url(self, camera: str) -> str:
        return f"{self._base_url()}/api/{quote(camera)}/latest.jpg"

    def get_live_url(self, camera: str) -> str:
        mode = (self.settings or {}).get("live_mode", DEFAULT_LIVE_MODE)
        base = self._base_url()
        if mode == "webrtc":
            return f"{base}/api/go2rtc/api/webrtc?src={quote(camera)}"
        # Frigate proxies go2rtc's HLS endpoint under /api/go2rtc.
        return f"{base}/api/go2rtc/api/stream.m3u8?src={quote(camera)}"

    def get_live_upstream_m3u8(self, camera: str) -> str:
        """Upstream go2rtc HLS playlist URL for the backend live proxy to fetch.

        The browser cannot fetch this directly (cross-origin to Frigate, and
        subject to go2rtc cold-start), so routes/frigate.py proxies it same-site
        and rewrites the segment URLs. Frigate proxies go2rtc under /api/go2rtc.

        We request `video=h264&audio=aac` so go2rtc hands back a codec the
        browser's Media Source Extensions can actually decode (many cameras are
        H.265, which fails with hls.js `bufferAppendError`). go2rtc copies the
        track when the source is already H.264 (no transcode cost) and only
        spins up ffmpeg when a conversion is genuinely needed. Set the
        `live_hls_codecs` setting to override (e.g. "" to disable transcoding).
        """
        codecs = (self.settings or {}).get("live_hls_codecs", "video=h264&audio=aac")
        url = f"{self._base_url()}/api/go2rtc/api/stream.m3u8?src={quote(camera)}"
        if codecs:
            url += f"&{codecs}"
        return url

    def base_url_public(self) -> str:
        """Configured Frigate base URL, used by the live proxy as an SSRF allowlist."""
        return self._base_url()

    def get_clip_url(self, camera: str, start_unix: int, end_unix: int) -> str:
        padding = int((self.settings or {}).get("clip_padding_seconds", DEFAULT_CLIP_PADDING_SECONDS))
        s = max(0, int(start_unix) - padding)
        e = int(end_unix) + padding
        return f"{self._base_url()}/api/{quote(camera)}/start/{s}/end/{e}/clip.mp4"

    async def test_connection(self) -> bool:
        try:
            async with self.http_client(5.0) as client:
                resp = await client.get(f"{self._base_url()}/api/version", headers=self._headers())
                return resp.status_code < 400
        except Exception:
            return False
