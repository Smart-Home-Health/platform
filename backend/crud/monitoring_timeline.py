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
"""Read the clinical streams used by the monitoring and diary day views."""
from datetime import timezone
from sqlalchemy.orm import contains_eager

from schemas.pulse_ox_data import PulseOxData
from schemas.vital import Vital
from schemas.medication_log import MedicationLog
from schemas.medication import Medication
from schemas.care_task_log import CareTaskLog
from schemas.nutrition_intake import NutritionIntake
from schemas.nutrition_output import NutritionOutput
from schemas.monitoring_alert import MonitoringAlert


def pulse_minutes(db, patient_id, start_dt, end_dt):
    readings = db.query(PulseOxData.timestamp, PulseOxData.spo2, PulseOxData.bpm, PulseOxData.pa).filter(
        PulseOxData.patient_id == patient_id, PulseOxData.timestamp >= start_dt, PulseOxData.timestamp < end_dt
    ).order_by(PulseOxData.timestamp)
    minutes = {}
    for timestamp, spo2, bpm, perfusion in readings.yield_per(2048):
        # The probe emits this tuple while disconnected, including the zero PA.
        if (spo2, bpm, perfusion) == (-1, -1, 0):
            continue
        stamp = timestamp.astimezone(timezone.utc)
        minute = stamp.replace(second=0, microsecond=0)
        offset = stamp.second * 1000 + stamp.microsecond / 1000
        for signal, value in (('spo2', spo2), ('bpm', bpm), ('perfusion', perfusion)):
            if value is None or value == -1:
                continue
            bucket = minutes.setdefault(minute, {})
            if signal not in bucket:
                bucket[signal] = {'total': 0, 'count': 0, 'first': offset}
            sample = bucket[signal]
            sample['total'] += value
            sample['count'] += 1
            sample['last'] = offset

    rows = []
    for minute, bucket in minutes.items():
        row = {'ts': minute.isoformat(), 'sample_offsets_ms': {}}
        for signal, precision in (('spo2', 1), ('bpm', 1), ('perfusion', 2)):
            sample = bucket.get(signal)
            row[signal] = round(sample['total'] / sample['count'], precision) if sample else None
            if sample:
                # Minute averages alone lose disconnects between adjacent buckets.
                row['sample_offsets_ms'][signal] = [sample['first'], sample['last']]
        rows.append(row)
    return rows


def medications(db, patient_id, start_dt, end_dt):
    med_logs = db.query(MedicationLog).join(Medication).filter(
        MedicationLog.patient_id == patient_id,
        MedicationLog.administered_at >= start_dt,
        MedicationLog.administered_at < end_dt
    ).order_by(MedicationLog.administered_at.asc()).all()
    return [{
        'ts': m.administered_at.isoformat() if m.administered_at else None,
        'name': m.medication.name if m.medication else 'Unknown',
        'dose': f"{m.dose_amount} {m.medication.quantity_unit}" if m.medication else str(m.dose_amount or ''),
        'status': 'skipped' if m.dose_amount == 0 else ('late' if m.administered_late else 'on-time'),
        'notes': m.notes or ''
    } for m in med_logs]


def care_task_logs(db, patient_id, start_dt, end_dt):
    return db.query(CareTaskLog).join(CareTaskLog.care_task).options(contains_eager(CareTaskLog.care_task)).filter(
        CareTaskLog.patient_id == patient_id,
        CareTaskLog.voided_at.is_(None),
        CareTaskLog.completed_at >= start_dt,
        CareTaskLog.completed_at < end_dt,
    )


def care_tasks(db, patient_id, start_dt, end_dt):
    logs = care_task_logs(db, patient_id, start_dt, end_dt).order_by(CareTaskLog.completed_at, CareTaskLog.id)
    return [{
        'ts': t.completed_at.isoformat() if t.completed_at else None,
        'name': t.care_task.name if t.care_task else 'Unknown',
        'category': t.care_task.category.name if t.care_task and t.care_task.category else '',
        'status': t.status,
        'notes': t.notes or ''
    } for t in logs]


def nutrition_intake(db, patient_id, start_dt, end_dt):
    intake_records = db.query(NutritionIntake).filter(
        NutritionIntake.patient_id == patient_id,
        NutritionIntake.consumed_at >= start_dt,
        NutritionIntake.consumed_at < end_dt
    ).order_by(NutritionIntake.consumed_at.asc()).all()
    return [{
        'ts': r.consumed_at.isoformat() if r.consumed_at else None,
        'item_name': r.item_name,
        'item_type': r.item_type,
        'amount': r.amount,
        'amount_unit': r.amount_unit,
        'calories': r.calories
    } for r in intake_records if r.consumed_at]


def nutrition_output(db, patient_id, start_dt, end_dt):
    output_records = db.query(NutritionOutput).filter(
        NutritionOutput.patient_id == patient_id,
        NutritionOutput.occurred_at >= start_dt,
        NutritionOutput.occurred_at < end_dt
    ).order_by(NutritionOutput.occurred_at.asc()).all()
    return [{
        'ts': r.occurred_at.isoformat() if r.occurred_at else None,
        'output_type': r.output_type,
        'is_diaper': r.is_diaper,
        'diaper_wetness': r.diaper_wetness,
        'diaper_soiled': r.diaper_soiled,
        'consistency': r.consistency,
        'color': r.color,
        'amount': r.amount,
        'notes': r.notes
    } for r in output_records if r.occurred_at]


def vitals(db, patient_id, start_dt, end_dt):
    vitals_query = db.query(Vital).filter(
        Vital.patient_id == patient_id,
        Vital.timestamp >= start_dt,
        Vital.timestamp < end_dt
    ).order_by(Vital.timestamp.asc()).all()

    return [{
        'ts': v.timestamp.isoformat(),
        'vital_type': v.vital_type,
        'vital_group': v.vital_group,
        'value': v.value,
        'unit': v.unit,
        'notes': v.notes
    } for v in vitals_query]


def alerts(db, patient_id, start_dt, end_dt):
    alert_rows = db.query(MonitoringAlert).filter(
        MonitoringAlert.patient_id == patient_id,
        MonitoringAlert.start_time >= start_dt,
        MonitoringAlert.start_time < end_dt
    ).order_by(MonitoringAlert.start_time.asc()).all()
    return [{
        'id': a.id,
        'start': a.start_time.isoformat() if a.start_time else None,
        # Null end means still open. Never synthesise one — a fabricated
        # end becomes a fabricated duration downstream.
        'end': a.end_time.isoformat() if a.end_time else None,
        'spo2_alarm': bool(a.spo2_alarm_triggered),
        'hr_alarm': bool(a.hr_alarm_triggered),
        'spo2_min': a.spo2_min,
        'bpm_min': a.bpm_min,
        'oxygen_used': bool(a.oxygen_used),
        'acknowledged': bool(a.acknowledged),
    } for a in alert_rows]


DAY_STREAMS = {
    'pulse_ox': pulse_minutes, 'medications': medications, 'care_tasks': care_tasks,
    'nutrition_intake': nutrition_intake, 'nutrition_output': nutrition_output,
    'vitals': vitals, 'alerts': alerts,
}


def day_streams(db, patient_id, start_dt, end_dt, sources=None):
    return {
        name: read(db, patient_id, start_dt, end_dt) if sources is None or name in sources else []
        for name, read in DAY_STREAMS.items()
    }
