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
"""Wave 6 — VOCSN ventilator export parsing (pure transforms).

The full `parse()` orchestration needs a DB + extracted archive and is covered
indirectly by the integration-imports tests. Here we pin the byte/CSV-level
transforms — the parts most likely to break on a vendor format quirk — with no
DB: header mapping, the TrendMetaData parameter dictionary, the binary
`deviceconfig` reader, and batch-CSV row emission (scaling, text fallback,
Mark-Event detection, append-resume via skip_rows).
"""
import pytest

from integrations.ventilator_parsers.vocsn import VocsnParser, MARK_EVENT_MSG_ID


@pytest.fixture
def parser(tmp_path):
    # _parse_batch_csv is an instance method but uses no DB state; a minimal
    # instance is enough to exercise it.
    return VocsnParser(
        import_id="test-import",
        archive_path=str(tmp_path / "archive.tar"),
        extracted_dir=str(tmp_path),
    )


# --- _parse_header -----------------------------------------------------------

def test_parse_header_maps_key_and_suffix():
    header = VocsnParser._parse_header(["rid", "ts", "mt", "mid", "100", "200_5", "oops!"])
    assert header == [None, None, None, None, ("100", None), ("200", "5"), None]


# --- _extract_parameter_dictionary -------------------------------------------

def test_extract_parameter_dictionary():
    meta = {
        "Groupings": {"Respiratory": {"KeyID": ["100", "200"]}},
        "Parameters": {
            "100": {
                "displayLabel": "PIP", "displayType": "numeric",
                "displayUnits": "cmH2O", "scaleFactor": "0.1",
                "precision": 1, "tagName": "pip",
            },
            "200": {"displayLabel": "RR", "scaleFactor": None},
            "bad": "not-a-dict",  # tolerated and skipped
        },
    }
    out = VocsnParser._extract_parameter_dictionary(meta)

    assert "bad" not in out
    assert out["100"]["label"] == "PIP"
    assert out["100"]["units"] == "cmH2O"
    assert out["100"]["scale_factor"] == 0.1  # coerced str -> float
    assert out["100"]["grouping"] == "Respiratory"
    assert out["100"]["enum_values"] is None
    # Missing label falls back to the key; bad scaleFactor -> None.
    assert out["200"]["label"] == "RR"
    assert out["200"]["scale_factor"] is None
    assert out["200"]["grouping"] == "Respiratory"


# --- _parse_deviceconfig -----------------------------------------------------

def test_parse_deviceconfig_picks_known_keys(tmp_path):
    # The real file is NUL/control-byte framed; we split on control bytes and
    # match known keys by suffix, taking the next token as the value.
    raw = (
        b"\x05ventserial\x00\x07SN12345\x00"
        b"\x01model\x00VOCSN\x00"
        b"language\x00English\x00"
    )
    path = tmp_path / "deviceconfig"
    path.write_bytes(raw)

    out = VocsnParser._parse_deviceconfig(str(path))
    assert out == {"ventserial": "SN12345", "model": "VOCSN", "language": "English"}


def test_parse_deviceconfig_missing_file_is_empty(tmp_path):
    assert VocsnParser._parse_deviceconfig(str(tmp_path / "nope")) == {}


# --- _parse_batch_csv --------------------------------------------------------

def _write_batch(tmp_path):
    # Header: cols 0-3 fixed; col4 -> key 100, col5 -> key 200 pct-5, col6 junk.
    # Row A: two numeric samples.  Row B: a Mark Event (no values).
    # Row C: a non-numeric cell -> stored as text.
    lines = [
        "rid,ts,mt,mid,100,200_5,xx",
        "0,1700000000,D,,5,10,",
        f"1,1700000600,E,{MARK_EVENT_MSG_ID},,,",
        "2,1700000700,D,,abc,,",
    ]
    path = tmp_path / "batch_000001.csv"
    path.write_text("\n".join(lines) + "\n")
    return str(path)


def test_parse_batch_csv_emits_scaled_and_text_samples(parser, tmp_path):
    path = _write_batch(tmp_path)
    buf = []
    header, emitted, events, markers, total = parser._parse_batch_csv(
        path,
        param_meta={"100": {"scale_factor": 2.0}, "200": {"scale_factor": 1.0}},
        enum_keys={},
        sample_buffer=buf,
        offset_seconds=0.0,
        db=None,
        patient_id=7,
        import_id="imp-1",
        skip_rows=0,
    )

    assert emitted == 3
    assert total == 4  # header + 3 data rows
    assert len(markers) == 1  # the Mark Event row
    assert len(events) == 1

    # Row A and Row C both write key "100", so match by content rather than key.
    numeric_100 = [
        s for s in buf if s["parameter_key"] == "100" and s["value_numeric"] is not None
    ][0]
    assert numeric_100["value_numeric"] == 10.0  # 5 * scale 2.0
    s200 = [s for s in buf if s["parameter_key"] == "200" and s["parameter_suffix"] == "5"][0]
    assert s200["value_numeric"] == 10.0         # 10 * scale 1.0
    # Non-numeric cell falls back to text, numeric stays None.
    text_sample = [s for s in buf if s["value_text"] == "abc"][0]
    assert text_sample["value_numeric"] is None
    assert text_sample["patient_id"] == 7
    assert text_sample["import_id"] == "imp-1"


def test_parse_batch_csv_skip_rows_resumes_after_offset(parser, tmp_path):
    """skip_rows replays a grown file's tail only: the first sample row is
    counted but not re-emitted."""
    path = _write_batch(tmp_path)
    buf = []
    _, emitted, _, _, total = parser._parse_batch_csv(
        path,
        param_meta={"100": {"scale_factor": 2.0}, "200": {"scale_factor": 1.0}},
        enum_keys={},
        sample_buffer=buf,
        offset_seconds=0.0,
        db=None,
        patient_id=7,
        import_id="imp-1",
        skip_rows=2,  # skip header (0) + first data row (1)
    )
    # Row A (index 1) is skipped; only Row C's text sample is emitted.
    assert emitted == 1
    assert total == 4
    assert buf[0]["value_text"] == "abc"


def test_parse_batch_csv_applies_clock_offset(parser, tmp_path):
    path = _write_batch(tmp_path)
    buf = []
    parser._parse_batch_csv(
        path,
        param_meta={"100": {"scale_factor": 1.0}},
        enum_keys={},
        sample_buffer=buf,
        offset_seconds=3600.0,  # +1h correction
        db=None,
        patient_id=1,
        import_id="imp-1",
    )
    sample = buf[0]
    delta = (sample["recorded_at"] - sample["recorded_at_raw"]).total_seconds()
    assert delta == 3600.0
