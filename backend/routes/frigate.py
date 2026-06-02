"""
Frigate NVR routes.

Sits alongside the generic /api/integrations endpoints and exposes Frigate-
specific operations (camera list, camera selection, live URL, event clip).

All endpoints are patient-scoped and require an enabled Frigate
PatientIntegration for that patient/account.
"""
import asyncio
import os
import re
import tempfile
from datetime import datetime
from pathlib import Path
from typing import Optional, List
from urllib.parse import urljoin, urlencode

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import StreamingResponse, FileResponse, Response
from pydantic import BaseModel
from sqlalchemy.orm import Session, joinedload

from dependencies import get_db, require_read_access
from routes.auth import require_full_auth, get_current_account_id
from schemas.integration import (
    Integration as IntegrationModel,
    PatientIntegration,
    IntegrationDevice,
)
from integrations import get_integration
from integrations.frigate import FrigateIntegration


router = APIRouter(prefix="/api/integrations/frigate", tags=["frigate"])


# Persisted clip storage. Backed by the ./data host mount in docker-compose
# so saved videos survive container rebuilds.
CLIPS_ROOT = Path(os.getenv("FRIGATE_CLIPS_DIR", "/app/data/clips"))


def _clip_path(patient_id: int, camera: str, start: int, end: int) -> Path:
    # Camera names come from Frigate config and are already safe identifiers,
    # but strip path separators just in case.
    safe_cam = camera.replace("/", "_").replace("\\", "_")
    return CLIPS_ROOT / str(patient_id) / f"{safe_cam}_{int(start)}-{int(end)}.mp4"


# ---------------------------------------------------------------------------
# Request / response models
# ---------------------------------------------------------------------------


class FrigateCameraResponse(BaseModel):
    device_id: str
    device_name: Optional[str] = None
    is_enabled: bool = True
    selected: bool = False
    last_seen_at: Optional[datetime] = None


class FrigateSelectRequest(BaseModel):
    camera: str


class FrigateLiveResponse(BaseModel):
    camera: str
    live_url: str
    snapshot_url: str
    live_mode: str


class FrigateClipStatusResponse(BaseModel):
    camera: str
    start: int
    end: int
    saved: bool
    file_size: Optional[int] = None
    saved_at: Optional[datetime] = None


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _get_active_frigate(
    db: Session,
    patient_id: int,
    account_id: int,
) -> PatientIntegration:
    """Load the patient's active Frigate integration or 404."""
    pi = (
        db.query(PatientIntegration)
        .join(IntegrationModel, PatientIntegration.integration_id == IntegrationModel.id)
        .options(joinedload(PatientIntegration.integration))
        .filter(
            PatientIntegration.patient_id == patient_id,
            PatientIntegration.account_id == account_id,
            PatientIntegration.is_enabled == True,
            IntegrationModel.slug == "frigate",
        )
        .first()
    )
    if not pi:
        raise HTTPException(status_code=404, detail="Frigate integration not configured for this patient")
    return pi


def _make_client(pi: PatientIntegration) -> FrigateIntegration:
    cls = get_integration("frigate")
    if not cls:
        raise HTTPException(status_code=500, detail="Frigate integration not registered")
    return cls(pi)


_URI_ATTR_RE = re.compile(r'URI="([^"]+)"')


def _rewrite_hls_playlist(text: str, upstream_url: str, proxy_seg_base: str) -> str:
    """Rewrite every segment / init-map / key / sub-playlist URI in an HLS
    playlist so the browser fetches it through our authenticated, same-site
    `live-seg` proxy instead of directly from Frigate.

    Relative URIs are resolved against `upstream_url`, so this is agnostic to
    whether go2rtc emits TS or fMP4 segments and to absolute vs relative URIs.
    """
    out = []
    for line in text.splitlines():
        if not line:
            out.append(line)
            continue
        if line.startswith("#"):
            # Rewrite a URI="..." attribute if present (EXT-X-MAP, EXT-X-KEY).
            m = _URI_ATTR_RE.search(line)
            if m:
                abs_uri = urljoin(upstream_url, m.group(1))
                proxied = proxy_seg_base + "?" + urlencode({"u": abs_uri})
                line = line[:m.start(1)] + proxied + line[m.end(1):]
            out.append(line)
            continue
        # Bare line => a media segment or a nested playlist URI.
        abs_uri = urljoin(upstream_url, line)
        out.append(proxy_seg_base + "?" + urlencode({"u": abs_uri}))
    return "\n".join(out) + "\n"


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------


