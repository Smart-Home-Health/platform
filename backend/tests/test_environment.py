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
"""Environmental data platform (#46/#47): metric catalog, observation model +
hypertable, emit/dedup service, pressure deltas, Open-Meteo connector, poller,
and the /api/environment routes."""

from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import text

from environment import metrics as env_metrics


# ---------------------------------------------------------------------------
# Metric catalog
# ---------------------------------------------------------------------------

def test_every_metric_has_canonical_unit_and_label():
    for name, spec in env_metrics.METRICS.items():
        assert spec.get("unit"), f"{name} missing unit"
        assert spec.get("label"), f"{name} missing label"
        assert env_metrics.canonical_unit(name) == spec["unit"]


def test_pressure_delta_metrics_are_derived():
    for w in env_metrics.PRESSURE_DELTA_WINDOWS:
        assert env_metrics.is_derived(f"pressure_delta_{w}h")
    assert not env_metrics.is_derived("barometric_pressure")


def test_validate_observation_accepts_valid():
    env_metrics.validate_observation("barometric_pressure", "hPa", "outdoor", "measured")
    env_metrics.validate_observation("co2", "ppm", "room", "measured")
    env_metrics.validate_observation("pressure_delta_6h", "hPa", "outdoor", "estimated")


@pytest.mark.parametrize("args,match", [
    (("nope", "hPa", "outdoor", "measured"), "Unknown environmental metric"),
    (("temperature", "°F", "outdoor", "measured"), "Non-canonical unit"),
    (("temperature", "°C", "space", "measured"), "Invalid scope"),
    (("temperature", "°C", "outdoor", "guessed"), "Invalid quality"),
    (("pressure_delta_1h", "hPa", "outdoor", "measured"), "must have quality='estimated'"),
])
def test_validate_observation_rejects_invalid(args, match):
    with pytest.raises(ValueError, match=match):
        env_metrics.validate_observation(*args)


def test_canonical_unit_unknown_metric_raises():
    with pytest.raises(ValueError, match="Unknown environmental metric"):
        env_metrics.canonical_unit("humidity_of_the_void")


# ---------------------------------------------------------------------------
# Model + hypertable
# ---------------------------------------------------------------------------

def test_observation_roundtrip_and_hypertable(db_session):
    from schemas.environmental_observation import EnvironmentalObservation

    ts = datetime.now(timezone.utc).replace(microsecond=0)
    row = EnvironmentalObservation(
        timestamp=ts, metric="barometric_pressure", value=1004.2, unit="hPa",
        scope="outdoor", location="", source_type="open_meteo",
        source_id="40.0,-75.0", quality="measured",
    )
    db_session.add(row)
    db_session.commit()

    got = (db_session.query(EnvironmentalObservation)
           .filter(EnvironmentalObservation.metric == "barometric_pressure")
           .first())
    assert got is not None
    assert got.value == 1004.2
    assert got.quality == "measured"

    hyper = db_session.execute(
        text(
            "SELECT 1 FROM timescaledb_information.hypertables "
            "WHERE hypertable_name = 'environmental_observations'"
        )
    ).fetchone()
    assert hyper is not None, "environmental_observations is not a hypertable"


# ---------------------------------------------------------------------------
# Service: emit_observations
# ---------------------------------------------------------------------------

def _obs(metric="barometric_pressure", value=1004.2, unit="hPa", ts=None, **kw):
    from environment.base import EnvObservation
    return EnvObservation(
        timestamp=ts or datetime.now(timezone.utc).replace(minute=0, second=0, microsecond=0),
        metric=metric, value=value, unit=unit, **kw,
    )


def _count(db_session, **filters):
    from schemas.environmental_observation import EnvironmentalObservation
    q = db_session.query(EnvironmentalObservation)
    for k, v in filters.items():
        q = q.filter(getattr(EnvironmentalObservation, k) == v)
    return q.count()


def test_emit_observations_persists_and_dedups(db_session):
    from environment.service import emit_observations

    batch = [_obs(), _obs(metric="temperature", value=21.5, unit="°C")]
    assert emit_observations(db_session, "test_src", batch) == 2
    db_session.commit()

    # Same batch again: unique constraint absorbs it
    assert emit_observations(db_session, "test_src", batch) == 0
    db_session.commit()
    assert _count(db_session, source_type="test_src") == 2


