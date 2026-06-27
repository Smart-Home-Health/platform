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
Pytest harness for the backend API.

Design (see plan):
- Real Postgres/TimescaleDB test database (`shh_test`); schema via Alembic.
- Each test runs inside a transaction that is rolled back (fast isolation).
- Auth via real JWTs minted with routes.auth.create_access_token.
- Startup side-effects (EventBus/MQTT/background tasks) are NOT triggered:
  TestClient is built without the `with` context manager, and outbound
  publishers are neutralized by an autouse fixture.

IMPORTANT: environment must be set BEFORE importing `db`/`main`, because those
modules read DATABASE_URL / JWT_SECRET_KEY at import time.
"""
import os

# --- Environment (must precede db/main import) -------------------------------
# Force the test DB (the backend container/.env may already define a dev URL).
TEST_DATABASE_URL = os.environ.get(
    "TEST_DATABASE_URL",
    "postgresql://shh_user:shh_dev_pass@localhost:5432/shh_test",
)
os.environ["DATABASE_URL"] = TEST_DATABASE_URL
# A non-default secret is mandatory (main.py refuses the insecure default) and
# must match between token minting and middleware verification.
os.environ.setdefault("JWT_SECRET_KEY", "test-secret-not-for-production")
# Keep request-rate limiting out of the way for general tests; the dedicated
# rate-limit test toggles it explicitly.
os.environ.setdefault("RATE_LIMIT_ENABLED", "false")

import bcrypt
import psycopg2
import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy.engine import make_url
from sqlalchemy.orm import Session

# Import the full app once, up front. This pulls in every router (and therefore
# every ORM model — including ones not re-exported from models/__init__.py, e.g.
# models.integrations.PatientIntegration) so SQLAlchemy mapper configuration
# succeeds before any seeding/query. Mirrors how the running app loads. Safe at
# import time: no DB connection and no startup event fire here.
import main  # noqa: E402,F401

BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


# --- One-time DB bootstrap + migrations + seed ------------------------------
def _ensure_database_and_extension():
    """Create the test database + timescaledb extension if missing."""
    url = make_url(TEST_DATABASE_URL)
    admin = psycopg2.connect(
        host=url.host, port=url.port, user=url.username,
        password=url.password, dbname="postgres",
    )
    admin.autocommit = True
    with admin.cursor() as cur:
        cur.execute("SELECT 1 FROM pg_database WHERE datname = %s", (url.database,))
        if not cur.fetchone():
            cur.execute(f'CREATE DATABASE "{url.database}"')
    admin.close()

    db = psycopg2.connect(
        host=url.host, port=url.port, user=url.username,
        password=url.password, dbname=url.database,
    )
    db.autocommit = True
    with db.cursor() as cur:
        cur.execute("CREATE EXTENSION IF NOT EXISTS timescaledb")
    db.close()


@pytest.fixture(scope="session", autouse=True)
def _db_setup():
    """Bootstrap DB, run migrations to head, and seed roles/permissions once."""
    _ensure_database_and_extension()

    cfg = Config(os.path.join(BACKEND_DIR, "alembic.ini"))
    cfg.set_main_option("script_location", os.path.join(BACKEND_DIR, "alembic"))
    # alembic/env.py reads DATABASE_URL from the environment itself.
    command.upgrade(cfg, "head")

    # Seed default org/permissions/roles (committed; persists for the session).
    from db import SessionLocal
    from seed_auth import seed_default_data
    s = SessionLocal()
    try:
        seed_default_data(s)
        s.commit()
    finally:
        s.close()
    yield


# --- Per-test transactional isolation ---------------------------------------
@pytest.fixture
def db_session(_db_setup):
    """A Session bound to a connection-level transaction that is rolled back.

    `join_transaction_mode="create_savepoint"` makes route-level commits land on
    a savepoint, so the outer rollback cleanly undoes everything the test wrote.
    """
    from db import engine, SessionLocal
    connection = engine.connect()
    transaction = connection.begin()
    # Build from the app's sessionmaker (not a bare Session) so the session
    # carries the same config AND event listeners — notably the soft-delete
    # `do_orm_execute` filter, which is registered on SessionLocal.
    session = SessionLocal(bind=connection, join_transaction_mode="create_savepoint")
    try:
        yield session
    finally:
        session.close()
        transaction.rollback()
        connection.close()


@pytest.fixture(autouse=True)
def _neutralize_external(monkeypatch):
    """No-op the outbound event bus + MQTT publish so route tests have no side
    effects and don't depend on a broker. Best-effort: ignore if not present."""
    try:
        import main
        monkeypatch.setattr(main.event_bus, "publish", lambda *a, **k: None, raising=False)
    except Exception:
        pass
    for mod_name, attr in [
        ("event_publisher", "publish_specific_vital_to_mqtt"),
        ("event_publisher", "publish_sensor_update"),
    ]:
        try:
            mod = __import__(mod_name)
            if hasattr(mod, attr):
                monkeypatch.setattr(mod, attr, lambda *a, **k: None)
        except Exception:
            pass


