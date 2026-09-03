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
"""Seed the synthetic demo patient with a believable fortnight of care.

    docker compose exec backend python scripts/seed_demo_patient.py \
        --user claude --password ...

The demo patient (Jane Doe, 68, ALS with a trach and a G-tube) exists so the
product site's screenshots and walkthroughs never show a real person. Every
run WIPES her rows and rebuilds them relative to "now" in the account's
timezone, so the boards look current whenever the screenshots are retaken.

Validated entities go through the REST API as the given user (so the same
rules the UI hits apply — early/late flags, flush follow-ups, low-stock
maths). Bulk time series (pulse-ox stream, alerts, room sensors) and the
backdated dose/task logs are written with raw SQL per scripts convention.
"""
import argparse
import io
import math
import os
import random
import sys
import uuid
from datetime import datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import httpx  # noqa: E402
from sqlalchemy import text  # noqa: E402

from db import SessionLocal  # noqa: E402

UTC = timezone.utc
DEMO_SOURCE = 'demo_seed'          # environmental_observations.source_type
DEMO_NOTE = '[demo]'               # marks rows on shared tables (businesses)

DEMO_USERS = [
    # username, full name, role name
    ('demo.dana', 'Dana Whitfield', 'caregiver'),
    ('demo.tom', 'Tom Okafor', 'nurse'),
]


# --------------------------------------------------------------------------
# Time helpers — schedules are cron-in-UTC, boards are account-local days.
# --------------------------------------------------------------------------

class Clock:
    def __init__(self, tz_name):
        self.tz = ZoneInfo(tz_name)
        self.now = datetime.now(UTC)
        self.today = self.now.astimezone(self.tz).date()

    def local(self, day, hour, minute=0, second=0):
        """Account-local wall time on `day` as an aware UTC datetime."""
        return datetime.combine(day, time(hour, minute, second), tzinfo=self.tz).astimezone(UTC)

    def cron(self, hours, minute=0):
        """UTC cron for daily local `hours` (today's offset — DST drift is
        the same approximation the UI's schedule editor makes)."""
        utc_hours = sorted({self.local(self.today, h, minute).hour for h in hours})
        return f"{minute} {','.join(str(h) for h in utc_hours)} * * *"

    def days_back(self, n):
        """Local days from n-1 days ago through today, oldest first."""
        return [self.today - timedelta(days=i) for i in range(n - 1, -1, -1)]


def iso(dt):
    return dt.astimezone(UTC).isoformat()


def naive_utc(dt):
    """For the legacy `scheduled_time` columns (timestamp without tz = UTC)."""
    return dt.astimezone(UTC).replace(tzinfo=None)


# --------------------------------------------------------------------------
# API client
# --------------------------------------------------------------------------

class Api:
    def __init__(self, base, username, password):
        self.c = httpx.Client(base_url=base, timeout=60)
        r = self.c.post('/api/auth/login', json={'username': username, 'password': password})
        r.raise_for_status()
        body = r.json()
        self.c.headers['Authorization'] = f"Bearer {body['access_token']}"
        self.user = body['user']

    def _call(self, method, path, **kw):
        r = self.c.request(method, path, **kw)
        if r.status_code >= 400:
            raise RuntimeError(f"{method} {path} -> {r.status_code}: {r.text[:400]}")
        return r.json() if r.content else None

    def get(self, path, **params):
        return self._call('GET', path, params=params)

    def post(self, path, body=None):
        return self._call('POST', path, json=body or {})

    def put(self, path, body):
        return self._call('PUT', path, json=body)


# --------------------------------------------------------------------------
# Wipe
# --------------------------------------------------------------------------

def wipe(db, pid):
    """Remove everything that hangs off the demo patient, children first."""
    stmts = [
        "DELETE FROM nutrition_flush_followups WHERE patient_id = :p",
        "DELETE FROM nutrition_intake WHERE patient_id = :p",
        "DELETE FROM nutrition_outputs WHERE patient_id = :p",
        "DELETE FROM nutrition_schedules WHERE patient_id = :p",
        "DELETE FROM nutrition_goals WHERE patient_id = :p",
        "DELETE FROM nutrition_items WHERE patient_id = :p",
        "DELETE FROM medication_log WHERE patient_id = :p",
        "DELETE FROM medication_schedule WHERE medication_id IN (SELECT id FROM medication WHERE patient_id = :p)",
        "DELETE FROM medication WHERE patient_id = :p",
        "DELETE FROM care_task_log WHERE patient_id = :p",
        "DELETE FROM care_task_schedule WHERE care_task_id IN (SELECT id FROM care_task WHERE patient_id = :p)",
        "DELETE FROM care_task WHERE patient_id = :p",
        "DELETE FROM equipment_change_log WHERE equipment_id IN (SELECT id FROM equipment WHERE patient_id = :p)",
        "DELETE FROM equipment_count_log WHERE equipment_id IN (SELECT id FROM equipment WHERE patient_id = :p)",
        "DELETE FROM dme_shipment_alerts WHERE shipment_id IN (SELECT id FROM dme_shipments WHERE patient_id = :p)",
        "DELETE FROM dme_shipment_items WHERE shipment_id IN (SELECT id FROM dme_shipments WHERE patient_id = :p)",
        "DELETE FROM dme_shipment_documents WHERE patient_id = :p",
        "DELETE FROM dme_shipments WHERE patient_id = :p",
        "DELETE FROM equipment WHERE patient_id = :p",
        "DELETE FROM symptoms WHERE patient_id = :p",
        "DELETE FROM diagnosis_notes WHERE diagnosis_id IN (SELECT id FROM diagnoses WHERE patient_id = :p)",
        "DELETE FROM diagnoses WHERE patient_id = :p",
        "DELETE FROM implant_notes WHERE implant_id IN (SELECT id FROM implants WHERE patient_id = :p)",
        "DELETE FROM implants WHERE patient_id = :p",
        "DELETE FROM providers WHERE patient_id = :p",
        "DELETE FROM vitals WHERE patient_id = :p",
        "DELETE FROM pulse_ox_data WHERE patient_id = :p",
        "DELETE FROM monitoring_alerts WHERE patient_id = :p",
        "DELETE FROM patient_vital_ranges WHERE patient_id = :p",
        "DELETE FROM patient_env_ranges WHERE patient_id = :p",
        "DELETE FROM user_message_acknowledgements WHERE message_id IN (SELECT id FROM user_messages WHERE patient_id = :p)",
        "DELETE FROM user_messages WHERE patient_id = :p",
        "DELETE FROM environmental_observations WHERE source_type = :src",
    ]
    for s in stmts:
        db.execute(text(s), {'p': pid, 'src': DEMO_SOURCE})
    db.commit()