@router.get("/patient/{patient_id}/cameras", response_model=List[FrigateCameraResponse])
async def list_cameras(
    patient_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(require_full_auth),
    account_id: int = Depends(get_current_account_id),
    _: bool = Depends(require_read_access),
):
    """List cameras discovered for this patient's Frigate integration."""
    pi = _get_active_frigate(db, patient_id, account_id)
    selected = (pi.settings or {}).get("camera")

    devices = (
        db.query(IntegrationDevice)
        .filter(IntegrationDevice.patient_integration_id == pi.id)
        .all()
    )

    return [
        FrigateCameraResponse(
            device_id=d.device_id,
            device_name=d.device_name,
            is_enabled=d.is_enabled,
            selected=d.device_id == selected,
            last_seen_at=d.last_seen_at,
        )
        for d in devices
    ]


@router.post("/patient/{patient_id}/select", response_model=FrigateCameraResponse)
async def select_camera(
    patient_id: int,
    data: FrigateSelectRequest,
    db: Session = Depends(get_db),
    current_user=Depends(require_full_auth),
    account_id: int = Depends(get_current_account_id),
):
    """Set the active camera for this patient."""
    pi = _get_active_frigate(db, patient_id, account_id)

    device = (
        db.query(IntegrationDevice)
        .filter(
            IntegrationDevice.patient_integration_id == pi.id,
            IntegrationDevice.device_id == data.camera,
        )
        .first()
    )
    if not device:
        raise HTTPException(
            status_code=404,
            detail=f"Camera '{data.camera}' not found - run discovery first",
        )

    settings = dict(pi.settings or {})
    settings["camera"] = data.camera
    pi.settings = settings
    pi.updated_at = datetime.utcnow()
    db.commit()

    return FrigateCameraResponse(
        device_id=device.device_id,
        device_name=device.device_name,
        is_enabled=device.is_enabled,
        selected=True,
        last_seen_at=device.last_seen_at,
    )


@router.get("/patient/{patient_id}/live", response_model=FrigateLiveResponse)
async def get_live(
    patient_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user=Depends(require_full_auth),
    account_id: int = Depends(get_current_account_id),
    _: bool = Depends(require_read_access),
):
    """Return live stream URL + snapshot URL for the selected camera.

    For HLS mode the `live_url` points at our same-site proxy
    (`/live.m3u8`) rather than directly at Frigate — the browser can't reliably
    fetch go2rtc cross-origin (CORS / cold-start). WebRTC mode still returns the
    direct go2rtc URL since it isn't a simple playlist fetch.
    """
    pi = _get_active_frigate(db, patient_id, account_id)
    client = _make_client(pi)

    camera = client.selected_camera()
    if not camera:
        raise HTTPException(status_code=400, detail="No camera selected for this patient")

    mode = (pi.settings or {}).get("live_mode", "hls")
    if mode == "hls":
        base = str(request.base_url).rstrip("/")
        live_url = f"{base}/api/integrations/frigate/patient/{patient_id}/live.m3u8"
    else:
        live_url = client.get_live_url(camera)

    return FrigateLiveResponse(
        camera=camera,
        live_url=live_url,
        snapshot_url=client.get_snapshot_url(camera),
        live_mode=mode,
    )


