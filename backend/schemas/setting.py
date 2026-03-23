from sqlalchemy import Column, Integer, String, Text, TIMESTAMP, ForeignKey
from schemas import Base


class Setting(Base):
    __tablename__ = 'settings'
    id = Column(Integer, primary_key=True, autoincrement=True)
    account_id = Column(Integer, ForeignKey('accounts.id', ondelete='CASCADE'), nullable=True, index=True)  # Account this setting belongs to (NULL = global)
    key = Column(String, nullable=False, index=True)
    value = Column(Text, nullable=False)
    data_type = Column(String, nullable=False)
    description = Column(Text)
    updated_at = Column(TIMESTAMP(timezone=True), nullable=False)