# --------------------------------------------------------------------------
# Patient, users, businesses
# --------------------------------------------------------------------------

def ensure_patient(db, pid, account_id):
    row = db.execute(text("SELECT id FROM patients WHERE id = :p"), {'p': pid}).first()
    if row is None:
        db.execute(text("""
            INSERT INTO patients (id, account_id, first_name, last_name, date_of_birth,
                                  is_active, care_area, created_at, updated_at)
            VALUES (:p, :a, 'Jane', 'Doe', '1958-04-12', true, 'Bedroom', now(), now())
        """), {'p': pid, 'a': account_id})
    else:
        db.execute(text("""
            UPDATE patients SET account_id = :a, first_name = 'Jane', last_name = 'Doe',
                   date_of_birth = '1958-04-12', is_active = true, care_area = 'Bedroom',
                   medical_record_number = COALESCE(medical_record_number, 'MRN-004512'),
                   notes = 'Demo patient — synthetic data for screenshots and walkthroughs.',
                   updated_at = now()
            WHERE id = :p
        """), {'p': pid, 'a': account_id})
    db.commit()


def ensure_users(api, db, pid, account_id, demo_password=None):
    """Two caregivers so completions carry believable names. The seeder
    writes their ids straight onto the log rows; nobody signs in as them
    unless ``demo_password`` is given (screenshot sessions), in which case
    the nurse gets that password — the caregiver role cannot open Reports
    or the care profile."""
    roles = {r['name']: r['id'] for r in api.get('/api/auth/roles')}
    ids = {}
    for username, full_name, role in DEMO_USERS:
        row = db.execute(text("SELECT id FROM users WHERE username = :u"), {'u': username}).first()
        if row is None:
            created = api.post('/api/users', {
                'username': username, 'full_name': full_name,
                'password': uuid.uuid4().hex + 'Aa1!',
                'is_active': True, 'role_ids': [roles[role]],
            })
            ids[username] = created['id']
        else:
            ids[username] = row.id
    # Non-admin users only see patients granted to them — the demo users get
    # the demo patient and nothing else, which is also what keeps a screenshot
    # session away from real records.
    for uid in ids.values():
        db.execute(text("UPDATE users SET account_id = :a WHERE id = :u AND account_id IS NULL"),
                   {'a': account_id, 'u': uid})
        if not db.execute(text("SELECT 1 FROM patient_access WHERE user_id = :u AND patient_id = :p"),
                          {'u': uid, 'p': pid}).first():
            db.execute(text(
                "INSERT INTO patient_access (patient_id, user_id, access_level, is_active, "
                "granted_by_user_id, notes) VALUES (:p, :u, 'CAREGIVER', true, :g, :n)"
            ), {'p': pid, 'u': uid, 'g': api.user['id'], 'n': DEMO_NOTE})
    db.commit()
    if demo_password:
        nurse = next(u for u, _, role in DEMO_USERS if role == 'nurse')
        api.post(f'/api/users/{ids[nurse]}/reset-password', {'new_password': demo_password})
        # New users are steered through the first-login password change.
        db.execute(text("UPDATE users SET force_password_reset = false WHERE id = :u"), {'u': ids[nurse]})
        db.commit()
    return list(ids.values())


def ensure_business(api, name, types, **fields):
    for b in api.get('/api/businesses'):
        if b['name'] == name:
            return b['id']
    body = {'name': name, 'business_types': types, 'description': DEMO_NOTE}
    body.update(fields)
    return api.post('/api/businesses', body)['id']


# --------------------------------------------------------------------------
# Care team, diagnoses, implants
# --------------------------------------------------------------------------

def seed_care_team(api, pid, businesses):
    providers = [
        dict(first_name='Ellen', last_name='Marsh', title='MD', provider_type='medical',
             specialty='Neurology', is_primary=True, business_id=businesses['neuro'],
             phone='(555) 014-2200', department='ALS Clinic'),
        dict(first_name='Priya', last_name='Raman', title='MD', provider_type='medical',
             specialty='Pulmonology', business_id=businesses['hospital'], phone='(555) 014-3310'),
        dict(first_name='Marcus', last_name='Bell', title='DO', provider_type='medical',
             specialty='Primary care', phone='(555) 014-1180'),
        dict(first_name='Leah', last_name='Santos', title='RD', provider_type='medical',
             specialty='Clinical nutrition', business_id=businesses['hospital']),
    ]
    ids = {}
    for p in providers:
        p['patient_id'] = pid
        ids[p['last_name']] = api.post('/api/providers', p)['id']
    return ids


def seed_diagnoses(api, pid, prov):
    rows = [
        dict(name='Amyotrophic lateral sclerosis', icd10_code='G12.21', diagnosis_type='primary',
             severity='severe', status='chronic', onset_date='2023-03-01', diagnosis_date='2023-05-18',
             is_primary_diagnosis=True, managing_provider_id=prov['Marsh'],
             treatment_plan='Riluzole; multidisciplinary ALS clinic every 3 months; home ventilation via tracheostomy.'),
        dict(name='Chronic respiratory failure with hypercapnia', icd10_code='J96.12',
             diagnosis_type='secondary', severity='severe', status='chronic',
             diagnosis_date='2025-01-14', managing_provider_id=prov['Raman'],
             notes='Tracheostomy 2025-01-14. Nocturnal ventilation, daytime trach collar trials.'),
        dict(name='Dysphagia, oropharyngeal phase', icd10_code='R13.12', diagnosis_type='secondary',
             severity='moderate', status='chronic', diagnosis_date='2024-09-02',
             notes='NPO. All nutrition and medications via gastrostomy tube.'),
        dict(name='Essential hypertension', icd10_code='I10', diagnosis_type='comorbidity',
             severity='mild', status='active', diagnosis_date='2016-02-11', managing_provider_id=prov['Bell']),
        dict(name='Gastro-esophageal reflux disease', icd10_code='K21.9', diagnosis_type='comorbidity',
             severity='mild', status='active', diagnosis_date='2019-07-30'),
    ]
    for r in rows:
        r['patient_id'] = pid
        api.post('/api/diagnoses', r)


