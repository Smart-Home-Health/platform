from sqlalchemy import Column, Integer, Float, Text, ForeignKey, Boolean, TIMESTAMP, String
from sqlalchemy.orm import relationship
from schemas import Base


class MedicationLog(Base):
    __tablename__ = 'medication_log'
    id = Column(Integer, primary_key=True, autoincrement=True)
    medication_id = Column(Integer, ForeignKey('medication.id'), nullable=False)
    patient_id = Column(Integer, ForeignKey('patients.id'), nullable=False)  # Always required for logs
    schedule_id = Column(Integer, ForeignKey('medication_schedule.id'), nullable=True)  # Null if administered without schedule
    
    # Administration details
    administered_at = Column(TIMESTAMP(timezone=True), nullable=False)
    dose_amount = Column(Float, nullable=False)  # Amount actually given - unit inherited from medication
    
    # Schedule tracking (only relevant if schedule_id is not null)
    is_scheduled = Column(Boolean, default=False, nullable=False)  # True if this was a scheduled dose
    scheduled_time = Column(TIMESTAMP(timezone=True), nullable=True)  # The originally scheduled time for this dose
    administered_early = Column(Boolean, default=False, nullable=False)  # True if given before scheduled time
    administered_late = Column(Boolean, default=False, nullable=False)   # True if given after scheduled time
    
    # Optional details
    notes = Column(Text, nullable=True)  # Any notes about this administration
    administered_by = Column(Integer, ForeignKey('users.id', ondelete='SET NULL'), nullable=True)  # User who administered it
    
    # Timestamps
    created_at = Column(TIMESTAMP(timezone=True), nullable=False)
    
    # Relationships
    medication = relationship('Medication', back_populates='administration_logs')
    patient = relationship('Patient', back_populates='medication_logs')
    schedule = relationship('MedicationSchedule', back_populates='administration_logs')
    # User relationship defined in models/users.py to avoid circular imports
    # administered_by_user = relationship('User', back_populates='medication_logs', foreign_keys=[administered_by])