@router.get("/patient/{patient_id}/live.m3u8")
async def live_playlist(
    patient_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user=Depends(require_full_auth),
    account_id: int = Depends(get_current_account_id),
    _: bool = Depends(require_read_access),
):
    """Proxy + rewrite the go2rtc HLS playlist for the selected camera.

    Fetched same-site by hls.js, so no browser CORS/mixed-content. Retries a few
    times to ride out go2rtc's cold-start (empty playlist right after the first
    request) before giving up.
    """
    pi = _get_active_frigate(db, patient_id, account_id)
    client = _make_client(pi)
    camera = client.selected_camera()
    if not camera:
        raise HTTPException(status_code=400, detail="No camera selected for this patient")

    upstream = client.get_live_upstream_m3u8(camera)
    headers = client._headers()
    base = str(request.base_url).rstrip("/")
    proxy_seg_base = f"{base}/api/integrations/frigate/patient/{patient_id}/live-seg"

    last = None
    async with httpx.AsyncClient(timeout=10.0) as http:
        for _attempt in range(6):
            try:
                resp = await http.get(upstream, headers=headers)
            except httpx.HTTPError as e:
                last = f"connect error: {e}"
                await asyncio.sleep(0.5)
                continue
            body = resp.text
            ready = (
                resp.status_code == 200
                and "#EXTM3U" in body
                and ("#EXTINF" in body or ".m3u8" in body)
            )
            if ready:
                rewritten = _rewrite_hls_playlist(body, upstream, proxy_seg_base)
                return Response(
                    content=rewritten,
                    media_type="application/vnd.apple.mpegurl",
                    headers={"Cache-Control": "no-store"},
                )
            last = f"status={resp.status_code}, len={len(body)}"
            await asyncio.sleep(0.5)

    raise HTTPException(status_code=502, detail=f"Frigate live stream not ready ({last})")


@router.get("/patient/{patient_id}/live-seg")
async def live_segment(
    patient_id: int,
    request: Request,
    u: str = Query(..., description="Absolute upstream Frigate segment/playlist URL"),
    db: Session = Depends(get_db),
    current_user=Depends(require_full_auth),
    account_id: int = Depends(get_current_account_id),
    _: bool = Depends(require_read_access),
):
    """Fetch a single live segment (or nested playlist) from Frigate and return it.

    `u` is the absolute upstream URL produced by `_rewrite_hls_playlist`; it is
    SSRF-guarded to the configured Frigate base URL. Live HLS segments are short,
    so we buffer each one and pass the upstream content-type straight through.
    """
    pi = _get_active_frigate(db, patient_id, account_id)
    client = _make_client(pi)

    base_url = client.base_url_public()
    if u != base_url and not u.startswith(base_url + "/"):
        raise HTTPException(status_code=403, detail="Upstream URL not allowed")

    headers = client._headers()
    async with httpx.AsyncClient(timeout=httpx.Timeout(15.0, read=30.0)) as http:
        resp = await http.get(u, headers=headers)

    if resp.status_code != 200:
        raise HTTPException(
            status_code=502,
            detail=f"Frigate returned {resp.status_code} for live segment",
        )

    # A nested playlist needs its URIs rewritten too; a segment is passed through.
    if u.split("?", 1)[0].endswith(".m3u8"):
        base = str(request.base_url).rstrip("/")
        proxy_seg_base = f"{base}/api/integrations/frigate/patient/{patient_id}/live-seg"
        rewritten = _rewrite_hls_playlist(resp.text, u, proxy_seg_base)
        return Response(
            content=rewritten,
            media_type="application/vnd.apple.mpegurl",
            headers={"Cache-Control": "no-store"},
        )

    return Response(
        content=resp.content,
        media_type=resp.headers.get("content-type", "application/octet-stream"),
        headers={"Cache-Control": "no-store"},
    )


