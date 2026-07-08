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
# serve.py
"""
Production launcher: HTTP + optional HTTPS listeners in ONE process.

The backend has in-process singletons (EventBus, WebSocketModule fanout,
MQTTModule), so TLS cannot be a second OS process. Instead this supervisor
runs up to two uvicorn Servers on one event loop sharing one app:

  - HTTP :8000  — always on; owns the ASGI lifespan (startup/shutdown events).
  - HTTPS :8443 — started only when a cert is installed and https_mode is
    duckdns/byo; runs with lifespan OFF so startup_event never fires twice.

The HTTPS listener is stopped/restarted (never the whole process) when
tls_manager.restart_event fires — first issuance, renewal, disable — so a
cert rotation is a <1s blip on :8443 with :8000 untouched.

Used only by the unified-image entrypoint. Dev compose keeps the plain
`uvicorn --reload` CLI and the HA add-on stays HTTP-only behind ingress.
"""
import asyncio
import contextlib
import logging
import os
import signal
import sys

import uvicorn

import tls_manager

logger = logging.getLogger("serve")

HTTP_PORT = int(os.environ.get("PORT", "8000"))
HTTPS_PORT = int(os.environ.get("HTTPS_PORT", "8443"))

_HTTPS_MODES = ("duckdns", "byo")


def _truthy(value: str) -> bool:
    return (value or "").strip().lower() in ("1", "true", "yes", "on")


class SupervisedServer(uvicorn.Server):
    """uvicorn.Server that leaves signal handling to the supervisor.

    Server.serve() normally installs its own SIGINT/SIGTERM handlers; with two
    servers on one loop the handlers would nest and a stop signal would only
    reach one listener. The supervisor installs a single handler for both.
    """

    @contextlib.contextmanager
    def capture_signals(self):
        yield


def _base_kwargs() -> dict:
    behind_proxy = _truthy(os.environ.get("SHH_BEHIND_PROXY", ""))
    kwargs = dict(
        host="0.0.0.0",
        proxy_headers=behind_proxy,
        log_level=os.environ.get("UVICORN_LOG_LEVEL", "info"),
    )
    if behind_proxy:
        kwargs["forwarded_allow_ips"] = os.environ.get("FORWARDED_ALLOW_IPS", "*")
    return kwargs


def _http_config() -> uvicorn.Config:
    return uvicorn.Config("main:app", port=HTTP_PORT, **_base_kwargs())


def _https_config() -> uvicorn.Config:
    kwargs = _base_kwargs()
    # The always-on HTTP server owns the lifespan; running it here too would
    # fire startup_event (MQTT init, bus subscribers) twice — and again on
    # every cert renewal.
    kwargs["lifespan"] = "off"
    # TLS is terminated here, not at a proxy: scheme is natively https.
    kwargs["proxy_headers"] = False
    kwargs.pop("forwarded_allow_ips", None)
    return uvicorn.Config(
        "main:app",
        port=HTTPS_PORT,
        ssl_certfile=tls_manager.cert_path(),
        ssl_keyfile=tls_manager.key_path(),
        **kwargs,
    )


def _read_https_mode() -> str:
    """Read https_mode from settings; DB is up (entrypoint waited/migrated)."""
    # The SQLAlchemy mapper registry is only complete once the app module (and
    # through it every schema/model package) is imported; querying earlier
    # fails mapper configuration and would misread the mode as "off".
    import main  # noqa: F401 - imported for its side effect, cached afterwards
    from db import SessionLocal
    from crud.settings import get_setting

    db = SessionLocal()
    try:
        return get_setting(db, "https_mode", "off") or "off"
    finally:
        db.close()


async def _want_https() -> bool:
    if _truthy(os.environ.get("SHH_INGRESS", "")):
        return False  # HA ingress terminates TLS; never serve it ourselves
    if not tls_manager.cert_available():
        return False
    try:
        mode = await asyncio.to_thread(_read_https_mode)
    except Exception as e:  # noqa: BLE001 - a DB hiccup must not kill serving
        logger.warning("Could not read https_mode, keeping HTTPS off: %s", e)
        return False
    return mode in _HTTPS_MODES