def test_emit_observations_rejects_unknown_metric(db_session):
    from environment.service import emit_observations
    with pytest.raises(ValueError, match="Unknown environmental metric"):
        emit_observations(db_session, "test_src", [_obs(metric="vibes", unit="hPa")])


def test_emit_observations_rejects_wrong_unit(db_session):
    from environment.service import emit_observations
    with pytest.raises(ValueError, match="Non-canonical unit"):
        emit_observations(db_session, "test_src", [_obs(metric="temperature", unit="°F")])


def test_emit_observations_publishes_only_fresh_events(db_session, monkeypatch):
    import environment.service as svc

    published = []
    monkeypatch.setattr(svc, "publish_event", published.append)

    fresh = _obs(ts=datetime.now(timezone.utc) - timedelta(minutes=10))
    stale = _obs(ts=datetime.now(timezone.utc) - timedelta(days=3))
    assert svc.emit_observations(db_session, "test_src", [fresh, stale]) == 2
    assert len(published) == 1
    assert published[0].metric == "barometric_pressure"

    # publish_events=False (backfill path) suppresses even fresh ones
    fresher = _obs(ts=datetime.now(timezone.utc) - timedelta(minutes=5),
                   metric="temperature", value=20.0, unit="°C")
    svc.emit_observations(db_session, "test_src", [fresher], publish_events=False)
    assert len(published) == 1


# ---------------------------------------------------------------------------
# Service: pressure deltas
# ---------------------------------------------------------------------------

def _seed_pressure_series(db_session, hours=25, source="test_src"):
    """Hourly surface-pressure series ending now, values 1000, 1001, ..."""
    from environment.service import emit_observations
    end = datetime.now(timezone.utc).replace(minute=0, second=0, microsecond=0)
    series = [
        _obs(ts=end - timedelta(hours=h), value=1000.0 + (hours - 1 - h))
        for h in range(hours)
    ]
    emit_observations(db_session, source, series, publish_events=False)
    db_session.commit()
    return end


def test_pressure_deltas_all_windows(db_session):
    from environment.service import compute_pressure_deltas, emit_observations

    end = _seed_pressure_series(db_session, hours=25)
    deltas = compute_pressure_deltas(db_session, "test_src")
    emit_observations(db_session, "test_src", deltas, publish_events=False)
    db_session.commit()

    from schemas.environmental_observation import EnvironmentalObservation
    for w in (1, 3, 6, 12, 24):
        row = (db_session.query(EnvironmentalObservation)
               .filter(EnvironmentalObservation.metric == f"pressure_delta_{w}h",
                       EnvironmentalObservation.timestamp == end)
               .one())
        # Series rises 1 hPa/hour, so the delta over w hours is exactly w
        assert row.value == float(w)
        assert row.quality == "estimated"

    # The oldest timestamp has no lead-in, so no deltas exist for it
    oldest = end - timedelta(hours=24)
    assert _count(db_session, metric="pressure_delta_1h", timestamp=oldest) == 0


def test_pressure_deltas_idempotent_and_since_bounded(db_session):
    from environment.service import compute_pressure_deltas, emit_observations

    end = _seed_pressure_series(db_session, hours=25)
    first = compute_pressure_deltas(db_session, "test_src")
    assert emit_observations(db_session, "test_src", first, publish_events=False) > 0
    db_session.commit()

    # Re-run: same deltas, all deduped
    again = compute_pressure_deltas(db_session, "test_src")
    assert emit_observations(db_session, "test_src", again, publish_events=False) == 0

    # since= only emits deltas for timestamps at/after since
    recent = compute_pressure_deltas(db_session, "test_src",
                                     since=end - timedelta(hours=2))
    assert recent and all(d.timestamp >= end - timedelta(hours=2) for d in recent)


