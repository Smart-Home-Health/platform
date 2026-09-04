#!/usr/bin/env python3
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
A pretend bedside oximeter for the demo patient.

Speaks the reader WebSocket protocol (/api/readers/ws/{id}, Fernet-encrypted
frames) and streams a plausible SpO2 / heart rate / perfusion index every two
seconds, so the live dashboard has something to show while screenshots are
taken. Creates a paired "Demo Pulse Ox" reader row for the patient if there
is none. Ctrl-C to stop.

    docker compose exec backend python scripts/demo_reader.py            # patient 9
    docker compose exec backend python scripts/demo_reader.py --patient-id 9 --seconds 600
"""
import argparse
import asyncio
import json
import os
import random
import sys
from datetime import datetime, timezone

from cryptography.fernet import Fernet
from sqlalchemy import text
import websockets

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from db import SessionLocal  # noqa: E402

READER_NAME = 'Demo Pulse Ox'


def ensure_reader(pid):
    db = SessionLocal()
    try:
        row = db.execute(text(
            "SELECT id, encryption_key FROM readers WHERE patient_id = :p AND name = :n"
        ), {'p': pid, 'n': READER_NAME}).first()
        if row is None:
            key = Fernet.generate_key().decode()
            row = db.execute(text(
                "INSERT INTO readers (patient_id, ip_address, port, name, is_active, is_paired, "
                "paired_at, encryption_key) VALUES (:p, :ip, 8080, :n, true, true, now(), :k) "
                "RETURNING id, encryption_key"
            ), {'p': pid, 'ip': f'127.0.0.1-demo-pulseox-{pid}', 'n': READER_NAME, 'k': key}).first()
            db.commit()
        elif not row.encryption_key:
            key = Fernet.generate_key().decode()
            db.execute(text("UPDATE readers SET encryption_key = :k, is_paired = true WHERE id = :i"),
                       {'k': key, 'i': row.id})
            db.commit()
            row = db.execute(text("SELECT id, encryption_key FROM readers WHERE id = :i"), {'i': row.id}).first()
        return row.id, row.encryption_key
    finally:
        db.close()


class Vitals:
    """Slow random walk around resting values, with the odd shallow dip."""

    def __init__(self, rng):
        self.rng = rng
        self.spo2 = 97.0
        self.bpm = 78.0
        self.pi = 5.2
        self.dip = 0

    def step(self):
        r = self.rng
        if self.dip:
            self.dip -= 1
            self.spo2 = max(93.0, self.spo2 - r.uniform(0.2, 0.6))
        else:
            self.spo2 += (97.5 - self.spo2) * 0.15 + r.uniform(-0.4, 0.4)
            if r.random() < 0.01:
                self.dip = r.randint(4, 9)
        self.bpm += (78 - self.bpm) * 0.08 + r.uniform(-2.5, 2.5)
        self.pi += (5.0 - self.pi) * 0.1 + r.uniform(-0.5, 0.5)
        return {
            'spo2': int(round(min(100.0, self.spo2))),
            'bpm': int(round(max(55.0, min(110.0, self.bpm)))),
            'perfusion': round(max(1.0, min(12.0, self.pi)), 1),
        }


async def stream(api, reader_id, key, seconds, interval):
    fernet = Fernet(key.encode())
    url = api.replace('http', 'ws', 1) + f'/api/readers/ws/{reader_id}'
    vitals = Vitals(random.Random())
    deadline = asyncio.get_event_loop().time() + seconds if seconds else None

    def frame(msg):
        return fernet.encrypt(json.dumps(msg).encode())

    async with websockets.connect(url) as ws:
        await ws.send(frame({'type': 'handshake', 'device_name': READER_NAME}))
        print(f"connected as reader {reader_id} → {url}")
        n = 0
        while deadline is None or asyncio.get_event_loop().time() < deadline:
            values = vitals.step()
            await ws.send(frame({
                'type': 'sensor', 'ts': datetime.now(timezone.utc).isoformat(), 'values': values,
            }))
            n += 1
            if n % 30 == 0:
                print(f"  {n} frames, last {values}")
            await asyncio.sleep(interval)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--api', default=os.environ.get('SEED_API', 'http://localhost:8000'))
    ap.add_argument('--patient-id', type=int, default=9)
    ap.add_argument('--seconds', type=int, default=0, help='stop after this long (0 = until Ctrl-C)')
    ap.add_argument('--interval', type=float, default=2.0)
    args = ap.parse_args()

    reader_id, key = ensure_reader(args.patient_id)

    async def run():
        # The dev backend hot-reloads on every file save; reconnect until the
        # budget runs out rather than dying with it.
        loop = asyncio.get_event_loop()
        deadline = loop.time() + args.seconds if args.seconds else None
        while deadline is None or loop.time() < deadline:
            left = None if deadline is None else max(1, int(deadline - loop.time()))
            try:
                await stream(args.api, reader_id, key, left, args.interval)
                return
            except (websockets.ConnectionClosed, OSError) as e:
                print(f"connection dropped ({e}); reconnecting in 3 s")
                await asyncio.sleep(3)

    try:
        asyncio.run(run())
    except KeyboardInterrupt:
        pass


if __name__ == '__main__':
    main()
