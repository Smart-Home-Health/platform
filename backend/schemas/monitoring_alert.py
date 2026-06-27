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
from sqlalchemy import Column, Integer, String, Float, ForeignKey, Boolean, TIMESTAMP
from sqlalchemy.orm import relationship
from schemas import Base


class MonitoringAlert(Base):
    __tablename__ = 'monitoring_alerts'
    id = Column(Integer, primary_key=True, autoincrement=True)
    account_id = Column(Integer, ForeignKey('accounts.id', ondelete='CASCADE'), nullable=True, index=True)  # Account this alert belongs to
    patient_id = Column(Integer, ForeignKey('patients.id'), nullable=False)
    start_time = Column(TIMESTAMP(timezone=True), nullable=False)
    end_time = Column(TIMESTAMP(timezone=True))
    start_data_id = Column(Integer)
    end_data_id = Column(Integer)
    acknowledged = Column(Boolean, default=False)
    spo2_min = Column(Integer)
    bpm_min = Column(Integer)
    spo2_max = Column(Integer)
    bpm_max = Column(Integer)
    spo2_alarm_triggered = Column(Boolean, default=False)
    hr_alarm_triggered = Column(Boolean, default=False)
    external_alarm_triggered = Column(Boolean, default=False)
    oxygen_used = Column(Boolean, default=False)
    oxygen_highest = Column(Float)
    oxygen_unit = Column(String)
    created_at = Column(TIMESTAMP(timezone=True), nullable=False)
    
    # Relationships
    patient = relationship('Patient', back_populates='monitoring_alerts')