def test_pressure_deltas_missing_base_hour(db_session):
    from environment.service import compute_pressure_deltas

    from environment.service import emit_observations

    now = datetime.now(timezone.utc).replace(minute=0, second=0, microsecond=0)
    # Two points 2h apart: no delta window has a base reading, so zero deltas.
    emit_observations(db_session, "test_src", [
        _obs(ts=now - timedelta(hours=2), value=1000.0),
        _obs(ts=now, value=1004.0),
    ], publish_events=False)
    db_session.commit()
    assert compute_pressure_deltas(db_session, "test_src") == []


# ---------------------------------------------------------------------------
# Service: connector config/state
# ---------------------------------------------------------------------------

def test_connector_config_and_state_roundtrip(db_session):
    from environment.service import (
        get_connector_config, save_connector_config,
        get_connector_state, save_connector_state,
    )

    assert get_connector_config(db_session, "open_meteo") == {}
    save_connector_config(db_session, "open_meteo",
                          {"enabled": True, "latitude": 40.0, "longitude": -75.0})
    cfg = get_connector_config(db_session, "open_meteo")
    assert cfg["enabled"] is True and cfg["latitude"] == 40.0

    save_connector_state(db_session, "open_meteo", last_status="success")
    state = save_connector_state(db_session, "open_meteo", last_insert_count=12)
    assert state["last_status"] == "success"  # merged, not replaced
    assert get_connector_state(db_session, "open_meteo")["last_insert_count"] == 12


# ---------------------------------------------------------------------------
# Open-Meteo connector (mocked HTTP)
# ---------------------------------------------------------------------------

import asyncio

import httpx


def _iso_hours(n, end=None):
    """n hourly ISO timestamps (naive UTC, Open-Meteo style), oldest first."""
    end = end or datetime.now(timezone.utc).replace(minute=0, second=0, microsecond=0)
    return [(end - timedelta(hours=h)).strftime("%Y-%m-%dT%H:%M") for h in range(n - 1, -1, -1)]


def _weather_payload(times, future_times=()):
    all_times = list(times) + list(future_times)
    n = len(all_times)
    return {
        "hourly": {
            "time": all_times,
            "surface_pressure": [1000.0 + i for i in range(n)],
            "pressure_msl": [1010.0 + i for i in range(n)],
            "temperature_2m": [20.0 + i for i in range(n)],
            "relative_humidity_2m": [50.0] * n,
            "precipitation": [None] + [0.0] * (n - 1),  # one null (oldest hour) to skip
        }
    }


def _aq_payload(times, pollen=True):
    n = len(times)
    hourly = {
        "time": list(times),
        "us_aqi": [42.0] * n,
        "pm2_5": [7.5] * n,
        "ozone": [60.0] * n,
    }
    if pollen:
        hourly["grass_pollen"] = [5.0] * n
        hourly["birch_pollen"] = [9.0] * n  # max should win
        hourly["ragweed_pollen"] = [None] * n
    else:
        hourly["grass_pollen"] = [None] * n
        hourly["birch_pollen"] = [None] * n
    return {"hourly": hourly}


def _mock_connector(handler, config=None):
    from environment.connectors.open_meteo import OpenMeteoConnector
    client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    return OpenMeteoConnector(
        config or {"latitude": 40.0, "longitude": -75.0}, client=client
    )


def test_open_meteo_poll_maps_metrics():
    times = _iso_hours(3)
    future = [(datetime.now(timezone.utc) + timedelta(hours=2)).strftime("%Y-%m-%dT%H:%M")]

    def handler(request):
        if request.url.host == "api.open-meteo.com":
            return httpx.Response(200, json=_weather_payload(times, future_times=future))
        return httpx.Response(200, json=_aq_payload(times))

    obs = asyncio.run(_mock_connector(handler).poll())
    by_metric = {}
    for o in obs:
        by_metric.setdefault(o.metric, []).append(o)

    # 3 past hours per weather metric (future hour dropped), minus the one null
    assert len(by_metric["barometric_pressure"]) == 3
    assert len(by_metric["precipitation"]) == 2  # null skipped
    assert len(by_metric["aqi"]) == 3
    assert len(by_metric["pollen"]) == 3
    assert all(o.value == 9.0 for o in by_metric["pollen"])  # max of species
    assert all(o.scope == "outdoor" and o.quality == "measured" for o in obs)
    assert all(o.unit == "hPa" for o in by_metric["barometric_pressure"])
    assert by_metric["barometric_pressure"][0].source_id == "40.0,-75.0"
    # No forecast timestamps stored
    now = datetime.now(timezone.utc)
    assert all(o.timestamp <= now for o in obs)


