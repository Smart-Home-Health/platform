from sqlalchemy import Column, Integer, String, Boolean, Text, ForeignKey, TIMESTAMP, JSON
from sqlalchemy.orm import relationship
from schemas import Base


class Integration(Base):
    """
    Available integration definitions (Withings, iHealth, SHH Serial, etc.)
    These are system-wide, not patient-specific.
    """
    __tablename__ = 'integrations'
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(100), nullable=False)  # Display name: "Withings", "iHealth"
    slug = Column(String(50), nullable=False, unique=True)  # URL-safe identifier: "withings", "ihealth"
    description = Column(Text, nullable=True)
    auth_type = Column(String(20), nullable=False, default='oauth2')  # oauth2, api_key, local, none
    config_schema = Column(JSON, nullable=True)  # JSON Schema for configuration form
    supported_vitals = Column(JSON, nullable=True)  # List of vital types this integration provides
    is_active = Column(Boolean, default=True)
    created_at = Column(TIMESTAMP(timezone=True), nullable=False)
    updated_at = Column(TIMESTAMP(timezone=True), nullable=False)
    
    # Relationships
    patient_integrations = relationship('PatientIntegration', back_populates='integration')


class PatientIntegration(Base):
    """
    Patient-specific integration configuration.
    Each patient can have their own Withings account, iHealth devices, etc.
    """
    __tablename__ = 'patient_integrations'
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    account_id = Column(Integer, ForeignKey('accounts.id', ondelete='CASCADE'), nullable=False, index=True)
    patient_id = Column(Integer, ForeignKey('patients.id', ondelete='CASCADE'), nullable=False, index=True)
    integration_id = Column(Integer, ForeignKey('integrations.id', ondelete='CASCADE'), nullable=False)
    
    # Encrypted credentials stored as JSON (OAuth tokens, API keys, etc.)
    # Structure depends on auth_type: {access_token, refresh_token, expires_at} for OAuth2
    credentials = Column(JSON, nullable=True)
    
    # Integration-specific settings (polling interval, selected devices, etc.)
    settings = Column(JSON, nullable=True)
    
    is_enabled = Column(Boolean, default=True)
    last_sync_at = Column(TIMESTAMP(timezone=True), nullable=True)
    last_sync_status = Column(String(20), nullable=True)  # success, failed, pending
    last_sync_error = Column(Text, nullable=True)
    sync_count = Column(Integer, default=0)
    
    created_at = Column(TIMESTAMP(timezone=True), nullable=False)
    updated_at = Column(TIMESTAMP(timezone=True), nullable=False)
    
    # Relationships
    patient = relationship('Patient', back_populates='integrations')
    integration = relationship('Integration', back_populates='patient_integrations')
    devices = relationship('IntegrationDevice', back_populates='patient_integration', cascade='all, delete-orphan')


class IntegrationDevice(Base):
    """
    Devices discovered/registered for a patient's integration.
    E.g., Withings scale, BP monitor, sleep tracker.
    """
    __tablename__ = 'integration_devices'
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    patient_integration_id = Column(Integer, ForeignKey('patient_integrations.id', ondelete='CASCADE'), nullable=False, index=True)
    
    device_id = Column(String(100), nullable=False)  # Vendor's device identifier
    device_type = Column(String(50), nullable=False)  # scale, bp_monitor, pulse_ox, sleep_tracker, etc.
    device_name = Column(String(100), nullable=True)  # User-friendly name
    device_model = Column(String(100), nullable=True)  # Model number/name
    
    is_enabled = Column(Boolean, default=True)  # Allow disabling specific devices
    last_seen_at = Column(TIMESTAMP(timezone=True), nullable=True)
    extra_data = Column(JSON, nullable=True)  # Additional vendor-specific data
    
    created_at = Column(TIMESTAMP(timezone=True), nullable=False)
    updated_at = Column(TIMESTAMP(timezone=True), nullable=False)
    
    # Relationships
    patient_integration = relationship('PatientIntegration', back_populates='devices')
