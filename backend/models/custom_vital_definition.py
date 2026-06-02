from datetime import datetime
from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, VARCHAR
from sqlalchemy.orm import relationship
from db import Base


class CustomVitalDefinition(Base):
    __tablename__ = 'custom_vital_definitions'

    id = Column(Integer, primary_key=True, autoincrement=True)
    patient_id = Column(Integer, ForeignKey('patients.id', ondelete='CASCADE'), nullable=False, index=True)
    name = Column(String, nullable=False)
    unit = Column(VARCHAR(20), nullable=True)
    display_label = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    patient = relationship('Patient', backref='custom_vital_definitions')

    def to_dict(self):
        return {
            'id': self.id,
            'patient_id': self.patient_id,
            'name': self.name,
            'unit': self.unit,
            'display_label': self.display_label or self.name.replace('_', ' ').title(),
            'created_at': self.created_at.isoformat() if self.created_at else None,
        }
