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
Open-Meteo weather + air-quality connector (GH #47).

Zero-hardware outdoor data: free, no API key (noncommercial tier,
https://open-meteo.com/en/terms). Two endpoints:

- Weather:      https://api.open-meteo.com/v1/forecast
- Air quality:  https://air-quality-api.open-meteo.com/v1/air-quality

Both return hourly series; we request ``past_days`` + ``forecast_days=1`` and
keep only hours that are already in the past — forecast values are never
stored. Backfill uses the same endpoints with ``past_days=92`` (the maximum
both support). The dedicated archive API would allow more history but lags
~5 days behind real time; 92 days is plenty for the correlation features.

All Open-Meteo native units are already our canonical units (hPa, °C, %, mm,
µg/m³, grains/m³), so no conversion is needed. Pollen (CAMS model) is
Europe-only; hours where every pollen species is null are simply skipped.
"""
import logging
from datetime import datetime, timezone
from typing import Dict, List, Optional

import httpx

from environment.base import EnvironmentConnector, EnvObservation
from environment.metrics import canonical_unit
from environment.registry import register

logger = logging.getLogger("environment")

WEATHER_URL = "https://api.open-meteo.com/v1/forecast"
AIR_QUALITY_URL = "https://air-quality-api.open-meteo.com/v1/air-quality"

# Open-Meteo hourly variable -> catalog metric
WEATHER_VARS = {
    "surface_pressure": "barometric_pressure",
    "pressure_msl": "barometric_pressure_msl",
    "temperature_2m": "temperature",
    "relative_humidity_2m": "relative_humidity",
    "precipitation": "precipitation",
}
AIR_QUALITY_VARS = {
    "us_aqi": "aqi",
    "pm2_5": "pm25",
    "ozone": "ozone",
}
# Combined into a single "pollen" metric as the per-hour max across species.
POLLEN_VARS = (
    "grass_pollen", "birch_pollen", "ragweed_pollen",
    "alder_pollen", "mugwort_pollen", "olive_pollen",
)

MAX_BACKFILL_DAYS = 92


@register
class OpenMeteoConnector(EnvironmentConnector):
    slug = "open_meteo"
    name = "Open-Meteo Weather"
    description = (
        "Outdoor weather and air quality for the home location — pressure, "
        "temperature, humidity, precipitation, AQI, PM2.5, ozone, pollen. "
        "Free, no API key, no hardware."
    )
    metrics_provided = (
        list(WEATHER_VARS.values()) + list(AIR_QUALITY_VARS.values()) + ["pollen"]
    )

    def __init__(self, config: Dict, client: Optional[httpx.AsyncClient] = None):
        super().__init__(config)
        # Injectable for tests (httpx.MockTransport); owned by the caller then.
        self._client = client

    @classmethod
    def get_config_schema(cls) -> Dict:
        return {
            "type": "object",
            "required": ["latitude", "longitude"],
            "properties": {
                "enabled": {"type": "boolean", "default": False},
                "latitude": {"type": "number", "minimum": -90, "maximum": 90},
                "longitude": {"type": "number", "minimum": -180, "maximum": 180},
                "location_label": {"type": "string", "description": "Display name, e.g. city"},
                "poll_interval_minutes": {"type": "integer", "minimum": 15, "default": 60},
            },
        }

    @classmethod
    def is_configured(cls, config: Dict) -> bool:
        return (
            isinstance(config.get("latitude"), (int, float))
            and isinstance(config.get("longitude"), (int, float))
        )

    @property
    def _source_id(self) -> str:
        return f"{round(float(self.config['latitude']), 4)},{round(float(self.config['longitude']), 4)}"

    async def poll(self) -> List[EnvObservation]:
        """Fetch the last ~24h of hourly readings (dedup makes re-reads free)."""
        return await self._fetch(past_days=1)

    async def backfill(self, days: int) -> List[EnvObservation]:
        return await self._fetch(past_days=min(int(days), MAX_BACKFILL_DAYS))

    async def test_connection(self) -> bool:
        try:
            obs = await self._fetch(past_days=1, air_quality=False)
            return len(obs) > 0
        except Exception:
            return False

    async def _fetch(self, past_days: int, air_quality: bool = True) -> List[EnvObservation]:
        """
        Fetch and normalize both series. Weather and air-quality failures are
        independent: whichever succeeds is returned, so an air-quality outage
        doesn't cost us pressure data. Raises only if *both* fail (or weather
        fails when air_quality=False) so callers can record an error state.
        """
        base_params = {
            "latitude": self.config["latitude"],
            "longitude": self.config["longitude"],
            "timezone": "UTC",
            "past_days": past_days,
            "forecast_days": 1,
        }
        observations: List[EnvObservation] = []
        errors: List[str] = []

        client = self._client or httpx.AsyncClient(timeout=30)
        owns_client = self._client is None
        try:
            weather_ok = False
            try:
                payload = await self._get_json(client, WEATHER_URL, {
                    **base_params, "hourly": ",".join(WEATHER_VARS.keys()),
                })
                observations.extend(self._parse_hourly(payload, WEATHER_VARS))
                weather_ok = True
            except Exception as e:
                errors.append(f"weather: {e}")
                logger.warning(f"Open-Meteo weather fetch failed: {e}")

            if air_quality:
                try:
                    payload = await self._get_json(client, AIR_QUALITY_URL, {
                        **base_params,
                        "hourly": ",".join(list(AIR_QUALITY_VARS.keys()) + list(POLLEN_VARS)),
                    })
                    observations.extend(self._parse_hourly(payload, AIR_QUALITY_VARS))
                    observations.extend(self._parse_pollen(payload))
                except Exception as e:
                    errors.append(f"air quality: {e}")
                    logger.warning(f"Open-Meteo air-quality fetch failed: {e}")

            if not weather_ok and not observations:
                raise RuntimeError("; ".join(errors) or "no data returned")
            return observations
        finally:
            if owns_client:
                await client.aclose()

    async def _get_json(self, client: httpx.AsyncClient, url: str, params: Dict) -> Dict:
        resp = await client.get(url, params=params)
        resp.raise_for_status()
        return resp.json()

    def _parse_hourly(self, payload: Dict, var_map: Dict[str, str]) -> List[EnvObservation]:
        hourly = payload.get("hourly") or {}
        times = self._parse_times(hourly.get("time") or [])
        out: List[EnvObservation] = []
        now = datetime.now(timezone.utc)
        for var, metric in var_map.items():
            values = hourly.get(var)
            if not values:
                continue
            unit = canonical_unit(metric)
            for ts, value in zip(times, values):
                if value is None or ts is None or ts > now:
                    continue  # skip nulls and forecast hours
                out.append(EnvObservation(
                    timestamp=ts, metric=metric, value=float(value), unit=unit,
                    scope="outdoor", location="", source_id=self._source_id,
                    quality="measured",
                ))
        return out

    def _parse_pollen(self, payload: Dict) -> List[EnvObservation]:
        """Per-hour max across pollen species; hours with all-null are skipped
        (CAMS pollen coverage is Europe-only)."""
        hourly = payload.get("hourly") or {}
        times = self._parse_times(hourly.get("time") or [])
        series = [hourly.get(var) for var in POLLEN_VARS if hourly.get(var)]
        if not series:
            return []
        unit = canonical_unit("pollen")
        out: List[EnvObservation] = []
        now = datetime.now(timezone.utc)
        for i, ts in enumerate(times):
            if ts is None or ts > now:
                continue
            values = [s[i] for s in series if i < len(s) and s[i] is not None]
            if not values:
                continue
            out.append(EnvObservation(
                timestamp=ts, metric="pollen", value=float(max(values)), unit=unit,
                scope="outdoor", location="", source_id=self._source_id,
                quality="measured",
            ))
        return out

    @staticmethod
    def _parse_times(raw_times: List[str]) -> List[Optional[datetime]]:
        """Open-Meteo returns naive ISO strings in the requested timezone —
        we always request UTC, so attach tzinfo accordingly."""
        parsed: List[Optional[datetime]] = []
        for t in raw_times:
            try:
                parsed.append(datetime.fromisoformat(t).replace(tzinfo=timezone.utc))
            except (ValueError, TypeError):
                parsed.append(None)
        return parsed
