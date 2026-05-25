"""VOCSN ventilator export parser.

Reads:
  - TrendMetaData.json      — parameter dictionary (~528 entries)
  - deviceconfig            — binary key=value (serial / model / language)
  - counters.dat            — JSON therapy session counters
  - batch_NNNNNN.csv (×~92) — long-format time-series

Writes:
  - vent_parameter_dictionary (upsert)
  - vent_device_info
  - vent_samples (bulk insert)
  - calibration anchor on patient_integration.settings if pending

Skips (for now): slogger.log{1,2}, crashLog.bin, paramBackup.bin, usageMonitors.dat.
"""
from __future__ import annotations

import csv
import json
import logging
import os
import re
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional, Tuple

from sqlalchemy import text
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm.attributes import flag_modified

from schemas.vent_device_info import VentDeviceInfo
from schemas.vent_parameter_dictionary import VentParameterDictionary
from schemas.vent_sample import VentSample

from .base import VentilatorParser

logger = logging.getLogger("ventilator.vocsn")

VENDOR = "vocsn"
SAMPLE_BATCH_SIZE = 5000
# A column name in the batch CSV header is "<KeyID>" optionally followed by
# "_<suffix>" where suffix is N (single sample) or 5/50/95 (percentile aggregates).
HEADER_COL_RX = re.compile(r"^(?P<key>\d+)(?:_(?P<suffix>[A-Za-z0-9]+))?$")

# Files we know how to handle. Others are inventoried but skipped.
SKIPPED_FILES = {
    "slogger.log1", "slogger.log2", "crashLog.bin",
    "paramBackup.bin", "usageMonitors.dat",
}