def _validate_installed_pair() -> None:
    with open(tls_manager.cert_path(), "rb") as f:
        cert_pem = f.read()
    with open(tls_manager.key_path(), "rb") as f:
        key_pem = f.read()
    tls_manager.validate_cert_key_pair(cert_pem, key_pem)


async def _run_https(server: SupervisedServer) -> None:
    try:
        await server.serve()
    except Exception as e:  # noqa: BLE001 - surface to UI, keep HTTP alive
        logger.error("HTTPS listener failed: %s", e)
        tls_manager.https_state["error"] = str(e)
    finally:
        tls_manager.https_state["running"] = False


async def _start_https() -> tuple:
    """Try to start the HTTPS listener; returns (server, task) or (None, None)."""
    try:
        await asyncio.to_thread(_validate_installed_pair)
    except Exception as e:  # noqa: BLE001
        logger.error("Installed certificate is unusable, HTTPS stays off: %s", e)
        tls_manager.https_state["error"] = str(e)
        return None, None
    server = SupervisedServer(_https_config())
    task = asyncio.create_task(_run_https(server), name="https-listener")
    # Wait briefly for startup so status reporting is accurate and a bad
    # cert/port surfaces here rather than silently later.
    for _ in range(100):
        if server.started or task.done():
            break
        await asyncio.sleep(0.1)
    if task.done() or not server.started:
        if not task.done():
            server.should_exit = True
            await task
        logger.error(
            "HTTPS listener did not start: %s",
            tls_manager.https_state["error"] or "startup failed",
        )
        tls_manager.https_state["error"] = (
            tls_manager.https_state["error"] or "HTTPS listener failed to start"
        )
        return None, None
    tls_manager.https_state["running"] = True
    tls_manager.https_state["error"] = None
    logger.info("HTTPS listener up on :%d", HTTPS_PORT)
    return server, task


async def _stop_https(server, task) -> None:
    server.should_exit = True
    await task
    logger.info("HTTPS listener stopped")


async def main() -> int:
    loop = asyncio.get_running_loop()
    tls_manager.bind_supervisor_loop(loop)

    http_server = SupervisedServer(_http_config())
    https = {"server": None, "task": None}

    def _handle_stop_signal() -> None:
        http_server.should_exit = True
        if https["server"] is not None:
            https["server"].should_exit = True
        # Wake the supervisor so it notices the exit request immediately.
        tls_manager.restart_event.set()

    for sig in (signal.SIGINT, signal.SIGTERM):
        loop.add_signal_handler(sig, _handle_stop_signal)

    http_task = asyncio.create_task(http_server.serve(), name="http-listener")

    while not http_server.should_exit:
        tls_manager.restart_event.clear()

        if https["task"] is None and await _want_https():
            https["server"], https["task"] = await _start_https()

        waiters = {
            asyncio.create_task(tls_manager.restart_event.wait(), name="restart-wait"),
            http_task,
        }
        if https["task"] is not None:
            waiters.add(https["task"])
        done, pending = await asyncio.wait(waiters, return_when=asyncio.FIRST_COMPLETED)
        for t in pending:
            if t is not http_task and t is not https["task"]:
                t.cancel()  # the restart_event waiter

        if http_task in done:
            break  # HTTP died or was stopped — shut everything down

        if https["task"] is not None and https["task"] in done:
            # HTTPS exited on its own (error already recorded). Don't restart
            # until the next explicit restart request to avoid a crash loop.
            https["server"], https["task"] = None, None
            if tls_manager.restart_event.is_set():
                continue
            await tls_manager.restart_event.wait()
            continue

        # restart_event fired: stop HTTPS (if up) and re-evaluate from the top.
        if https["task"] is not None and not http_server.should_exit:
            await _stop_https(https["server"], https["task"])
            https["server"], https["task"] = None, None

    # Drain: stop HTTPS first, then wait for HTTP to finish its shutdown.
    if https["task"] is not None:
        await _stop_https(https["server"], https["task"])
    http_server.should_exit = True
    await http_task
    return 0


if __name__ == "__main__":
    try:
        import uvloop

        uvloop.install()  # parity with the uvicorn CLI's auto loop selection
    except ImportError:
        pass
    sys.exit(asyncio.run(main()))
