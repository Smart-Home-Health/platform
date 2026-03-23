from sqlalchemy import Column, Integer, String, Float, Text, ForeignKey, Boolean, TIMESTAMP
from sqlalchemy.orm import relationship
from schemas import Base


class MedicationSchedule(Base):
    __tablename__ = 'medication_schedule'
    id = Column(Integer, primary_key=True, autoincrement=True)
    medication_id = Column(Integer, ForeignKey('medication.id'), nullable=False)
    patient_id = Column(Integer, ForeignKey('patients.id'), nullable=True)  # Can be NULL for global meds
    
    # Cron expression for scheduling (e.g., "30 8 * * 1,3,5" for Mon/Wed/Fri at 8:30 AM)
    cron_expression = Column(String, nullable=False)
    
    # Human-readable description of the schedule (optional, for display purposes)
    description = Column(String, nullable=True)
    
    # Dose information for this specific schedule
    dose_amount = Column(Float, nullable=True)  # Amount per dose (e.g., 1, 0.5, 2) - unit inherited from medication
    
    # Active indicator - allows users to temporarily disable schedules (DB column: is_active from 001)
    active = Column('is_active', Boolean, default=True, nullable=False)
    
    # Optional notes for this specific schedule
    notes = Column(Text, nullable=True)
    
    # Timestamps
    created_at = Column(TIMESTAMP(timezone=True), nullable=False)
    updated_at = Column(TIMESTAMP(timezone=True), nullable=False)
    
    # Relationships
    medication = relationship('Medication', back_populates='schedules')
    patient = relationship('Patient', foreign_keys=[patient_id])
    administration_logs = relationship('MedicationLog', back_populates='schedule')