def seed_implants(api, pid, prov, clock):
    trach_last = clock.today - timedelta(days=20)
    gt_last = clock.today - timedelta(days=61)
    rows = [
        dict(name='Tracheostomy tube', implant_type='medical', category='airway',
             body_location='Trachea', body_side='midline', manufacturer='Shiley',
             model='6.0 cuffed, distal extension', size='6.0 mm', implant_date='2025-01-14',
             last_change_date=trach_last.isoformat(),
             next_change_date=(trach_last + timedelta(days=30)).isoformat(),
             managing_provider_id=prov['Raman'], is_life_sustaining=True,
             requires_regular_change=True, change_frequency_days=30, mri_safe='conditional',
             care_instructions='Cuff pressure 20–25 cmH2O twice daily. Inner cannula cleaned at each trach care.'),
        dict(name='Gastrostomy tube', implant_type='medical', category='feeding',
             body_location='Abdomen, left upper quadrant', body_side='left', manufacturer='MIC-KEY',
             model='Low-profile G-tube', size='16 Fr, 2.0 cm', implant_date='2024-09-20',
             last_change_date=gt_last.isoformat(),
             next_change_date=(gt_last + timedelta(days=90)).isoformat(),
             managing_provider_id=prov['Santos'], requires_regular_change=True,
             change_frequency_days=90, mri_safe='safe',
             care_instructions='Check balloon volume weekly (5 mL). Rotate 360° at site care.'),
    ]
    for r in rows:
        r['patient_id'] = pid
        api.post('/api/implants', r)


# --------------------------------------------------------------------------
# Medications
# --------------------------------------------------------------------------

MEDS = [
    # name, concentration, unit, qty, threshold(days), local hours, dose, instructions
    ('Riluzole', '50 mg', 'tablets', 42, 7, [8, 20], 1, 'Give 1 hour before or 2 hours after a feed.'),
    ('Baclofen', '10 mg', 'tablets', 61, 7, [8, 14, 20], 1, 'Crush and flush with 30 mL water.'),
    ('Glycopyrrolate', '1 mg', 'tablets', 8, 7, [8, 14, 20], 1, 'For secretions. Hold if heart rate over 110.'),
    ('Lisinopril', '10 mg', 'tablets', 24, 7, [8], 1, 'Check blood pressure before the morning dose.'),
    ('Pantoprazole', '40 mg', 'tablets', 27, 7, [7], 1, 'Before the first feed of the day.'),
    ('Senna', '8.6 mg', 'tablets', 45, 7, [20], 1, 'Hold if loose stool that day.'),
    ('Albuterol', '2.5 mg/3 mL', 'vials', 38, 7, [8, 20], 1, 'Nebulized via trach collar; suction after.'),
]
PRN_MEDS = [
    ('Acetaminophen', '325 mg', 'tablets', 90, None, [], 2,
     'Every 6 hours as needed for pain or fever. Max 3,000 mg per day.'),
]


def seed_medications(api, db, pid, prov, pharmacy_id, users, clock, history_days):
    start = (clock.today - timedelta(days=120)).isoformat()
    sched_ids = []      # (schedule_id, med_id, local hours, dose)
    for name, conc, unit, qty, thr, hours, dose, instr in MEDS + PRN_MEDS:
        med = api.post('/api/add/medication', {
            'name': name, 'concentration': conc, 'quantity': qty, 'quantity_unit': unit,
            'low_stock_threshold': thr, 'low_stock_threshold_type': 'days',
            'instructions': instr, 'start_date': start, 'as_needed': not hours,
            'is_patient_specific': True, 'admin_patient_id': pid,
            'prescriber_id': prov['Marsh'] if name in ('Riluzole', 'Baclofen', 'Glycopyrrolate') else prov['Bell'],
            'pharmacy_id': pharmacy_id,
        })
        if not hours:
            continue
        label = {1: 'Once daily', 2: 'Twice daily', 3: 'Three times daily'}[len(hours)]
        sch = api.post(f"/api/add/schedule/{med['id']}", {
            'cron_expression': clock.cron(hours), 'description': label,
            'dose_amount': dose, 'patient_id': pid,
        })
        sched_ids.append((sch['id'], med['id'], hours, dose))

    rng = random.Random(41)
    rows = []
    for day in clock.days_back(history_days):
        for sid, mid, hours, dose in sched_ids:
            for h in hours:
                due = clock.local(day, h)
                if due > clock.now - timedelta(minutes=20):
                    continue
                roll = rng.random()
                if roll < 0.03:
                    given, amount, late = due + timedelta(minutes=rng.randint(5, 40)), 0, False
                    note = rng.choice(['Held — asleep, will give at next check.',
                                       'Held per nurse — heart rate 112.'])
                elif roll < 0.10:
                    given, amount, late = due + timedelta(minutes=rng.randint(65, 140)), dose, True
                    note = None
                else:
                    given, amount, late = due + timedelta(minutes=rng.randint(-8, 28)), dose, False
                    note = None
                rows.append({
                    'mid': mid, 'p': pid, 'sid': sid, 'st': naive_utc(due), 'at': given,
                    'by': rng.choice(users), 'dose': amount, 'late': late, 'note': note,
                })
    db.execute(text("""
        INSERT INTO medication_log (medication_id, patient_id, schedule_id, scheduled_time,
            administered_at, administered_by, dose_amount, is_scheduled,
            administered_early, administered_late, notes, created_at)
        VALUES (:mid, :p, :sid, :st, :at, :by, :dose, true, false, :late, :note, :at)
    """), rows)
    db.commit()
    return len(rows)


# --------------------------------------------------------------------------
# Care tasks
# --------------------------------------------------------------------------

TASKS = [
    # name, category, description, local hours (None = PRN)
    ('Trach care', 'Respiratory', 'Clean stoma, change inner cannula, inspect ties.', [9, 21]),
    ('Cuff pressure check', 'Respiratory', 'Target 20–25 cmH2O.', [7, 19]),
    ('Chest physiotherapy', 'Respiratory', 'Percussion and postural drainage, 15 minutes.', [10, 16]),
    ('Reposition', 'Daily Care', 'Turn and check pressure points.', [8, 10, 12, 14, 16, 18, 20, 22]),
    ('Oral care', 'Daily Care', 'Suction toothbrush and moisturizer.', [8, 20]),
    ('G-tube site check', 'Daily Care', 'Clean, rotate, check for leakage or redness.', [9]),
    ('Range-of-motion exercises', 'therapy', 'All four limbs, per PT handout.', [11]),
    ('Suction', 'Respiratory', 'Oral and tracheal suction as needed.', None),
]