@router.get("/patient/{patient_id}/live-probe")
async def live_probe(
    patient_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(require_full_auth),
    account_id: int = Depends(get_current_account_id),
    _: bool = Depends(require_read_access),
):
    """Diagnostic: report the codecs go2rtc sees for the selected camera.

    Helps distinguish a browser-incompatible source codec (e.g. H.265 ->
    `bufferAppendError`) from a transport problem. Returns the raw go2rtc
    stream info plus a flat list of detected codecs.
    """
    pi = _get_active_frigate(db, patient_id, account_id)
    client = _make_client(pi)
    camera = client.selected_camera()
    if not camera:
        raise HTTPException(status_code=400, detail="No camera selected for this patient")

    from urllib.parse import quote as _q
    url = f"{client.base_url_public()}/api/go2rtc/api/streams?src={_q(camera)}"
    try:
        async with httpx.AsyncClient(timeout=10.0) as http:
            resp = await http.get(url, headers=client._headers())
    except httpx.HTTPError as e:
        raise HTTPException(status_code=502, detail=f"Could not reach go2rtc: {e}")
    if resp.status_code != 200:
        raise HTTPException(status_code=502, detail=f"go2rtc /streams returned {resp.status_code}")

    data = resp.json()
    # go2rtc shape: { "<name>": { "producers": [ { "medias": ["video, recvonly, H265 ...", ...] } ] } }
    codecs: List[str] = []
    for stream in (data.values() if isinstance(data, dict) else []):
        for producer in (stream or {}).get("producers", []) or []:
            for media in (producer or {}).get("medias", []) or []:
                codecs.append(media)

    return {"camera": camera, "codecs": codecs, "raw": data}


@router.get("/patient/{patient_id}/download")
async def download_clip(
    patient_id: int,
    start: int = Query(..., description="Event start time (unix seconds)"),
    end: int = Query(..., description="Event end time (unix seconds)"),
    inline: bool = Query(False, description="If true, serve with Content-Disposition: inline for <video> playback"),
    db: Session = Depends(get_db),
    current_user=Depends(require_full_auth),
    account_id: int = Depends(get_current_account_id),
    _: bool = Depends(require_read_access),
):
    """
    Stream the MP4 clip from Frigate.

    Defaults to `Content-Disposition: attachment` so the browser saves the
    file (needed for the `<a download>` button to work cross-origin). Pass
    `inline=1` to get `Content-Disposition: inline` for `<video>` playback.

    The clip range matches the user-configured `clip_padding_seconds`
    setting so the saved file lines up with what they see in the inline
    player.
    """
    if end <= start:
        raise HTTPException(status_code=400, detail="end must be > start")

    pi = _get_active_frigate(db, patient_id, account_id)
    client = _make_client(pi)
    camera = client.selected_camera()
    if not camera:
        raise HTTPException(status_code=400, detail="No camera selected for this patient")

    upstream = client.get_clip_url(camera, start, end)
    filename = f"{camera}_{start}-{end}.mp4"

    async def stream():
        # Long timeout to allow Frigate to assemble the clip on demand.
        async with httpx.AsyncClient(timeout=httpx.Timeout(60.0, read=120.0)) as http:
            async with http.stream("GET", upstream, headers=client._headers()) as resp:
                if resp.status_code != 200:
                    body = await resp.aread()
                    raise HTTPException(
                        status_code=502,
                        detail=f"Frigate returned {resp.status_code}: {body[:200].decode(errors='replace')}",
                    )
                async for chunk in resp.aiter_bytes(chunk_size=64 * 1024):
                    yield chunk

    disposition = "inline" if inline else "attachment"
    return StreamingResponse(
        stream(),
        media_type="video/mp4",
        headers={"Content-Disposition": f'{disposition}; filename="{filename}"'},
    )


# ---------------------------------------------------------------------------
# Persisted clips (saved to ./data/clips/ on disk)
# ---------------------------------------------------------------------------


@router.get("/patient/{patient_id}/clips/status", response_model=FrigateClipStatusResponse)
async def get_clip_status(
    patient_id: int,
    start: int = Query(...),
    end: int = Query(...),
    db: Session = Depends(get_db),
    current_user=Depends(require_full_auth),
    account_id: int = Depends(get_current_account_id),
    _: bool = Depends(require_read_access),
):
    if end <= start:
        raise HTTPException(status_code=400, detail="end must be > start")

    pi = _get_active_frigate(db, patient_id, account_id)
    client = _make_client(pi)
    camera = client.selected_camera()
    if not camera:
        raise HTTPException(status_code=400, detail="No camera selected for this patient")

    path = _clip_path(patient_id, camera, start, end)
    if path.exists():
        stat = path.stat()
        return FrigateClipStatusResponse(
            camera=camera, start=start, end=end,
            saved=True, file_size=stat.st_size,
            saved_at=datetime.utcfromtimestamp(stat.st_mtime),
        )
    return FrigateClipStatusResponse(camera=camera, start=start, end=end, saved=False)


