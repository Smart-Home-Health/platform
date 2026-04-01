from sqlalchemy import Column, Integer, String, Text, Boolean, DateTime, TIMESTAMP, ForeignKey, Enum as SQLEnum
from sqlalchemy.orm import relationship
from schemas import Base
import enum


class AccessLevel(enum.Enum):
    """Access level for patient access grants"""
    OWNER = "owner"          # Full control, can transfer ownership
    ADMIN = "admin"          # Full access, can grant/revoke access to others
    CAREGIVER = "caregiver"  # Can record vitals, medications, care tasks
    VIEWER = "viewer"        # Read-only access


class Patient(Base):
    __tablename__ = 'patients'
    id = Column(Integer, primary_key=True, autoincrement=True)
    account_id = Column(Integer, ForeignKey('accounts.id', ondelete='CASCADE'), nullable=True, index=True)  # Account this patient belongs to
    first_name = Column(String, nullable=False)
    last_name = Column(String, nullable=False)
    date_of_birth = Column(DateTime, nullable=True)
    medical_record_number = Column(String, nullable=True, unique=True)
    is_active = Column(Boolean, default=True, nullable=False)
    notes = Column(Text, nullable=True)
    created_at = Column(TIMESTAMP(timezone=True), nullable=False)
    updated_at = Column(TIMESTAMP(timezone=True), nullable=False)
    
    # Ownership and organization fields
    owner_user_id = Column(Integer, ForeignKey('users.id', ondelete='SET NULL'), nullable=True)
    creating_org_id = Column(Integer, ForeignKey('organizations.id', ondelete='SET NULL'), nullable=True)
    claimed_at = Column(DateTime, nullable=True)  # When patient claimed ownership from org
    
    # Relationships
    vitals = relationship('Vital', back_populates='patient')
    pulse_ox_data = relationship('PulseOxData', back_populates='patient')
    monitoring_alerts = relationship('MonitoringAlert', back_populates='patient')
    ventilator_alerts = relationship('VentilatorAlert', back_populates='patient')
    medication_logs = relationship('MedicationLog', back_populates='patient')
    care_task_logs = relationship('CareTaskLog', back_populates='patient')
    equipment = relationship('Equipment', back_populates='patient')
    nutrition_intake = relationship('NutritionIntake', back_populates='patient')
    providers = relationship('Provider', back_populates='patient')
    symptoms = relationship('Symptom', back_populates='patient')
    diagnoses = relationship('Diagnosis', back_populates='patient', cascade='all, delete-orphan')
    implants = relationship('Implant', back_populates='patient', cascade='all, delete-orphan')
    access_grants = relationship('PatientAccess', back_populates='patient', cascade='all, delete-orphan')
    owner = relationship('User', foreign_keys=[owner_user_id])
    creating_org = relationship('Organization', foreign_keys=[creating_org_id])
    integrations = relationship('PatientIntegration', back_populates='patient', cascade='all, delete-orphan')


class PatientAccess(Base):
    """Grant access to a patient for a user or organization"""
    __tablename__ = 'patient_access'
    
    id = Column(Integer, primary_key=True, index=True)
    patient_id = Column(Integer, ForeignKey('patients.id', ondelete='CASCADE'), nullable=False, index=True)
    
    # Either user_id or organization_id should be set, not both
    user_id = Column(Integer, ForeignKey('users.id', ondelete='CASCADE'), nullable=True, index=True)
    organization_id = Column(Integer, ForeignKey('organizations.id', ondelete='CASCADE'), nullable=True, index=True)
    
    access_level = Column(SQLEnum(AccessLevel), default=AccessLevel.VIEWER, nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)
    
    # Who granted this access
    granted_by_user_id = Column(Integer, ForeignKey('users.id', ondelete='SET NULL'), nullable=True)
    granted_by_org_id = Column(Integer, ForeignKey('organizations.id', ondelete='SET NULL'), nullable=True)
    
    granted_at = Column(DateTime, nullable=False)
    expires_at = Column(DateTime, nullable=True)  # Optional expiration
    notes = Column(Text, nullable=True)
    
    # Relationships
    patient = relationship('Patient', back_populates='access_grants')
    user = relationship('User', foreign_keys=[user_id])
    organization = relationship('Organization', foreign_keys=[organization_id])
    granted_by_user = relationship('User', foreign_keys=[granted_by_user_id])
    granted_by_org = relationship('Organization', foreign_keys=[granted_by_org_id])
