"""
Reader model for SHH Reader device integration
"""

from datetime import datetime
from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey, Text
from sqlalchemy.orm import relationship
from db import Base


class Reader(Base):
    """
    Represents a connected SHH Reader device.
    
    Each reader can be associated with a patient and streams
    sensor data via encrypted WebSocket connection.
    """
    __tablename__ = 'readers'
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    
    # Identity
    name = Column(String(100), nullable=False)  # Device hostname or custom name
    ip_address = Column(String(45), nullable=True)  # IPv4 or IPv6
    port = Column(Integer, default=8080)  # API port (default 8080)
    
    # Association
    patient_id = Column(Integer, ForeignKey('patients.id'), nullable=True)
    
    # Security
    encryption_key = Column(Text, nullable=True)  # Fernet key (base64)
    
    # Status
    is_active = Column(Boolean, default=True)
    is_paired = Column(Boolean, default=False)
    paired_at = Column(DateTime, nullable=True)
    last_seen = Column(DateTime, nullable=True)
    last_data_at = Column(DateTime, nullable=True)
    
    # Metadata
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    patient = relationship("Patient", backref="readers")
    
    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'ip_address': self.ip_address,
            'port': self.port,
            'patient_id': self.patient_id,
            'patient_name': f"{self.patient.first_name} {self.patient.last_name}" if self.patient else None,
            'is_active': self.is_active,
            'is_paired': self.is_paired,
            'paired_at': self.paired_at.isoformat() if self.paired_at else None,
            'last_seen': self.last_seen.isoformat() if self.last_seen else None,
            'last_data_at': self.last_data_at.isoformat() if self.last_data_at else None,
            'created_at': self.created_at.isoformat() if self.created_at else None,
        }