def seed_care_tasks(api, db, pid, users, clock, history_days):
    cats = {c['name']: c['id'] for c in api.get('/api/care-task-categories')['categories']}
    scheduled = []
    prn = []
    for name, cat, desc, hours in TASKS:
        task = api.post('/api/add/care-task', {
            'name': name, 'description': desc, 'category_id': cats.get(cat), 'patient_id': pid,
        })
        if hours is None:
            prn.append(task['id'])
            continue
        sch = api.post(f"/api/add/care-task-schedule/{task['id']}", {
            'cron_expression': clock.cron(hours), 'description': name, 'patient_id': pid,
        })
        scheduled.append((sch['id'], task['id'], hours))

    rng = random.Random(7)
    rows = []
    for day in clock.days_back(history_days):
        for sid, tid, hours in scheduled:
            for h in hours:
                due = clock.local(day, h)
                if due > clock.now - timedelta(minutes=20):
                    continue
                roll = rng.random()
                if roll < 0.04:
                    status, done, late = 'skipped', due + timedelta(minutes=rng.randint(10, 50)), False
                elif roll < 0.12:
                    status, done, late = 'completed', due + timedelta(minutes=rng.randint(20, 75)), True
                else:
                    status, done, late = 'completed', due + timedelta(minutes=rng.randint(-5, 14)), False
                rows.append({'tid': tid, 'p': pid, 'sid': sid, 'st': naive_utc(due), 'at': done,
                             'by': rng.choice(users), 'status': status, 'late': late})
        # A few PRN suctions a day, more at night.
        for tid in prn:
            for h in sorted(rng.sample([1, 3, 5, 9, 13, 15, 19, 23], k=rng.randint(2, 4))):
                done = clock.local(day, h, rng.randint(0, 59))
                if done > clock.now:
                    continue
                rows.append({'tid': tid, 'p': pid, 'sid': None, 'st': None, 'at': done,
                             'by': rng.choice(users), 'status': 'completed', 'late': False})
    db.execute(text("""
        INSERT INTO care_task_log (care_task_id, patient_id, schedule_id, scheduled_time,
            completed_at, performed_by, status, is_scheduled, completed_early, completed_late, created_at)
        VALUES (:tid, :p, :sid, :st, :at, :by, :status, :sid IS NOT NULL, false, :late, :at)
    """), rows)
    db.commit()
    return len(rows)


# --------------------------------------------------------------------------
# Nutrition
# --------------------------------------------------------------------------

def seed_nutrition(api, pid, users, clock, history_days):
    api.post('/api/nutrition/goals', {
        'patient_id': pid, 'effective_date': iso(clock.local(clock.today - timedelta(days=90), 0)),
        'calories_target': 1500, 'calories_min': 1350, 'calories_max': 1700,
        'protein_grams_target': 70, 'fiber_grams_target': 20,
        'water_ml_target': 1200, 'urine_output_ml_min': 1000, 'bowel_movements_target': 1,
        'notes': 'Per dietitian 2026-06: 1.5 kcal/mL peptide formula, 4 feeds, free water to 1.2 L.',
    })

    def item(name, kind, **f):
        body = {'name': name, 'item_type': kind, 'patient_id': pid, 'default_amount_unit': 'ml'}
        body.update(f)
        return api.post('/api/nutrition/items', body)['id']

    peptide = item('Peptide 1.5', 'tube_feed', brand='Kate Farms', default_amount=325,
                   calories_per_unit=1.5, protein_per_unit=0.06, carbs_per_unit=0.16,
                   fat_per_unit=0.06, fiber_per_unit=0.006, sodium_per_unit=0.74,
                   barcode='851823006119')
    water = item('Water', 'liquid', default_amount=200)
    juice = item('Apple juice', 'liquid', brand='Mott\'s', default_amount=120,
                 calories_per_unit=0.46, carbs_per_unit=0.11)
    electrolyte = item('Electrolyte solution', 'liquid', brand='Pedialyte', default_amount=240,
                       calories_per_unit=0.1, sodium_per_unit=0.42)
    item('Protein powder', 'supplement', brand='Beneprotein', default_amount=7,
         default_amount_unit='g', calories_per_unit=3.6, protein_per_unit=0.86)

    feed_mix = [
        {'item_id': peptide, 'amount': 325, 'amount_unit': 'ml', 'feed_route': 'pump',
         'rate_ml_per_hr': 250, 'sort_order': 0},
        {'item_id': water, 'amount': 60, 'amount_unit': 'ml', 'is_flush': True, 'sort_order': 1},
    ]
    feeds = []
    for name, hour in (('Morning feed', 7), ('Midday feed', 12), ('Afternoon feed', 17), ('Evening feed', 21)):
        s = api.post('/api/nutrition/schedules', {
            'patient_id': pid, 'schedule_type': 'meal', 'name': name,
            'cron_expression': clock.cron([hour]), 'components': feed_mix,
            'instructions': 'Head of bed 30° during and 30 minutes after.',
        })
        feeds.append((s['id'], hour))
    spots = []
    for name, hour in (('Mid-morning water', 10), ('Afternoon water', 15)):
        s = api.post('/api/nutrition/schedules', {
            'patient_id': pid, 'schedule_type': 'hydration', 'name': name,
            'cron_expression': clock.cron([hour]), 'default_item_name': 'Water',
            'default_amount': 250, 'default_amount_unit': 'ml',
            'fills_fluid_goal': True, 'fluid_min_ml': 100, 'fluid_max_ml': 350,
        })
        spots.append((s['id'], hour))
    for name, hours in (('Bathroom assist', [9, 14, 19]),):
        api.post('/api/nutrition/schedules', {
            'patient_id': pid, 'schedule_type': 'bathroom_assist', 'name': name,
            'cron_expression': clock.cron(hours),
        })

    rng = random.Random(11)
    n = 0
    for day in clock.days_back(history_days):
        for sid, hour in feeds:
            due = clock.local(day, hour)
            if due > clock.now - timedelta(minutes=15):
                continue
            at = due + timedelta(minutes=rng.randint(-5, 25))
            api.post('/api/nutrition/intake/event', {
                'patient_id': pid, 'consumed_at': iso(at), 'schedule_id': sid,
                'scheduled_time': iso(due), 'recorded_by': rng.choice(users), 'meal_type': 'other',
                'items': [{'item_id': peptide, 'item_name': 'Peptide 1.5', 'item_type': 'tube_feed',
                           'amount': 325, 'amount_unit': 'ml', 'feed_route': 'pump',
                           'rate_ml_per_hr': 250, 'calories': 487.5, 'protein_grams': 19.5,
                           'carbs_grams': 52, 'fat_grams': 19.5, 'fiber_grams': 2, 'sodium_mg': 240}],
            })
            n += 1
        for sid, hour in spots:
            due = clock.local(day, hour)
            if due > clock.now - timedelta(minutes=15):
                continue
            at = due + timedelta(minutes=rng.randint(0, 30))
            amount = rng.choice([200, 220, 250, 250, 300])
            api.post('/api/nutrition/intake/event', {
                'patient_id': pid, 'consumed_at': iso(at), 'schedule_id': sid,
                'scheduled_time': iso(due), 'recorded_by': rng.choice(users), 'meal_type': 'other',
                'items': [{'item_id': water, 'item_name': 'Water', 'item_type': 'liquid',
                           'amount': amount, 'amount_unit': 'ml'}],
            })
            n += 1
        # An unscheduled juice or electrolyte top-up most afternoons.
        if rng.random() < 0.6:
            at = clock.local(day, 13, rng.randint(15, 50))
            if at < clock.now:
                iid, name, amt, kcal = rng.choice([
                    (juice, 'Apple juice', 120, 55), (electrolyte, 'Electrolyte solution', 240, 24)])
                api.post('/api/nutrition/intake/event', {
                    'patient_id': pid, 'consumed_at': iso(at), 'recorded_by': rng.choice(users),
                    'meal_type': 'snack',
                    'items': [{'item_id': iid, 'item_name': name, 'item_type': 'liquid',
                               'amount': amt, 'amount_unit': 'ml', 'calories': kcal}],
                })
                n += 1

    # Feeds spawned their post-feed flushes; run every one that is due more
    # than an hour ago so only today's stragglers remain pending on the board.
    for f in api.get(f'/api/patients/{pid}/flush-followups', status='pending'):
        due = datetime.fromisoformat(f['due_at'])
        if due.tzinfo is None:
            due = due.replace(tzinfo=UTC)
        if due < clock.now - timedelta(hours=1):
            api.post(f"/api/nutrition/flush/{f['id']}/complete", {
                'completed_at': iso(due + timedelta(minutes=rng.randint(1, 9))),
                'user_id': rng.choice(users),
            })
            n += 1

    # Bathroom events: catheter bag readings and a daily stool.
    for day in clock.days_back(history_days):
        for h, ml in ((7, 380), (13, 320), (19, 340), (23, 260)):
            at = clock.local(day, h, rng.randint(0, 40))
            if at > clock.now:
                continue
            api.post('/api/nutrition/outputs/event', {
                'patient_id': pid, 'location': 'catheter', 'occurred_at': iso(at),
                'recorded_by': rng.choice(users),
                'urine': {'amount': ml + rng.randint(-60, 60), 'amount_unit': 'ml',
                          'clarity': rng.choice(['clear', 'clear', 'clear', 'cloudy']),
                          'catheter_bag_emptied': True},
            })
            n += 1
        if rng.random() < 0.8:
            at = clock.local(day, 9, rng.randint(20, 55))
            if at < clock.now:
                api.post('/api/nutrition/outputs/event', {
                    'patient_id': pid, 'location': 'diaper', 'occurred_at': iso(at),
                    'recorded_by': rng.choice(users),
                    'stool': {'bristol_scale': rng.choice([3, 4, 4, 4, 5]),
                              'color': 'brown', 'amount_unit': rng.choice(['small', 'medium', 'medium'])},
                })
                n += 1
    return n