def test_open_meteo_all_null_pollen_skipped():
    times = _iso_hours(2)

    def handler(request):
        if request.url.host == "api.open-meteo.com":
            return httpx.Response(200, json=_weather_payload(times))
        return httpx.Response(200, json=_aq_payload(times, pollen=False))

    obs = asyncio.run(_mock_connector(handler).poll())
    assert not [o for o in obs if o.metric == "pollen"]
    assert [o for o in obs if o.metric == "aqi"]  # other AQ metrics unaffected


def test_open_meteo_partial_failure_keeps_weather():
    times = _iso_hours(2)

    def handler(request):
        if request.url.host == "api.open-meteo.com":
            return httpx.Response(200, json=_weather_payload(times))
        return httpx.Response(500)

    obs = asyncio.run(_mock_connector(handler).poll())
    metrics_seen = {o.metric for o in obs}
    assert "barometric_pressure" in metrics_seen
    assert "aqi" not in metrics_seen


def test_open_meteo_total_failure_raises():
    def handler(request):
        return httpx.Response(500)

    with pytest.raises(RuntimeError):
        asyncio.run(_mock_connector(handler).poll())


def test_open_meteo_test_connection():
    times = _iso_hours(2)

    def ok(request):
        return httpx.Response(200, json=_weather_payload(times))

    def down(request):
        raise httpx.ConnectError("no route to host")

    assert asyncio.run(_mock_connector(ok).test_connection()) is True
    assert asyncio.run(_mock_connector(down).test_connection()) is False


def test_open_meteo_backfill_caps_past_days():
    seen = {}

    def handler(request):
        seen[request.url.host] = dict(request.url.params)
        return httpx.Response(200, json=_weather_payload(_iso_hours(2)))

    asyncio.run(_mock_connector(handler).backfill(days=400))
    assert seen["api.open-meteo.com"]["past_days"] == "92"


def test_open_meteo_is_configured():
    from environment.connectors.open_meteo import OpenMeteoConnector
    assert OpenMeteoConnector.is_configured({"latitude": 40.0, "longitude": -75.0})
    assert not OpenMeteoConnector.is_configured({"latitude": 40.0})
    assert not OpenMeteoConnector.is_configured({"latitude": "40", "longitude": "-75"})


def test_open_meteo_registered():
    from environment.registry import registry
    cls = registry.get("open_meteo")
    assert cls is not None and cls.poll_capable


# ---------------------------------------------------------------------------
# Poller
# ---------------------------------------------------------------------------

def _fake_connector(observations, slug="fake_src", capable=True, configured=True):
    from environment.base import EnvironmentConnector

    class FakeConnector(EnvironmentConnector):
        pass

    FakeConnector.slug = slug
    FakeConnector.name = "Fake"
    FakeConnector.poll_capable = capable
    FakeConnector.is_configured = classmethod(lambda cls, cfg: configured)

    async def poll(self):
        return observations
    FakeConnector.poll = poll
    return FakeConnector


def test_poll_once_polls_enabled_configured_and_records_state(db_session, monkeypatch):
    from environment import poller
    from environment.registry import registry
    from environment.service import get_connector_state, save_connector_config

    obs = [_obs(ts=datetime.now(timezone.utc).replace(minute=0, second=0, microsecond=0))]
    monkeypatch.setitem(registry._connectors, "fake_src", _fake_connector(obs))
    save_connector_config(db_session, "fake_src", {"enabled": True})

    inserted = asyncio.run(poller.poll_once(db_session))
    assert inserted == 1
    state = get_connector_state(db_session, "fake_src")
    assert state["last_status"] == "success"
    assert state["last_insert_count"] == 1
    assert state["last_poll_at"]

    # Within the poll interval nothing is due, so a second pass is a no-op
    assert asyncio.run(poller.poll_once(db_session)) == 0