class VocsnParser(VentilatorParser):
    model_slug = "vocsn"
    model_label = "VOCSN (Ventec Life Systems)"

    # ---------- public entry point ----------

    def parse(self) -> Dict[str, Any]:
        db = self.db
        pi = self.patient_integration
        vi = self.vent_import
        if db is None or pi is None or vi is None:
            raise RuntimeError("VocsnParser requires db/patient_integration/vent_import")

        settings = pi.settings or {}
        offset_seconds = float(settings.get("clock_offset_seconds") or 0.0)
        pending_iso = settings.get("clock_calibration_pending_at")
        pending_at: Optional[datetime] = None
        if pending_iso:
            try:
                pending_at = datetime.fromisoformat(pending_iso.replace("Z", "+00:00"))
            except ValueError:
                logger.warning("Bad pending_at in settings, ignoring: %r", pending_iso)

        files = sorted(os.listdir(self.extracted_dir))
        summary: Dict[str, Any] = {
            "model": self.model_label,
            "file_count": len(files),
            "skipped_files": [],
            "dictionary_count": 0,
            "sample_count": 0,
            "batch_files_parsed": 0,
            "earliest_sample_raw": None,
            "latest_sample_raw": None,
            "calibration": None,
        }

        # 1. Parameter dictionary
        meta_path = os.path.join(self.extracted_dir, "TrendMetaData.json")
        param_meta: Dict[str, Dict[str, Any]] = {}
        if os.path.exists(meta_path):
            with open(meta_path) as f:
                meta = json.load(f)
            param_meta = self._extract_parameter_dictionary(meta)
            self._upsert_dictionary(db, param_meta)
            summary["dictionary_count"] = len(param_meta)
        else:
            summary.setdefault("notes", []).append("TrendMetaData.json missing")

        # 2. Device info (deviceconfig + counters.dat)
        device_extra: Dict[str, Any] = {}
        device_kv = self._parse_deviceconfig(
            os.path.join(self.extracted_dir, "deviceconfig")
        )
        device_extra.update({f"deviceconfig.{k}": v for k, v in device_kv.items()})

        counters_path = os.path.join(self.extracted_dir, "counters.dat")
        if os.path.exists(counters_path):
            try:
                with open(counters_path) as f:
                    device_extra["counters"] = json.load(f)
            except Exception as e:
                device_extra["counters_parse_error"] = str(e)

        model = device_kv.get("model") or vi.model
        serial = device_kv.get("ventserial") or device_kv.get("serial") or vi.device_serial
        language = device_kv.get("language")

        # Persist device_info (single row per import)
        existing_dev = db.query(VentDeviceInfo).filter(
            VentDeviceInfo.import_id == vi.id
        ).first()
        if existing_dev:
            db.delete(existing_dev)
            db.flush()
        db.add(VentDeviceInfo(
            import_id=vi.id,
            vendor=VENDOR,
            model=model,
            serial=serial,
            firmware=None,
            language=language,
            extra=device_extra,
        ))
        # Also update VentImport with vendor model/serial for easy listing.
        vi.model = model
        vi.device_serial = serial
        db.add(vi)
        db.commit()

        # 3. Walk batch_*.csv files in numeric order.
        batch_files = sorted([
            f for f in files
            if f.startswith("batch_") and f.endswith(".csv")
        ])
        event_anchors: List[datetime] = []  # vent-time of all E-type rows

        # Pre-build a quick lookup: is this parameter_key enum?
        enum_keys = {
            k: m.get("enum_values") for k, m in param_meta.items()
            if m.get("enum_values")
        }

        sample_buffer: List[Dict[str, Any]] = []
        earliest_raw: Optional[datetime] = None
        latest_raw: Optional[datetime] = None

        for batch_name in batch_files:
            batch_path = os.path.join(self.extracted_dir, batch_name)
            try:
                header_map, rows_emitted, events = self._parse_batch_csv(
                    batch_path,
                    param_meta=param_meta,
                    enum_keys=enum_keys,
                    sample_buffer=sample_buffer,
                    offset_seconds=offset_seconds,
                    db=db,
                    patient_id=vi.patient_id,
                    import_id=vi.id,
                )
            except Exception as e:
                # Don't lose the whole import for one bad CSV — record it.
                summary.setdefault("file_errors", []).append({
                    "file": batch_name, "error": str(e),
                })
                logger.exception("Error in batch %s", batch_name)
                continue

            summary["batch_files_parsed"] += 1
            summary["sample_count"] += rows_emitted
            event_anchors.extend(events)

            # Track time range across all batches.
            if events or rows_emitted:
                # Pull from sample_buffer tail since rows_emitted is the count
                # just inserted in this batch — we already flushed; cheaper to
                # track during _parse_batch_csv. We update in batch via
                # bookkeeping in events list (E-type) and let max/min update
                # below via a quick query at the end.
                pass

            # Periodic flush + progress
            if len(sample_buffer) >= SAMPLE_BATCH_SIZE:
                self._flush_samples(db, sample_buffer)
                # Update parser_summary so the polling UI sees progress.
                vi.parser_summary = dict(summary)
                flag_modified(vi, "parser_summary")
                db.add(vi)
                db.commit()

        # Final flush
        if sample_buffer:
            self._flush_samples(db, sample_buffer)

        # 4. Compute earliest/latest sample times for the summary.
        rng = db.execute(text("""
            SELECT MIN(recorded_at_raw) AS lo, MAX(recorded_at_raw) AS hi
            FROM vent_samples WHERE import_id = :iid
        """), {"iid": vi.id}).first()
        if rng:
            summary["earliest_sample_raw"] = rng.lo.isoformat() if rng.lo else None
            summary["latest_sample_raw"] = rng.hi.isoformat() if rng.hi else None

        # 5. Skipped files (binary blobs + anything we didn't touch).
        for f in files:
            if f in SKIPPED_FILES:
                summary["skipped_files"].append(f)

        # 6. Calibration anchoring (if pending and we saw events)
        if pending_at and event_anchors:
            anchor = self._closest_anchor(event_anchors, pending_at)
            if anchor is not None:
                computed_offset = (pending_at - anchor).total_seconds()
                self._apply_calibration(
                    db, pi, vi.integration_id,
                    offset_seconds=computed_offset,
                    real_time=pending_at,
                    vent_time=anchor,
                )
                summary["calibration"] = {
                    "status": "anchored",
                    "anchor_vent_time": anchor.isoformat(),
                    "real_time": pending_at.isoformat(),
                    "offset_seconds": computed_offset,
                }
            else:
                summary["calibration"] = {
                    "status": "no_anchor_in_window",
                    "pending_at": pending_at.isoformat(),
                    "events_seen": len(event_anchors),
                }
        elif pending_at:
            summary["calibration"] = {
                "status": "no_events_in_archive",
                "pending_at": pending_at.isoformat(),
            }

        return summary

    # ---------- helpers ----------

    @staticmethod
    def _extract_parameter_dictionary(meta: Dict[str, Any]) -> Dict[str, Dict[str, Any]]:
        """Build {KeyID: {label, units, scale, precision, type, enum_values, grouping}}."""
        groupings = meta.get("Groupings") or {}
        # Reverse-map KeyID → grouping name. A KeyID may appear in multiple
        # groupings; we keep the first (preserves the file's order).
        key_to_group: Dict[str, str] = {}
        for group_name, payload in groupings.items():
            key_list = []
            if isinstance(payload, dict):
                key_list = payload.get("KeyID") or payload.get("KeyIDs") or []
            elif isinstance(payload, list):
                key_list = payload
            for k in key_list:
                key_to_group.setdefault(str(k), group_name)

        out: Dict[str, Dict[str, Any]] = {}
        for key, defn in (meta.get("Parameters") or {}).items():
            if not isinstance(defn, dict):
                continue
            scale = defn.get("scaleFactor")
            try:
                scale = float(scale) if scale is not None else None
            except (TypeError, ValueError):
                scale = None
            # Enum-mapped parameters store value→display in their own dict;
            # VOCSN puts the map at the top-level (the value rows themselves
            # are top-level integer-keyed strings like "2150": "ON"). They are
            # encoded *outside* the Parameters entry — we don't have an easy
            # per-parameter enum dictionary in this format, so we surface
            # `displayType` for downstream lookups instead.
            out[str(key)] = {
                "label": defn.get("displayLabel") or str(key),
                "type": defn.get("displayType"),
                "units": defn.get("displayUnits"),
                "scale_factor": scale,
                "precision": defn.get("precision"),
                "tag_name": defn.get("tagName"),
                "grouping": key_to_group.get(str(key)),
                # `enum_values` left None for now; we can mine the Messages
                # block in a follow-up if needed.
                "enum_values": None,
            }
        return out

    @staticmethod
    def _upsert_dictionary(db, param_meta: Dict[str, Dict[str, Any]]) -> None:
        if not param_meta:
            return
        # Postgres upsert keeps dictionary in sync without N round-trips.
        rows = [
            {
                "vendor": VENDOR,
                "parameter_key": key,
                "display_label": m["label"],
                "display_type": m["type"],
                "display_units": m["units"],
                "scale_factor": m["scale_factor"],
                "precision": m["precision"],
                "tag_name": m["tag_name"],
                "grouping": m["grouping"],
                "enum_values": m["enum_values"],
            }
            for key, m in param_meta.items()
        ]
        table = VentParameterDictionary.__table__
        stmt = pg_insert(table).values(rows)
        stmt = stmt.on_conflict_do_update(
            index_elements=["vendor", "parameter_key"],
            set_={
                "display_label": stmt.excluded.display_label,
                "display_type": stmt.excluded.display_type,
                "display_units": stmt.excluded.display_units,
                "scale_factor": stmt.excluded.scale_factor,
                "precision": stmt.excluded.precision,
                "tag_name": stmt.excluded.tag_name,
                "grouping": stmt.excluded.grouping,
                "enum_values": stmt.excluded.enum_values,
            },
        )
        db.execute(stmt)
        db.commit()

    # Canonical deviceconfig keys we want, paired with regexes that tolerate
    # stray prefix bytes coming from the file's length/type framing (e.g.
    # `Mlanguage` or `pblower.ctrl`).
    _DEVICECONFIG_KEYS = [
        ("ventserial", re.compile(r"ventserial$", re.IGNORECASE)),
        ("model",      re.compile(r"\bmodel$", re.IGNORECASE)),
        ("language",   re.compile(r"language$", re.IGNORECASE)),
        ("mode",       re.compile(r"\bmode$", re.IGNORECASE)),
        ("firmware",   re.compile(r"firmware$", re.IGNORECASE)),
    ]

    @classmethod
    def _parse_deviceconfig(cls, path: str) -> Dict[str, str]:
        """deviceconfig is a small binary file: a sequence of NUL-separated
        printable tokens that alternate `<key>\\0<value>\\0` with stray
        length/type bytes between records. The framing isn't documented for
        us, so we just pick known keys by suffix match and take whatever
        token follows."""
        out: Dict[str, str] = {}
        if not os.path.exists(path):
            return out
        try:
            with open(path, "rb") as f:
                raw = f.read()
            tokens = re.split(rb"[\x00-\x1f\x7f-\xff]+", raw)
            cleaned = [t.decode("ascii", errors="ignore").strip() for t in tokens]
            cleaned = [t for t in cleaned if t]
            for i, tok in enumerate(cleaned[:-1]):
                for key, rx in cls._DEVICECONFIG_KEYS:
                    if key in out:
                        continue
                    if rx.search(tok):
                        val = cleaned[i + 1]
                        # Strip any single non-alphanumeric leading char (length byte).
                        val = re.sub(r"^[^A-Za-z0-9]+", "", val)
                        if val:
                            out[key] = val
                        break
        except Exception as e:
            logger.warning("deviceconfig parse error: %s", e)
        return out

    def _parse_batch_csv(
        self,
        path: str,
        *,
        param_meta: Dict[str, Dict[str, Any]],
        enum_keys: Dict[str, Any],
        sample_buffer: List[Dict[str, Any]],
        offset_seconds: float,
        db,
        patient_id: int,
        import_id: str,
    ) -> Tuple[List[Optional[Tuple[str, Optional[str]]]], int, List[datetime]]:
        """Parse one batch_NNNNNN.csv. Appends sample dicts to `sample_buffer`
        (the caller flushes when it grows too large). Returns (header_map,
        rows_emitted, event_anchor_times)."""
        header_map: List[Optional[Tuple[str, Optional[str]]]] = []
        events: List[datetime] = []
        rows_emitted = 0

        with open(path, newline="") as f:
            reader = csv.reader(f)
            for row in reader:
                if not row:
                    continue
                # The first row is the header definition: cols 1–4 are data-ish
                # placeholders (row_id, ts, msg_type, msg_id of the header
                # itself) and cols 5+ are KeyID_suffix names.
                if not header_map:
                    header_map = self._parse_header(row)
                    continue

                if len(row) < 4:
                    continue
                msg_type = row[2] or None
                try:
                    msg_id = int(row[3]) if row[3] else None
                except ValueError:
                    msg_id = None
                try:
                    ts = int(row[1])
                except ValueError:
                    continue
                recorded_raw = datetime.fromtimestamp(ts, tz=timezone.utc)
                recorded_corrected = recorded_raw + timedelta(seconds=offset_seconds)

                if msg_type == "E":
                    events.append(recorded_raw)

                # Walk value columns
                for idx in range(4, min(len(row), len(header_map))):
                    cell = row[idx]
                    if cell == "" or cell is None:
                        continue
                    h = header_map[idx]
                    if not h:
                        continue
                    key, suffix = h
                    meta = param_meta.get(key) or {}
                    scale = meta.get("scale_factor") or 1.0
                    value_numeric: Optional[float] = None
                    value_text: Optional[str] = None
                    try:
                        value_numeric = float(cell) * float(scale)
                    except (TypeError, ValueError):
                        value_text = cell
                    sample_buffer.append({
                        "import_id": import_id,
                        "patient_id": patient_id,
                        "recorded_at_raw": recorded_raw,
                        "recorded_at": recorded_corrected,
                        "parameter_key": key,
                        "parameter_suffix": suffix,
                        "value_numeric": value_numeric,
                        "value_text": value_text,
                        "source_message_type": msg_type,
                        "source_message_id": msg_id,
                    })
                    rows_emitted += 1

        return header_map, rows_emitted, events

    @staticmethod
    def _parse_header(row: List[str]) -> List[Optional[Tuple[str, Optional[str]]]]:
        """Return a list aligned with the row's columns:
        positions 0–3 are None (fixed columns), 4+ are (key, suffix) or None."""
        out: List[Optional[Tuple[str, Optional[str]]]] = [None, None, None, None]
        for cell in row[4:]:
            m = HEADER_COL_RX.match((cell or "").strip())
            if not m:
                out.append(None)
                continue
            out.append((m.group("key"), m.group("suffix")))
        return out

    @staticmethod
    def _flush_samples(db, buffer: List[Dict[str, Any]]) -> None:
        if not buffer:
            return
        db.bulk_insert_mappings(VentSample, buffer)
        db.commit()
        buffer.clear()

    @staticmethod
    def _closest_anchor(
        anchors: List[datetime], pending_at: datetime,
        window: timedelta = timedelta(hours=2),
    ) -> Optional[datetime]:
        """Pick the E-type event whose vent-time is closest to `pending_at`,
        provided it falls within ±window."""
        best: Optional[datetime] = None
        best_dt: Optional[timedelta] = None
        for a in anchors:
            dt = abs(a - pending_at)
            if dt > window:
                continue
            if best_dt is None or dt < best_dt:
                best, best_dt = a, dt
        return best

    @staticmethod
    def _apply_calibration(
        db, pi, integration_id: int, *,
        offset_seconds: float, real_time: datetime, vent_time: datetime,
    ) -> None:
        """Persist offset on PatientIntegration.settings AND re-apply
        recorded_at = recorded_at_raw + offset across every import on this
        patient_integration. Cheap UPDATE — no re-parse needed."""
        settings = dict(pi.settings or {})
        settings["clock_offset_seconds"] = offset_seconds
        settings["clock_calibrated_at"] = real_time.isoformat()
        settings["clock_calibration_anchor"] = vent_time.isoformat()
        settings.pop("clock_calibration_pending_at", None)
        pi.settings = settings
        flag_modified(pi, "settings")
        pi.updated_at = datetime.now(timezone.utc)
        db.add(pi)

        db.execute(text("""
            UPDATE vent_samples
            SET recorded_at = recorded_at_raw + (:off * interval '1 second')
            WHERE import_id IN (
                SELECT id FROM vent_imports WHERE integration_id = :iid
            )
        """), {"off": offset_seconds, "iid": integration_id})
        db.commit()