# --------------------------------------------------------------------------
# Equipment and shipments
# --------------------------------------------------------------------------

SUPPLIES = [
    # name, item#, category, qty, reorder, par, uom, useful_days (scheduled change) or None
    # Most of the cupboard is stocked to par; four items are genuinely short
    # so the overview has something to say without looking like a crisis.
    ('Tracheostomy tube, Shiley 6.0 cuffed', 'SHI-6CFS', 'equipment', 2, 1, 2, 'each', 30),
    ('Ventilator circuit, heated', 'VC-H22', 'equipment', 1, 1, 3, 'each', 30),
    ('HME filter', 'HME-T15', 'consumable', 18, 10, 30, 'each', 1),
    ('G-tube extension set, 12 in', 'MK-EXT12', 'consumable', 6, 2, 6, 'each', 7),
    ('Suction catheter, 14 Fr', 'SC-14', 'supply', 96, 30, 90, 'each', None),
    ('Trach ties, padded', 'TT-PAD', 'supply', 12, 5, 12, 'each', None),
    ('Split gauze sponge, 4x4', 'GZ-SPLIT4', 'supply', 12, 20, 60, 'each', None),
    ('Feeding pump bag set, 500 mL', 'PB-500', 'supply', 31, 7, 30, 'each', None),
    ('Saline bullets, 3 mL', 'SAL-3', 'supply', 124, 40, 120, 'each', None),
    ('Sterile water, 1 L', 'SW-1L', 'supply', 4, 4, 12, 'bottle', None),
    ('Yankauer suction tip', 'YK-1', 'supply', 15, 5, 15, 'each', None),
]


