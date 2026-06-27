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
System-health metrics + database maintenance for the System Health admin page.

All queries are Postgres/TimescaleDB-specific. Row counts use planner estimates
(`reltuples` / `approximate_row_count`) so we never seq-scan the multi-million-row
sensor tables just to render a page. Hypertable sizes come from
`hypertable_size()` (the parent relation is empty — data lives in chunks).

Maintenance helpers operate ONLY on tables confirmed to exist in the catalog;
the table name is validated against that set before it is ever interpolated into
SQL, so there is no injection surface from the request body.
"""
import logging

from sqlalchemy import text
from sqlalchemy.orm import Session

from db import engine

logger = logging.getLogger("system_health")

# How many non-hypertable tables to surface alongside the hypertables.
_TOP_REGULAR_TABLES = 5


def _hypertable_info(db: Session) -> dict:
    """name -> {time_col, chunks, compression_enabled, size_bytes, compressed_chunks}."""
    rows = db.execute(text(
        """
        SELECT h.hypertable_name AS name,
               h.primary_dimension AS time_col,
               h.num_chunks AS chunks,
               h.compression_enabled AS compression_enabled,
               hypertable_size(format('%I.%I', h.hypertable_schema, h.hypertable_name)) AS size_bytes,
               COALESCE(c.compressed_chunks, 0) AS compressed_chunks
        FROM timescaledb_information.hypertables h
        LEFT JOIN (
            SELECT hypertable_name, count(*) FILTER (WHERE is_compressed) AS compressed_chunks
            FROM timescaledb_information.chunks GROUP BY hypertable_name
        ) c ON c.hypertable_name = h.hypertable_name
        """
    )).mappings().all()
    return {r["name"]: dict(r) for r in rows}


def _time_range(db: Session, table: str, time_col: str) -> tuple:
    """min/max of the partition column. Fast on a hypertable (chunk-ordered)."""
    # table/time_col come from the TS catalog (not the request) — safe to quote+inline.
    sql = f'SELECT min("{time_col}") AS lo, max("{time_col}") AS hi FROM "{table}"'
    row = db.execute(text(sql)).mappings().first()
    return row["lo"], row["hi"]


def get_database_health(db: Session) -> dict:
    row = db.execute(text(
        """
        SELECT current_setting('server_version') AS pg_version,
               (SELECT extversion FROM pg_extension WHERE extname='timescaledb') AS ts_version,
               current_database() AS name,
               pg_database_size(current_database()) AS total_size_bytes,
               current_setting('max_connections')::int AS max_conn,
               (SELECT count(*) FROM pg_stat_activity WHERE datname=current_database()) AS active_conn,
               extract(epoch FROM now() - pg_postmaster_start_time())::bigint AS uptime_seconds,
               (SELECT round(sum(blks_hit)::numeric / nullif(sum(blks_hit + blks_read), 0), 4)
                  FROM pg_stat_database WHERE datname=current_database()) AS cache_hit_ratio
        """
    )).mappings().first()
    return {
        "name": row["name"],
        "status": "healthy",
        "postgres_version": row["pg_version"],
        "timescaledb_version": row["ts_version"],
        "total_size_bytes": int(row["total_size_bytes"]),
        "connections": {"active": int(row["active_conn"]), "max": int(row["max_conn"])},
        "uptime_seconds": int(row["uptime_seconds"]),
        "cache_hit_ratio": float(row["cache_hit_ratio"]) if row["cache_hit_ratio"] is not None else None,
    }


def get_table_storage(db: Session) -> list:
    """Hypertables (full chunk size) + the largest regular tables, by size desc."""
    hypertables = _hypertable_info(db)
    tables = []

    for name, info in hypertables.items():
        lo, hi = _time_range(db, name, info["time_col"])
        approx_rows = db.execute(
            text("SELECT approximate_row_count(:t)"), {"t": name}
        ).scalar()
        tables.append({
            "name": name,
            "rows": int(approx_rows or 0),
            "size_bytes": int(info["size_bytes"] or 0),
            "hypertable": True,
            "chunks": int(info["chunks"] or 0),
            "compressed": int(info["compressed_chunks"] or 0) > 0,
            "oldest": lo.date().isoformat() if lo else None,
            "newest": hi.date().isoformat() if hi else None,
        })

    regular = db.execute(text(
        """
        SELECT c.relname AS name,
               pg_total_relation_size(c.oid) AS size_bytes,
               c.reltuples::bigint AS approx_rows
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE c.relkind = 'r' AND n.nspname = 'public'
          AND c.relname NOT IN (SELECT hypertable_name FROM timescaledb_information.hypertables)
        ORDER BY size_bytes DESC
        LIMIT :lim
        """
    ), {"lim": _TOP_REGULAR_TABLES}).mappings().all()

    for r in regular:
        tables.append({
            "name": r["name"],
            "rows": max(int(r["approx_rows"] or 0), 0),
            "size_bytes": int(r["size_bytes"] or 0),
            "hypertable": False,
            "chunks": None,
            "compressed": None,
            "oldest": None,
            "newest": None,
        })

    tables.sort(key=lambda t: t["size_bytes"], reverse=True)
    return tables


def get_system_health(db: Session) -> dict:
    return {"database": get_database_health(db), "tables": get_table_storage(db)}


# --------------------------------------------------------------------------- #
# Maintenance
# --------------------------------------------------------------------------- #

def _assert_hypertable(db: Session, table: str) -> dict:
    info = _hypertable_info(db)
    if table not in info:
        raise ValueError(f"'{table}' is not a TimescaleDB hypertable")
    return info[table]


def prune_hypertable(db: Session, table: str, older_than_days: int) -> dict:
    """drop_chunks() removes whole chunks older than the cutoff — far cheaper than
    a row DELETE and the correct retention primitive. Returns the dropped chunks."""
    _assert_hypertable(db, table)
    if older_than_days < 1:
        raise ValueError("older_than_days must be >= 1")

    dropped = db.execute(
        text("SELECT drop_chunks(:t, older_than => make_interval(days => :d))"),
        {"t": table, "d": older_than_days},
    ).scalars().all()
    db.commit()
    return {"table": table, "older_than_days": older_than_days,
            "chunks_dropped": len(dropped), "dropped": [str(c) for c in dropped]}


def compress_old_chunks(db: Session, table: str, older_than_days: int) -> dict:
    """Enable compression on the hypertable if needed, then compress chunks older
    than the cutoff that aren't already compressed."""
    info = _assert_hypertable(db, table)
    if older_than_days < 1:
        raise ValueError("older_than_days must be >= 1")

    if not info["compression_enabled"]:
        # Defaults (order by time DESC) are fine for our numeric series.
        db.execute(text(f'ALTER TABLE "{table}" SET (timescaledb.compress)'))
        db.commit()

    chunks = db.execute(
        text("SELECT show_chunks(:t, older_than => make_interval(days => :d))"),
        {"t": table, "d": older_than_days},
    ).scalars().all()

    compressed = 0
    for chunk in chunks:
        db.execute(text("SELECT compress_chunk(:c, if_not_compressed => true)"), {"c": str(chunk)})
        compressed += 1
    db.commit()
    return {"table": table, "older_than_days": older_than_days, "chunks_compressed": compressed}


def vacuum_analyze(table: str | None = None) -> dict:
    """VACUUM cannot run inside a transaction block, so use a dedicated AUTOCOMMIT
    connection rather than the request's Session."""
    target = None
    if table:
        # Validate against existing public tables before inlining the identifier.
        with engine.connect() as conn:
            exists = conn.execute(text(
                "SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace "
                "WHERE c.relkind='r' AND n.nspname='public' AND c.relname=:t"
            ), {"t": table}).first()
        if not exists:
            raise ValueError(f"Unknown table '{table}'")
        target = f' "{table}"'

    with engine.connect().execution_options(isolation_level="AUTOCOMMIT") as conn:
        conn.execute(text(f"VACUUM (ANALYZE){target or ''}"))
    return {"status": "ok", "target": table or "all tables"}
