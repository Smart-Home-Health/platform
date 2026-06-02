from sqlalchemy import Column, Integer, String, Float, Text, ForeignKey, Boolean, TIMESTAMP
from sqlalchemy.orm import relationship
from schemas import Base


class Medication(Base):
    __tablename__ = 'medication'
    id = Column(Integer, primary_key=True, autoincrement=True)
    account_id = Column(Integer, ForeignKey('accounts.id', ondelete='CASCADE'), nullable=True, index=True)  # Account this medication belongs to
    patient_id = Column(Integer, ForeignKey('patients.id'), nullable=True)  # NULL = global medication
    prescriber_id = Column(Integer, ForeignKey('providers.id'), nullable=True)  # Provider who prescribed this medication
    pharmacy_id = Column(Integer, ForeignKey('businesses.id'), nullable=True)  # Pharmacy business where medication is filled
    name = Column(String, nullable=False)
    rxnorm_code = Column(String(20), nullable=True)  # RxNorm RxCUI (standard drug code, FHIR Medication.code)
    ndc_code = Column(String(20), nullable=True)  # National Drug Code (commonly returned alongside RxNorm)
    concentration = Column(String)
    quantity = Column(Float, nullable=False)
    quantity_unit = Column(String, nullable=False, default='tablets')
    instructions = Column(Text)
    start_date = Column(TIMESTAMP(timezone=True), nullable=True)
    end_date = Column(TIMESTAMP(timezone=True), nullable=True)
    as_needed = Column(Boolean, default=False)
    notes = Column(Text)
    active = Column(Boolean, default=True)
    source = Column(String(50), nullable=True, default='manual')  # manual, epic, etc.
    external_id = Column(String(100), nullable=True, index=True)  # FHIR resource id for dedup
    created_at = Column(TIMESTAMP(timezone=True), nullable=False)
    updated_at = Column(TIMESTAMP(timezone=True), nullable=False)
    
    # Relationships
    patient = relationship('Patient', foreign_keys=[patient_id])
    prescriber = relationship('Provider', foreign_keys=[prescriber_id])
    pharmacy = relationship('Business', foreign_keys=[pharmacy_id])
    schedules = relationship('MedicationSchedule', back_populates='medication', cascade='all, delete-orphan')
    administration_logs = relationship('MedicationLog', back_populates='medication', cascade='all, delete-orphan')