# --- HTTP client + auth ------------------------------------------------------
@pytest.fixture
def client(db_session):
    """TestClient with get_db overridden to the transactional session.

    Built without `with` so the app's startup event (MQTT/bus/bg tasks) never
    fires; middleware still runs per request.
    """
    from fastapi.testclient import TestClient
    from main import app
    from db import get_db

    app.dependency_overrides[get_db] = lambda: db_session
    test_client = TestClient(app)
    try:
        yield test_client
    finally:
        app.dependency_overrides.clear()


def _hash(pw: str) -> str:
    return bcrypt.hashpw(pw.encode(), bcrypt.gensalt()).decode()


@pytest.fixture
def account(db_session):
    from models.users import Account
    acc = Account(
        name="Test Family", slug="test-family",
        password_hash=_hash("accountpass"),
        timezone="America/New_York", is_default=True,
    )
    db_session.add(acc)
    db_session.commit()
    db_session.refresh(acc)
    return acc


@pytest.fixture
def admin_user(db_session, account):
    """A system-admin user (full permissions)."""
    from crud.users import create_user, get_role_by_name
    role = get_role_by_name(db_session, "system_admin")
    user = create_user(
        db_session, username="admin_test", password="adminpass",
        full_name="Admin Test", is_system_admin=True,
        role_ids=[role.id] if role else None, force_password_reset=False,
    )
    user.account_id = account.id
    db_session.commit()
    db_session.refresh(user)
    return user


@pytest.fixture
def limited_user(db_session, account):
    """A non-admin user with no roles — for authz (403) assertions."""
    from crud.users import create_user
    user = create_user(
        db_session, username="limited_test", password="limitedpass",
        full_name="Limited Test", is_system_admin=False,
        role_ids=None, force_password_reset=False,
    )
    user.account_id = account.id
    db_session.commit()
    db_session.refresh(user)
    return user


def _auth(client, user, account, **kw):
    from routes.auth import create_access_token
    token = create_access_token(user=user, account=account, auth_level="full", **kw)
    client.headers.update({"Authorization": f"Bearer {token}"})
    return client


@pytest.fixture
def admin_client(client, admin_user, account):
    return _auth(client, admin_user, account)


@pytest.fixture
def limited_client(client, limited_user, account):
    return _auth(client, limited_user, account)


@pytest.fixture
def patient(db_session, account):
    """A patient owned by the test account (created via CRUD)."""
    from crud.patients import create_patient
    p = create_patient(db_session, {
        "first_name": "Pat", "last_name": "Ient",
        "account_id": account.id, "is_active": True,
    })
    db_session.commit()
    return p


@pytest.fixture
def account_client(client, account):
    """Account-level auth (no user) — auth_level='account'."""
    from routes.auth import create_access_token
    token = create_access_token(account=account, auth_level="account")
    client.headers.update({"Authorization": f"Bearer {token}"})
    return client