@router.post("/patient/{patient_id}/clips", response_model=FrigateClipStatusResponse)
async def save_clip(
    patient_id: int,
    start: int = Query(...),
    end: int = Query(...),
    db: Session = Depends(get_db),
    current_user=Depends(require_full_auth),
    account_id: int = Depends(get_current_account_id),
):
    """Download the MP4 from Frigate and persist it under ./data/clips/."""
    if end <= start:
        raise HTTPException(status_code=400, detail="end must be > start")

    pi = _get_active_frigate(db, patient_id, account_id)
    client = _make_client(pi)
    camera = client.selected_camera()
    if not camera:
        raise HTTPException(status_code=400, detail="No camera selected for this patient")

    path = _clip_path(patient_id, camera, start, end)
    path.parent.mkdir(parents=True, exist_ok=True)

    upstream = client.get_clip_url(camera, start, end)

    # Stream to a temp file in the same dir, then atomic-rename, so partial
    # writes don't leave a half-broken file in place.
    tmp_fd, tmp_path = tempfile.mkstemp(dir=path.parent, suffix=".part")
    os.close(tmp_fd)
    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(60.0, read=120.0)) as http:
            async with http.stream("GET", upstream, headers=client._headers()) as resp:
                if resp.status_code != 200:
                    body = await resp.aread()
                    raise HTTPException(
                        status_code=502,
                        detail=f"Frigate returned {resp.status_code}: {body[:200].decode(errors='replace')}",
                    )
                with open(tmp_path, "wb") as f:
                    async for chunk in resp.aiter_bytes(chunk_size=64 * 1024):
                        f.write(chunk)
        os.replace(tmp_path, path)
    except Exception:
        if os.path.exists(tmp_path):
            os.unlink(tmp_path)
        raise

    stat = path.stat()
    return FrigateClipStatusResponse(
        camera=camera, start=start, end=end,
        saved=True, file_size=stat.st_size,
        saved_at=datetime.utcfromtimestamp(stat.st_mtime),
    )


@router.get("/patient/{patient_id}/clips/file")
async def get_clip_file(
    patient_id: int,
    start: int = Query(...),
    end: int = Query(...),
    dl: bool = Query(False, description="If true, serve with Content-Disposition: attachment"),
    db: Session = Depends(get_db),
    current_user=Depends(require_full_auth),
    account_id: int = Depends(get_current_account_id),
    _: bool = Depends(require_read_access),
):
    """Serve a previously-saved clip from disk (with Range support for seeking)."""
    if end <= start:
        raise HTTPException(status_code=400, detail="end must be > start")

    pi = _get_active_frigate(db, patient_id, account_id)
    client = _make_client(pi)
    camera = client.selected_camera()
    if not camera:
        raise HTTPException(status_code=400, detail="No camera selected for this patient")

    path = _clip_path(patient_id, camera, start, end)
    if not path.exists():
        raise HTTPException(status_code=404, detail="Clip not saved yet")

    filename = path.name
    disposition = "attachment" if dl else "inline"
    return FileResponse(
        path=str(path),
        media_type="video/mp4",
        headers={"Content-Disposition": f'{disposition}; filename="{filename}"'},
    )


@router.delete("/patient/{patient_id}/clips")
async def delete_clip(
    patient_id: int,
    start: int = Query(...),
    end: int = Query(...),
    db: Session = Depends(get_db),
    current_user=Depends(require_full_auth),
    account_id: int = Depends(get_current_account_id),
):
    pi = _get_active_frigate(db, patient_id, account_id)
    client = _make_client(pi)
    camera = client.selected_camera()
    if not camera:
        raise HTTPException(status_code=400, detail="No camera selected for this patient")
    path = _clip_path(patient_id, camera, start, end)
    if path.exists():
        path.unlink()
    return {"deleted": True}
