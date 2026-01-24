from sqlalchemy import Column, Integer, String, Text, Boolean, DateTime, TIMESTAMP
from sqlalchemy.orm import relationship
from schemas import Base


class Patient(Base):
    __tablename__ = 'patients'
    id = Column(Integer, primary_key=True, autoincrement=True)
    first_name = Column(String, nullable=False)
    last_name = Column(String, nullable=False)
    date_of_birth = Column(DateTime, nullable=True)
    medical_record_number = Column(String, nullable=True, unique=True)
    is_active = Column(Boolean, default=True, nullable=False)
    notes = Column(Text, nullable=True)
    created_at = Column(TIMESTAMP(timezone=True), nullable=False)
    updated_at = Column(TIMESTAMP(timezone=True), nullable=False)
    
    # Relationships
    vitals = relationship('Vital', back_populates='patient')
    pulse_ox_data = relationship('PulseOxData', back_populates='patient')
    blood_pressure = relationship('BloodPressure', back_populates='patient')
    temperature = relationship('Temperature', back_populates='patient')
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