def test_poll_once_skips_disabled_and_push_mode(db_session, monkeypatch):
    from environment import poller
    from environment.registry import registry
    from environment.service import get_connector_state, save_connector_config

    obs = [_obs()]
    # Disabled poll-capable connector
    monkeypatch.setitem(registry._connectors, "off_src", _fake_connector(obs, slug="off_src"))
    # Enabled but push-mode connector
    monkeypatch.setitem(registry._connectors, "push_src",
                        _fake_connector(obs, slug="push_src", capable=False))
    save_connector_config(db_session, "push_src", {"enabled": True})

    assert asyncio.run(poller.poll_once(db_session)) == 0
    assert get_connector_state(db_session, "off_src") == {}
    assert get_connector_state(db_session, "push_src") == {}


def test_poll_once_records_error_state(db_session, monkeypatch):
    from environment import poller
    from environment.registry import registry
    from environment.service import get_connector_state, save_connector_config
    from environment.base import EnvironmentConnector

    class BrokenConnector(EnvironmentConnector):
        slug = "broken_src"
        name = "Broken"

        async def poll(self):
            raise RuntimeError("api exploded")

    monkeypatch.setitem(registry._connectors, "broken_src", BrokenConnector)
    save_connector_config(db_session, "broken_src", {"enabled": True})

    assert asyncio.run(poller.poll_once(db_session)) == 0
    state = get_connector_state(db_session, "broken_src")
    assert state["last_status"] == "error"
    assert "api exploded" in state["last_error"]


# ---------------------------------------------------------------------------
# API: /api/environment
# ---------------------------------------------------------------------------

def test_observations_default_window_and_filters(admin_client, db_session):
    _seed_pressure_series(db_session, hours=30)  # 30h series; default window is 24h

    resp = admin_client.get("/api/environment/observations")
    assert resp.status_code == 200
    rows = resp.json()
    assert rows and all(r["metric"] == "barometric_pressure" for r in rows)
    # Default 24h window excludes the oldest hours of the 30h series.
    # Series timestamps are truncated to the top of the hour, so the point at
    # end-24h sits just outside [now-24h, now]: 24 rows (end-0h .. end-23h).
    assert len(rows) == 24

    # Newest first
    assert rows[0]["ts"] >= rows[-1]["ts"]

    # Metric filter with no matches
    resp = admin_client.get("/api/environment/observations?metric=co2")
    assert resp.status_code == 200 and resp.json() == []

    # Scope + explicit range
    start = (datetime.now(timezone.utc) - timedelta(hours=2)).isoformat()
    resp = admin_client.get("/api/environment/observations",
                            params={"scope": "outdoor", "from": start})
    assert resp.status_code == 200
    assert len(resp.json()) == 2  # end-0h and end-1h; end-2h is just outside

    # limit
    resp = admin_client.get("/api/environment/observations?limit=5")
    assert len(resp.json()) == 5


def test_observations_rejects_unknown_vocab(admin_client):
    assert admin_client.get(
        "/api/environment/observations?metric=vibes").status_code == 400
    assert admin_client.get(
        "/api/environment/observations?scope=space").status_code == 400
    assert admin_client.get(
        "/api/environment/observations?bucket=2w").status_code == 400


def test_observations_bucketed(admin_client, db_session):
    _seed_pressure_series(db_session, hours=25)

    resp = admin_client.get(
        "/api/environment/observations?metric=barometric_pressure&bucket=6h")
    assert resp.status_code == 200
    buckets = resp.json()
    assert buckets
    first = buckets[0]
    assert {"ts", "metric", "avg", "min", "max", "samples", "unit"} <= set(first)
    assert first["min"] <= first["avg"] <= first["max"]
    assert sum(b["samples"] for b in buckets) == 24  # end-24h outside window


