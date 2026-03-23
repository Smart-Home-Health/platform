"""
Diagnosis SQLAlchemy ORM model
"""
from sqlalchemy import Column, Integer, String, Text, Boolean, Date, TIMESTAMP, ForeignKey
from sqlalchemy.orm import relationship
from schemas import Base


class Diagnosis(Base):
    """Track patient diagnoses with optional physician associations"""
    __tablename__ = 'diagnoses'
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    account_id = Column(Integer, ForeignKey('accounts.id', ondelete='CASCADE'), nullable=True, index=True)  # Account this diagnosis belongs to
    patient_id = Column(Integer, ForeignKey('patients.id'), nullable=False)
    
    # Core diagnosis info
    name = Column(String(255), nullable=False)  # Primary diagnosis name
    icd10_code = Column(String(20), nullable=True)  # ICD-10 code (optional)
    icd10_description = Column(String(500), nullable=True)  # Official ICD-10 description
    
    # Classification
    diagnosis_type = Column(String(50), nullable=False, default='primary')  # primary, secondary, comorbidity, differential
    category = Column(String(100), nullable=True)  # e.g., cardiovascular, respiratory, neurological
    severity = Column(String(50), nullable=True)  # mild, moderate, severe, critical
    status = Column(String(50), nullable=False, default='active')  # active, resolved, chronic, in_remission, ruled_out
    
    # Dates
    onset_date = Column(Date, nullable=True)  # When symptoms/condition began
    diagnosis_date = Column(Date, nullable=True)  # When formally diagnosed
    resolved_date = Column(Date, nullable=True)  # When resolved (if applicable)
    
    # Physician associations (both optional)
    diagnosing_provider_id = Column(Integer, ForeignKey('providers.id'), nullable=True)
    managing_provider_id = Column(Integer, ForeignKey('providers.id'), nullable=True)
    
    # Additional details
    notes = Column(Text, nullable=True)  # Clinical notes
    treatment_plan = Column(Text, nullable=True)  # Brief treatment approach
    is_primary_diagnosis = Column(Boolean, default=False)  # Flag for main/principal diagnosis
    
    # Status
    active = Column(Boolean, default=True, nullable=False)
    
    # Metadata
    created_at = Column(TIMESTAMP(timezone=True), nullable=False)
    updated_at = Column(TIMESTAMP(timezone=True), nullable=False)
    created_by = Column(Integer, ForeignKey('users.id'), nullable=True)
    
    # Relationships
    patient = relationship('Patient', back_populates='diagnoses')
    diagnosing_provider = relationship('Provider', foreign_keys=[diagnosing_provider_id])
    managing_provider = relationship('Provider', foreign_keys=[managing_provider_id])
    created_by_user = relationship('User', foreign_keys=[created_by])
    follow_up_notes = relationship('DiagnosisNote', back_populates='diagnosis', cascade='all, delete-orphan', order_by='DiagnosisNote.created_at.desc()')


class DiagnosisNote(Base):
    """Track follow-up notes for a diagnosis over time"""
    __tablename__ = 'diagnosis_notes'
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    diagnosis_id = Column(Integer, ForeignKey('diagnoses.id'), nullable=False)
    
    # Note content
    note_type = Column(String(50), nullable=False, default='follow_up')  # follow_up, status_change, treatment_update, provider_note
    content = Column(Text, nullable=False)
    
    # Optional provider association
    provider_id = Column(Integer, ForeignKey('providers.id'), nullable=True)
    
    # Metadata
    created_at = Column(TIMESTAMP(timezone=True), nullable=False)
    created_by = Column(Integer, ForeignKey('users.id'), nullable=True)
    
    # Relationships
    diagnosis = relationship('Diagnosis', back_populates='follow_up_notes')
    provider = relationship('Provider', foreign_keys=[provider_id])
    created_by_user = relationship('User', foreign_keys=[created_by])
