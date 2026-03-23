from sqlalchemy import Column, Integer, String, Text, Boolean, TIMESTAMP, ForeignKey
from sqlalchemy.orm import relationship
from schemas import Base


class CareTaskCategory(Base):
    __tablename__ = 'care_task_category'
    id = Column(Integer, primary_key=True, autoincrement=True)
    account_id = Column(Integer, ForeignKey('accounts.id', ondelete='CASCADE'), nullable=True, index=True)  # Account this category belongs to
    name = Column(String, nullable=False, unique=True)
    description = Column(Text, nullable=True)
    color = Column(String, nullable=True)  # Hex color code for category display
    is_default = Column(Boolean, default=False, nullable=False)  # True for non-deletable default categories
    active = Column(Boolean, default=True, nullable=False)
    created_at = Column(TIMESTAMP(timezone=True), nullable=False)
    updated_at = Column(TIMESTAMP(timezone=True), nullable=False)
    
    # Relationships
    care_tasks = relationship('CareTask', back_populates='category')