def test_locations_and_metrics_endpoints(admin_client, db_session):
    from environment.service import emit_observations
    emit_observations(db_session, "test_src", [
        _obs(),
        _obs(metric="co2", value=600.0, unit="ppm", scope="room", location="bedroom"),
    ], publish_events=False)
    db_session.commit()

    resp = admin_client.get("/api/environment/locations")
    assert resp.status_code == 200
    locs = {(l["scope"], l["location"]) for l in resp.json()}
    assert ("outdoor", "") in locs and ("room", "bedroom") in locs

    resp = admin_client.get("/api/environment/metrics")
    assert resp.status_code == 200
    by_name = {m["name"]: m for m in resp.json()}
    assert by_name["barometric_pressure"]["unit"] == "hPa"
    assert by_name["pressure_delta_6h"]["derived"] is True


def test_connectors_listing(admin_client):
    resp = admin_client.get("/api/environment/connectors")
    assert resp.status_code == 200
    by_slug = {c["slug"]: c for c in resp.json()}
    om = by_slug["open_meteo"]
    assert om["configured"] is False and om["enabled"] is False
    assert "latitude" in om["config_schema"]["properties"]
    assert om["poll_capable"] is True


def test_connector_config_put(admin_client):
    # Unknown slug
    assert admin_client.put("/api/environment/connectors/nope/config",
                            json={"enabled": False}).status_code == 404

    # Enabling without coordinates is rejected
    resp = admin_client.put("/api/environment/connectors/open_meteo/config",
                            json={"enabled": True})
    assert resp.status_code == 400

    # Valid config round-trips
    resp = admin_client.put(
        "/api/environment/connectors/open_meteo/config",
        json={"enabled": True, "latitude": 40.0, "longitude": -75.0,
              "location_label": "Home", "poll_interval_minutes": 60})
    assert resp.status_code == 200
    info = resp.json()
    assert info["enabled"] is True and info["configured"] is True
    assert info["config"]["location_label"] == "Home"

    # Out-of-range latitude -> validation error
    resp = admin_client.put(
        "/api/environment/connectors/open_meteo/config",
        json={"enabled": True, "latitude": 123.0, "longitude": 0.0})
    assert resp.status_code == 422


def test_connector_test_endpoint_requires_config(admin_client):
    resp = admin_client.post("/api/environment/connectors/open_meteo/test")
    assert resp.status_code == 400


def test_backfill_lifecycle(admin_client, monkeypatch):
    from environment import poller

    # Not configured -> 400
    resp = admin_client.post("/api/environment/connectors/open_meteo/backfill",
                             json={"days": 30})
    assert resp.status_code == 400

    admin_client.put(
        "/api/environment/connectors/open_meteo/config",
        json={"enabled": True, "latitude": 40.0, "longitude": -75.0})

    launched = {}

    async def fake_run_backfill(slug, days):
        launched["args"] = (slug, days)
    monkeypatch.setattr(poller, "run_backfill", fake_run_backfill)

    resp = admin_client.post("/api/environment/connectors/open_meteo/backfill",
                             json={"days": 30})
    assert resp.status_code == 202
    assert launched["args"] == ("open_meteo", 30)

    # days out of range
    resp = admin_client.post("/api/environment/connectors/open_meteo/backfill",
                             json={"days": 400})
    assert resp.status_code == 422

    # Already running -> 409
    monkeypatch.setattr(poller, "backfill_running", lambda slug: True)
    resp = admin_client.post("/api/environment/connectors/open_meteo/backfill",
                             json={"days": 30})
    assert resp.status_code == 409


def test_environment_auth_gates(client, admin_user, account):
    # Unauthenticated
    assert client.get("/api/environment/observations").status_code == 401
    assert client.put("/api/environment/connectors/open_meteo/config",
                      json={"enabled": False}).status_code == 401

    # Read-restricted token cannot read observations
    from routes.auth import create_access_token
    token = create_access_token(user=admin_user, account=account,
                                auth_level="full", read_restricted=True)
    resp = client.get("/api/environment/observations",
                      headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 403


def test_account_level_auth_cannot_write(account_client):
    # account-level (no user selected) fails require_full_auth on writes
    resp = account_client.put("/api/environment/connectors/open_meteo/config",
                              json={"enabled": False})
    assert resp.status_code == 403
