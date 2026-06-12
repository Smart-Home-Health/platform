# Refactor plan: consolidate the ORM / Pydantic package split

**Status:** planned (not started). Execute **after** the `dev/epic-fhir` → `main` merge.
**Decision:** Option A — adopt the FastAPI-standard layout (`models/` = ORM, `schemas/` = Pydantic).

## Problem

ORM classes and Pydantic models are split across two packages whose names don't match
their contents:

- `backend/models/` — **mostly Pydantic** (14 Pydantic files vs 3 ORM:
  `users.py`, `readers.py`, `custom_vital_definition.py`).
- `backend/schemas/` — **mostly ORM** (32 ORM files vs 2 Pydantic: `auth.py`, `user.py`).

So the codebase already trends toward a convention, but it's the **inverse of the
FastAPI standard**. `schemas/` holding SQLAlchemy ORM (not Pydantic "schemas") is the
specific thing that confuses readers. The `CLAUDE.md` "Models vs schemas" note is also
inaccurate — it calls `models/` the "newer ORM" package, but `models/` is mostly Pydantic.

### What is NOT broken

- There is effectively **one canonical `Base`**: `db.Base`. `schemas/__init__.py` does
  `from db import Base`, and the ORM files in `models/` use `from db import Base`. Every
  table registers on `db.Base.metadata`, which is what Alembic targets. No runtime bug.
- `backend/models.py` (the rogue module with its own `declarative_base()`) was **dead
  code** — shadowed by the `models/` package — and has been **deleted**. The
  `models/__init__.py` docstring was corrected at the same time.

This is therefore a **pure file-organization / naming** problem, not a correctness one.

## Target (Option A)

| Package | Holds |
|---|---|
| `backend/models/` | all SQLAlchemy ORM classes (one `db.Base`) |
| `backend/schemas/` | all Pydantic request/response models |

Why A over "least-churn B" (`models/`=Pydantic, `schemas/`=ORM): only A actually fixes
the complaint (`schemas/` should mean Pydantic) and lands on the layout every FastAPI
dev expects. B is ~5 file moves but permanently enshrines the inverted naming.

## Guardrails (hold for every step)

- **Zero database impact** — no table/column/`Base` change, so **no Alembic migration**
  and no data risk. Code movement only.
- **Each step independently green:** app boots, `/docs` loads, `alembic upgrade head`
  runs, and `alembic revision --autogenerate` yields an **empty** diff.
- Land as its own branch, reviewed per phase. Big diff; keep it off shared feature work.

## Phase 0 — Safety net

Establish the green/red signal used after every later phase:
- `docker compose up` boots cleanly.
- `/docs` (Swagger) loads.
- `docker compose exec backend alembic upgrade head` is clean.
- `docker compose exec backend alembic revision --autogenerate -m tmp` produces an
  **empty** migration (then discard it). An empty diff proves no model fell out of the
  metadata. Non-empty = a class stopped being imported.

## Phase 1 — Decouple call sites from physical file location (key enabler)

Today ~70 call sites import submodules directly (`from schemas.patient import Patient`),
gluing them to file location.

1. Make both packages full façades: `models/__init__.py` re-exports **every** ORM class;
   `schemas/__init__.py` re-exports **every** Pydantic model.
2. Codemod call sites to package-level imports, e.g.
   `from schemas.patient import Patient` → `from models import Patient`
   (and Pydantic imports → `from schemas import ...`).
3. After this, **nothing outside the two packages names a submodule**, so the physical
   moves in Phase 2 touch only the packages themselves.

Verify with Phase 0 checks.

## Phase 2 — Physical moves (behind the façades)

1. Move 32 ORM files `schemas/*` → `models/*`; move 14 Pydantic files `models/*` →
   `schemas/*`. Leave **thin re-export shims** at the old paths during transition
   (e.g. `schemas/patient.py` → `from models.patient import *`) so any missed reference
   still resolves.
2. Fix intra-package imports: ORM files that do `from schemas.x import Y` → `from
   models.x import Y`. Note: SQLAlchemy `relationship("ClassName")` uses **string** class
   names resolved through the shared registry, so relationships survive moves — only
   explicit `import` lines need editing.
3. **Known filename collision:** `models/equipment.py` (Pydantic) and
   `schemas/equipment.py` (ORM) must **swap**. `git mv` can't move onto an existing file
   — move one to a temp name first, then into place.
4. **Optional naming normalization:** the Pydantic files use plurals (`medications.py`)
   while the ORM files use singulars (`medication.py`). Decide on one scheme while files
   are in motion if desired (not required for correctness).
5. Point Alembic at the aggregator: replace the long `from schemas.X import Y` block in
   `alembic/env.py` with a single `import models` so all tables register and the list
   stops needing hand-maintenance.

Verify with Phase 0 checks after each sub-step.

## Phase 3 — Remove shims & document

1. Delete the Phase 2 re-export shims once `grep -rn "from schemas\." backend` (and the
   `models.` equivalent for Pydantic) shows no references outside the packages.
2. Update `CLAUDE.md`: replace the inverted "Models vs schemas" section with
   "`models/` = ORM, `schemas/` = Pydantic," and keep the note that a new ORM model must
   be re-exported from `models/__init__.py` for Alembic autogenerate to see it.

## Final verification

- `docker compose up` boots; `/docs` loads.
- `alembic upgrade head` clean; `alembic revision --autogenerate` diff is **empty**.
- `grep -rn "from schemas\." backend` returns nothing outside `backend/schemas/`.
- No `schemas/*` file imports `Base` / `Column` (Pydantic only); no `models/*` file
  imports `pydantic.BaseModel` (ORM only).

## Effort / risk

Mechanical but broad: ~46 file moves + ~70 import rewrites, all scriptable. Low risk
(code-only, shimmed during transition), but a large diff — review per phase.
