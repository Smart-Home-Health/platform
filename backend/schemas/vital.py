from sqlalchemy import Column, Integer, String, Float, Text, ForeignKey, TIMESTAMP, JSON
from sqlalchemy.orm import relationship
from schemas import Base


class Vital(Base):
    __tablename__ = 'vitals'
    id = Column(Integer, primary_key=True, autoincrement=True)
    account_id = Column(Integer, ForeignKey('accounts.id', ondelete='CASCADE'), nullable=True, index=True)
    patient_id = Column(Integer, ForeignKey('patients.id'), nullable=False)
    timestamp = Column(TIMESTAMP(timezone=True), nullable=False)
    vital_type = Column(String, nullable=False)  # e.g., "heart_rate", "blood_pressure", "weight", "spo2"
    vital_group = Column(String, nullable=True)  # Sub-type (e.g., 'systolic', 'diastolic', 'map' for BP)
    value = Column(Float, nullable=False)
    unit = Column(String(20), nullable=True)  # Measurement unit: bpm, mmHg, %, °F, °C, kg, lbs, etc.
    source = Column(String(50), nullable=True, default='manual')  # Integration source: manual, withings, ihealth, shh_serial
    device_id = Column(String(100), nullable=True)  # External device identifier from integration
    external_id = Column(String(100), nullable=True, index=True)  # Vendor's unique measurement ID for deduplication
    raw_data = Column(JSON, nullable=True)  # Original payload from integration for debugging
    notes = Column(Text)
    created_at = Column(TIMESTAMP(timezone=True), nullable=False)
    
    # Relationships
    patient = relationship('Patient', back_populates='vitals')
