from sqlalchemy import Column, Integer, String, Text, ForeignKey, Boolean, TIMESTAMP
from sqlalchemy.orm import relationship
from schemas import Base


class CareTaskSchedule(Base):
    __tablename__ = 'care_task_schedule'
    id = Column(Integer, primary_key=True, autoincrement=True)
    care_task_id = Column(Integer, ForeignKey('care_task.id'), nullable=False)
    patient_id = Column(Integer, ForeignKey('patients.id'), nullable=True)  # Can be NULL for global tasks
    
    # Cron expression for scheduling (e.g., "30 8 * * 1,3,5" for Mon/Wed/Fri at 8:30 AM)
    cron_expression = Column(String, nullable=False)
    
    # Human-readable description of the schedule (optional, for display purposes)
    description = Column(String, nullable=True)
    
    # Active indicator - allows users to temporarily disable schedules (DB column: is_active from 001)
    active = Column('is_active', Boolean, default=True, nullable=False)
    
    # Optional notes for this specific schedule
    notes = Column(Text, nullable=True)
    
    # Timestamps
    created_at = Column(TIMESTAMP(timezone=True), nullable=False)
    updated_at = Column(TIMESTAMP(timezone=True), nullable=False)
    
    # Relationships
    care_task = relationship('CareTask', back_populates='schedules')
    patient = relationship('Patient', foreign_keys=[patient_id])
    completion_logs = relationship('CareTaskLog', back_populates='schedule')