def seed_equipment(api, db, pid, users, businesses, clock, history_days):
    rng = random.Random(23)
    ids = {}
    for name, item_no, cat, qty, reorder, par, uom, useful in SUPPLIES:
        body = {
            'name': name, 'item_number': item_no, 'category': cat, 'quantity': qty,
            'reorder_point': reorder, 'par_level': par, 'unit_of_measure': uom,
            'patient_id': pid, 'tracking_level': 'item', 'storage_location': 'Hall closet',
            'scheduled_replacement': useful is not None,
        }
        if useful is not None:
            # The trach and circuit are due soon; the daily HME was done today.
            ago = {30: 20 if 'Shiley' in name else 27, 7: 5, 1: 0}[useful]
            body['last_changed'] = (clock.today - timedelta(days=ago)).isoformat()
            body['useful_days'] = useful
        ids[item_no] = api.post('/api/equipment', body)['id']

    # Change history for the scheduled items (no stock deduction — the
    # quantities above are the on-hand counts as of today).
    rows = []
    for day in clock.days_back(history_days):
        at = clock.local(day, 9, rng.randint(0, 30))
        if at < clock.now:
            rows.append({'e': ids['HME-T15'], 'p': pid, 'at': at, 'by': rng.choice(users)})
    for ago in (5, 12):
        rows.append({'e': ids['MK-EXT12'], 'p': pid,
                     'at': clock.local(clock.today - timedelta(days=ago), 9, 10), 'by': rng.choice(users)})
    for ago in (20, 50):
        rows.append({'e': ids['SHI-6CFS'], 'p': pid,
                     'at': clock.local(clock.today - timedelta(days=ago), 10, 30), 'by': users[-1]})
    db.execute(text("""
        INSERT INTO equipment_change_log (equipment_id, patient_id, changed_at, changed_by, created_at)
        VALUES (:e, :p, :at, :by, :at)
    """), rows)
    db.commit()

    # One delivery on its way, one already put away last week.
    supplier = businesses['dme']
    inbound = api.post('/api/shipments', {
        'patient_id': pid, 'supplier_id': supplier, 'po_number': 'PO-48113',
        'order_number': 'SO-2026-09-0114', 'ship_method': 'UPS Ground',
        'tracking_number': '1Z 999 AA1 01 2345 6784',
        'ship_date': (clock.today - timedelta(days=2)).isoformat(),
        'expected_delivery': (clock.today + timedelta(days=2)).isoformat(),
        'notes': 'Monthly standing order.',
    })
    api.put(f"/api/shipments/{inbound['id']}", {'status': 'shipped'})
    api.post(f"/api/shipments/{inbound['id']}/items/bulk", [
        {'equipment_id': ids['SC-14'], 'item_number': 'SC-14', 'item_description': 'Suction catheter, 14 Fr',
         'qty_ordered': 90, 'qty_shipped': 90, 'unit_of_measure': 'each'},
        {'equipment_id': ids['HME-T15'], 'item_number': 'HME-T15', 'item_description': 'HME filter',
         'qty_ordered': 30, 'qty_shipped': 30, 'unit_of_measure': 'each'},
        {'equipment_id': ids['GZ-SPLIT4'], 'item_number': 'GZ-SPLIT4', 'item_description': 'Split gauze sponge, 4x4',
         'qty_ordered': 60, 'qty_shipped': 40, 'qty_backordered': 20, 'unit_of_measure': 'each'},
        {'equipment_id': ids['PB-500'], 'item_number': 'PB-500', 'item_description': 'Feeding pump bag set, 500 mL',
         'qty_ordered': 30, 'qty_shipped': 30, 'unit_of_measure': 'each'},
    ])
    done = api.post('/api/shipments', {
        'patient_id': pid, 'supplier_id': supplier, 'po_number': 'PO-47902',
        'order_number': 'SO-2026-08-0871', 'ship_method': 'UPS Ground',
        'ship_date': (clock.today - timedelta(days=11)).isoformat(),
        'expected_delivery': (clock.today - timedelta(days=8)).isoformat(),
    })
    api.put(f"/api/shipments/{done['id']}", {
        'status': 'complete', 'actual_delivery': (clock.today - timedelta(days=8)).isoformat()})
    api.post(f"/api/shipments/{done['id']}/items/bulk", [
        {'equipment_id': ids['SAL-3'], 'item_number': 'SAL-3', 'item_description': 'Saline bullets, 3 mL',
         'qty_ordered': 120, 'qty_shipped': 120, 'unit_of_measure': 'each'},
        {'equipment_id': ids['TT-PAD'], 'item_number': 'TT-PAD', 'item_description': 'Trach ties, padded',
         'qty_ordered': 12, 'qty_shipped': 12, 'unit_of_measure': 'each'},
    ])
    return len(ids)


# --------------------------------------------------------------------------
# Symptoms
# --------------------------------------------------------------------------

def seed_symptoms(api, pid, clock):
    d = lambda days, h: iso(clock.local(clock.today - timedelta(days=days), h))  # noqa: E731
    rows = [
        dict(symptom_type='Increased secretions', severity=4, location='Airway', duration='2 days',
             description='Thicker than usual, needing suction every 2 hours overnight.',
             timestamp=d(2, 6), is_resolved=False),
        dict(symptom_type='Skin redness at stoma', severity=3, location='Trach stoma', duration='1 day',
             description='Pink ring under the flange, no drainage. Barrier cream started.',
             timestamp=d(1, 9), is_resolved=False),
        dict(symptom_type='Low-grade fever', severity=3, duration='18 hours',
             description='99.8 °F at the evening check, back to normal by morning.',
             timestamp=d(6, 19), is_resolved=True),
        dict(symptom_type='Constipation', severity=4, duration='2 days',
             description='No stool for two days. Extra water and senna.',
             timestamp=d(9, 10), is_resolved=True),
        dict(symptom_type='Fatigue', severity=5, duration='1 day',
             description='Very tired after the clinic visit; slept most of the afternoon.',
             timestamp=d(12, 15), is_resolved=True),
    ]
    for r in rows:
        r['patient_id'] = pid
        api.post('/api/symptoms', r)


# --------------------------------------------------------------------------
# Vitals — manual readings and the pulse-ox stream
# --------------------------------------------------------------------------

def seed_ranges(api, pid):
    api.put('/api/vitals/ranges', {'patient_id': pid, 'ranges': [
        dict(vital_key='spo2', expected_min=92, expected_max=100, implausible_min=50, required=True),
        dict(vital_key='heart_rate', expected_min=55, expected_max=110, implausible_min=20, implausible_max=250, required=True),
        dict(vital_key='blood_pressure', field_key='systolic', expected_min=100, expected_max=140, implausible_min=50, implausible_max=250),
        dict(vital_key='blood_pressure', field_key='diastolic', expected_min=60, expected_max=90, implausible_min=30, implausible_max=150),
        dict(vital_key='temperature', expected_min=97.0, expected_max=99.5, implausible_min=90, implausible_max=108, required=True),
        dict(vital_key='respiratory_rate', expected_min=12, expected_max=24, implausible_min=4, implausible_max=60),
        dict(vital_key='weight', expected_min=120, expected_max=140, implausible_min=60, implausible_max=300),
    ]})
    api.put('/api/environment/ranges', {'patient_id': pid, 'ranges': [
        dict(metric='temperature', caution_min=19, caution_max=25, critical_min=16, critical_max=29),
        dict(metric='relative_humidity', caution_min=35, caution_max=55, critical_min=25, critical_max=65),
        dict(metric='co2', caution_max=1000, critical_max=1500),
        dict(metric='pm25', caution_max=12, critical_max=35),
    ]})


