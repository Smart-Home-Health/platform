from sqlalchemy import Column, Integer, String, Text, ForeignKey, Boolean, TIMESTAMP
from sqlalchemy.orm import relationship
from schemas import Base


class CareTask(Base):
    __tablename__ = 'care_task'
    id = Column(Integer, primary_key=True, autoincrement=True)
    account_id = Column(Integer, ForeignKey('accounts.id', ondelete='CASCADE'), nullable=True, index=True)  # Account this task belongs to
    patient_id = Column(Integer, ForeignKey('patients.id'), nullable=True)  # NULL = global task template
    name = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    category_id = Column(Integer, ForeignKey('care_task_category.id'), nullable=True)  # Reference to category
    active = Column('is_active', Boolean, default=True, nullable=False)
    created_at = Column(TIMESTAMP(timezone=True), nullable=False)
    updated_at = Column(TIMESTAMP(timezone=True), nullable=False)
    
    # Relationships
    patient = relationship('Patient', foreign_keys=[patient_id])
    category = relationship('CareTaskCategory', back_populates='care_tasks')
    schedules = relationship('CareTaskSchedule', back_populates='care_task', cascade='all, delete-orphan')
    completion_logs = relationship('CareTaskLog', back_populates='care_task', cascade='all, delete-orphan')
