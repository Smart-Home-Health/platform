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
"""Resolve the stored schedule settings when a new schedule is created or edited."""
from schemas.patient import Patient


def new_reminder_window(db, patient_id, minutes):
    if minutes is not None or patient_id is None:
        return minutes
    return db.query(Patient.reminder_window_minutes).filter_by(id=patient_id).scalar()


def medication_window_fields(fields):
    """Either editor may update the medication window without leaving an obsolete override."""
    if 'reminder_window_minutes' in fields and fields['reminder_window_minutes'] is not None:
        fields['grace_period_hours'] = fields['reminder_window_minutes'] / 60
    elif 'grace_period_hours' in fields:
        fields['reminder_window_minutes'] = None
    elif 'reminder_window_minutes' in fields:
        fields['grace_period_hours'] = None
    return fields