def seed_manual_vitals(api, pid, clock, history_days):
    rng = random.Random(5)
    n = 0
    for i, day in enumerate(clock.days_back(history_days)):
        at = clock.local(day, 8, rng.randint(5, 25))
        if at > clock.now:
            continue
        readings = [
            {'vital_key': 'blood_pressure', 'systolic': rng.randint(116, 134),
             'diastolic': rng.randint(70, 84)},
            {'vital_key': 'heart_rate', 'value': rng.randint(66, 84)},
            {'vital_key': 'temperature', 'value': round(rng.uniform(97.5, 98.9), 1)},
            {'vital_key': 'respiratory_rate', 'value': rng.randint(15, 20)},
            {'vital_key': 'spo2', 'value': rng.randint(95, 98)},
        ]
        if i % 7 == 0:
            readings.append({'vital_key': 'weight',
                             'value': round(128.4 - i * 0.05 + rng.uniform(-0.4, 0.4), 1)})
        for r in readings:
            r['measured_at'] = iso(at)
        api.post('/api/vitals/capture', {
            'patient_id': pid, 'encounter_uid': f'demo-{day.isoformat()}', 'readings': readings,
        })
        n += len(readings)
    return n


def _night_events(rng, clock, day):
    """Desaturation events for the night that ENDS on `day` (local).
    Returns (start_utc, duration_s, spo2_min, bpm_peak) tuples."""
    events = []
    for _ in range(rng.choice([1, 2, 2, 3])):
        h, m = rng.choice([(23, 0), (0, 30), (1, 45), (3, 10), (4, 20), (5, 5)])
        base_day = day - timedelta(days=1) if h == 23 else day
        start = clock.local(base_day, h, m) + timedelta(minutes=rng.randint(0, 40))
        events.append((start, rng.randint(40, 150), rng.randint(84, 88), rng.randint(96, 118)))
    return sorted(events)


def seed_pulse_ox(db, pid, account_id, clock, pulse_days):
    """A 2-second oximeter stream: quiet days, a daily off-monitor gap, and a
    few overnight desaturations that become closed alerts."""
    rng = random.Random(3)
    step = 2
    start = clock.local(clock.today - timedelta(days=pulse_days - 1), 0)
    end = clock.now - timedelta(seconds=5)

    events = []
    for day in clock.days_back(pulse_days):
        events += _night_events(rng, clock, day)
    # One daytime tachycardia three days back, mid-afternoon.
    hr_day = clock.today - timedelta(days=3)
    hr_event = clock.local(hr_day, 15, 22)
    events.append((hr_event, 85, 95, 162))
    events.sort()

    # Off-monitor windows: bath/therapy each morning, plus short gaps.
    gaps = []
    for day in clock.days_back(pulse_days):
        g0 = clock.local(day, 9, 30 + rng.randint(0, 20))
        gaps.append((g0, g0 + timedelta(minutes=rng.randint(60, 95))))
        for _ in range(rng.randint(1, 3)):
            g = clock.local(day, rng.randint(11, 22), rng.randint(0, 59))
            gaps.append((g, g + timedelta(minutes=rng.randint(2, 6))))

    buf = io.StringIO()
    t = start
    ev_idx = 0
    spo2_base = 97.0
    bpm_base = 74.0
    phase = rng.random() * 100
    while t < end:
        if any(g0 <= t < g1 for g0, g1 in gaps):
            t += timedelta(seconds=step)
            continue
        local_h = t.astimezone(clock.tz).hour + t.minute / 60
        night = 0.5 * (1 + math.cos((local_h - 3) / 24 * 2 * math.pi))  # 1 at 3 am, 0 at 3 pm
        # Slow wander + breathing-rate ripple.
        secs = (t - start).total_seconds()
        spo2_base += rng.gauss(0, 0.02)
        spo2_base = min(98.5, max(94.5, spo2_base))
        bpm_base += rng.gauss(0, 0.05)
        bpm_base = min(84, max(62, bpm_base))
        spo2 = spo2_base - 1.2 * night + 0.6 * math.sin(secs / 37 + phase) + rng.gauss(0, 0.35)
        bpm = bpm_base - 10 * night + 1.5 * math.sin(secs / 11) + rng.gauss(0, 0.9)
        pa = 2.2 + 1.2 * night + 0.4 * math.sin(secs / 53) + rng.gauss(0, 0.15)

        # Overlay the active event, if any: a dip with a tail.
        while ev_idx < len(events) and t > events[ev_idx][0] + timedelta(seconds=events[ev_idx][1] + 60):
            ev_idx += 1
        if ev_idx < len(events):
            e_start, e_dur, e_min, e_bpm = events[ev_idx]
            dt = (t - e_start).total_seconds()
            if 0 <= dt <= e_dur + 60:
                x = min(dt / max(e_dur * 0.35, 10), 1.0) if dt <= e_dur else max(0.0, 1 - (dt - e_dur) / 60)
                if e_min < 90:
                    spo2 = spo2 + (e_min - spo2) * x
                bpm = bpm + (e_bpm - bpm) * x

        buf.write(f"{pid}\t{t.isoformat()}\t{int(round(spo2))}\t{int(round(bpm))}\t{round(max(0.3, pa), 1)}\n")
        t += timedelta(seconds=step)

    buf.seek(0)
    raw = db.connection().connection
    with raw.cursor() as cur:
        cur.copy_expert(
            "COPY pulse_ox_data (patient_id, timestamp, spo2, bpm, pa) FROM STDIN WITH (FORMAT text)", buf)
    db.commit()

    # Alerts follow the stream: open at the first sample under the SpO2 floor
    # (or over the HR ceiling), closed by live recovery once it climbs back.
    alerts = []
    for e_start, e_dur, e_min, e_bpm in events:
        is_hr = e_min >= 90
        hit = (e_bpm >= 155) if is_hr else (e_min < 90)
        if not hit:
            continue
        s = e_start + timedelta(seconds=6 if is_hr else 8)
        e = e_start + timedelta(seconds=e_dur + (10 if is_hr else 14))
        alerts.append({
            'a': account_id, 'p': pid, 's': s, 'e': e, 'src': 'live_recovery',
            'ack': e < clock.now - timedelta(hours=18),
            'smin': 95 if is_hr else e_min, 'smax': 95 if is_hr else 89,
            'bmin': 88 if is_hr else 74, 'bmax': e_bpm,
            'hr': is_hr, 'sp': not is_hr,
        })
    db.execute(text("""
        INSERT INTO monitoring_alerts (account_id, patient_id, start_time, end_time, end_source,
            acknowledged, spo2_min, spo2_max, bpm_min, bpm_max,
            spo2_alarm_triggered, hr_alarm_triggered, external_alarm_triggered, oxygen_used, created_at)
        VALUES (:a, :p, :s, :e, :src, :ack, :smin, :smax, :bmin, :bmax, :sp, :hr, false, false, :s)
    """), alerts)
    db.commit()
    return len(alerts)


# --------------------------------------------------------------------------
# Room sensors
# --------------------------------------------------------------------------

