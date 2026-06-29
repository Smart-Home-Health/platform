#!/usr/bin/env python3
"""One-off helper: prepend the AGPL-3.0 short notice to source files.

Idempotent — skips any file that already contains the notice. Run from repo root:
    python3 scripts/add_license_headers.py
"""
import os
import sys

HOLDER = "Copyright (C) 2026 John Carty"
MARKER = "GNU Affero General Public License"

BODY = [
    "Smart Home Health",
    HOLDER,
    "",
    "This program is free software: you can redistribute it and/or modify",
    "it under the terms of the GNU Affero General Public License as published by",
    "the Free Software Foundation, either version 3 of the License, or",
    "(at your option) any later version.",
    "",
    "This program is distributed in the hope that it will be useful,",
    "but WITHOUT ANY WARRANTY; without even the implied warranty of",
    "MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the",
    "GNU Affero General Public License for more details.",
    "",
    "You should have received a copy of the GNU Affero General Public License",
    "along with this program.  If not, see <https://www.gnu.org/licenses/>.",
]

def hash_header():
    return "\n".join("#" if not line else f"# {line}" for line in BODY) + "\n"

def block_header():
    inner = "\n".join(f" *" if not line else f" * {line}" for line in BODY)
    return "/*\n" + inner + "\n */\n"

# (root dir, extensions, header builder)
TARGETS = [
    ("backend", (".py",), hash_header()),
    ("frontend/src", (".js", ".jsx"), block_header()),
]

EXCLUDE_DIRS = {"__pycache__", "node_modules", "versions", "dist", "build"}

def iter_files(root, exts):
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [d for d in dirnames if d not in EXCLUDE_DIRS]
        for name in filenames:
            if name.endswith(exts):
                yield os.path.join(dirpath, name)

def main():
    added = skipped = 0
    for root, exts, header in TARGETS:
        for path in iter_files(root, exts):
            with open(path, "r", encoding="utf-8") as fh:
                content = fh.read()
            if MARKER in content:
                skipped += 1
                continue
            # Preserve a leading shebang line.
            if content.startswith("#!"):
                first, _, rest = content.partition("\n")
                new = first + "\n" + header + rest
            else:
                new = header + content
            with open(path, "w", encoding="utf-8") as fh:
                fh.write(new)
            added += 1
    print(f"Headers added to {added} files, {skipped} already had one.")

if __name__ == "__main__":
    sys.exit(main())