def seed_room_environment(db, account_id, clock, pulse_days):
    """Bedroom temperature, humidity and CO2 every 5 minutes. CO2 climbs
    overnight with the door shut — the correlation grid has something to
    say — and one warm afternoon nudges the caution band."""
    rng = random.Random(17)
    start = clock.local(clock.today - timedelta(days=pulse_days - 1), 0)
    warm_day = clock.today - timedelta(days=4)
    rows = []
    t = start
    while t < clock.now:
        lh = t.astimezone(clock.tz)
        h = lh.hour + lh.minute / 60
        night = 0.5 * (1 + math.cos((h - 4) / 24 * 2 * math.pi))
        temp = 21.6 + 1.4 * (1 - night) + rng.gauss(0, 0.12)
        if lh.date() == warm_day and 13 <= h <= 18:
            temp += 3.2 * math.sin((h - 13) / 5 * math.pi)
        rh = 42 + 5 * night + rng.gauss(0, 0.8)
        co2 = 520 + 520 * night ** 1.5 + rng.gauss(0, 18)
        pm25 = max(0.5, 3.5 + 1.5 * (1 - night) + rng.gauss(0, 0.6))
        for metric, value, unit in (('temperature', temp, '°C'), ('relative_humidity', rh, '%'),
                                    ('co2', co2, 'ppm'), ('pm25', pm25, 'µg/m³')):
            rows.append({'a': account_id, 'ts': t, 'm': metric, 'v': round(value, 1), 'u': unit})
        t += timedelta(minutes=5)
    db.execute(text("""
        INSERT INTO environmental_observations (account_id, timestamp, metric, value, unit, scope,
            location, source_type, source_id, quality)
        VALUES (:a, :ts, :m, :v, :u, 'room', 'Bedroom', :src, 'bedroom-1', 'measured')
        ON CONFLICT DO NOTHING
    """), [dict(r, src=DEMO_SOURCE) for r in rows])
    db.commit()
    return len(rows)


# --------------------------------------------------------------------------
# Messages
# --------------------------------------------------------------------------

def seed_messages(api, pid, clock):
    thursday = clock.today + timedelta(days=(3 - clock.today.weekday()) % 7 or 7)
    api.post('/api/messages', {
        'title': f"Pulmonology follow-up {thursday.strftime('%a %b %-d')} at 10:30",
        'body': 'Dr. Raman. Bring the ventilator settings printout and the overnight report from this week.',
        'type': 'appointment', 'severity': 'info', 'patient_id': pid, 'dedupe_key': 'demo-appt',
    })
    api.post('/api/messages', {
        'title': 'Trach change due in 10 days',
        'body': 'Confirm the home-nursing visit and check the spare 6.0 tube is on the shelf.',
        'type': 'care', 'severity': 'warning', 'patient_id': pid, 'dedupe_key': 'demo-trach',
    })
    api.post('/api/messages', {
        'title': 'Supply delivery on the way',
        'body': 'UPS shows the monthly order arriving in two days. Gauze is short 20 on this shipment.',
        'type': 'general', 'severity': 'info', 'patient_id': pid, 'dedupe_key': 'demo-supply',
    })


# --------------------------------------------------------------------------

def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--api', default=os.environ.get('SEED_API', 'http://localhost:8000'))
    ap.add_argument('--user', default=os.environ.get('SEED_USER'), required='SEED_USER' not in os.environ)
    ap.add_argument('--password', default=os.environ.get('SEED_PASSWORD'),
                    required='SEED_PASSWORD' not in os.environ)
    ap.add_argument('--patient-id', type=int, default=9)
    ap.add_argument('--account-id', type=int, default=None,
                    help='defaults to the signed-in user\'s account')
    ap.add_argument('--days', type=int, default=14, help='days of dose/task/feed history')
    ap.add_argument('--pulse-days', type=int, default=7, help='days of 2-second oximeter stream')
    ap.add_argument('--demo-password', default=os.environ.get('SEED_DEMO_PASSWORD'),
                    help='give the demo nurse a known password (screenshot sessions only)')
    args = ap.parse_args()

    api = Api(args.api, args.user, args.password)
    db = SessionLocal()
    try:
        account_id = args.account_id
        if account_id is None:
            account_id = db.execute(text("SELECT account_id FROM users WHERE id = :u"),
                                    {'u': api.user['id']}).scalar()
        tz_name = db.execute(text("SELECT timezone FROM accounts WHERE id = :a"),
                             {'a': account_id}).scalar() or 'America/New_York'
        clock = Clock(tz_name)
        pid = args.patient_id
        print(f"Seeding patient {pid} in account {account_id} ({tz_name}); today = {clock.today}")

        wipe(db, pid)
        ensure_patient(db, pid, account_id)
        users = ensure_users(api, db, pid, account_id, args.demo_password)
        businesses = {
            'neuro': ensure_business(api, 'Northgate Neurology Associates', ['clinic'],
                                     phone='(555) 014-2200', city='Dayton', state='OH'),
            'hospital': ensure_business(api, 'Riverside Medical Center', ['hospital'],
                                        phone='(555) 014-3000', city='Dayton', state='OH'),
            'pharmacy': ensure_business(api, 'Riverside Pharmacy', ['pharmacy'],
                                        phone='(555) 014-7700', city='Dayton', state='OH'),
            'dme': ensure_business(api, 'Lakeside Medical Supply', ['dme_supplier'],
                                   phone='(555) 014-9090', website='https://example.com'),
        }
        prov = seed_care_team(api, pid, businesses)
        seed_diagnoses(api, pid, prov)
        seed_implants(api, pid, prov, clock)
        print(f"  medication logs: {seed_medications(api, db, pid, prov, businesses['pharmacy'], users, clock, args.days)}")
        print(f"  care task logs:  {seed_care_tasks(api, db, pid, users, clock, args.days)}")
        print(f"  nutrition rows:  {seed_nutrition(api, pid, users, clock, args.days)}")
        print(f"  supplies:        {seed_equipment(api, db, pid, users, businesses, clock, args.days)}")
        seed_symptoms(api, pid, clock)
        seed_ranges(api, pid)
        print(f"  manual vitals:   {seed_manual_vitals(api, pid, clock, args.days)}")
        print(f"  alerts:          {seed_pulse_ox(db, pid, account_id, clock, args.pulse_days)}")
        print(f"  room samples:    {seed_room_environment(db, account_id, clock, args.pulse_days)}")
        seed_messages(api, pid, clock)
        print("done")
    finally:
        db.close()


if __name__ == '__main__':
    main()
