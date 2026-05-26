from sqlalchemy import (
    Column, Integer, String, ForeignKey, JSON
)
from sqlalchemy.orm import relationship
from schemas import Base


class VentDeviceInfo(Base):
    """
    One row per vent import: device-level metadata extracted from the export
    (deviceconfig key=value pairs, counters.dat session counts, firmware, etc.).
    """
    __tablename__ = 'vent_device_info'

    id = Column(Integer, primary_key=True, autoincrement=True)
    import_id = Column(
        String(36), ForeignKey('vent_imports.id', ondelete='CASCADE'),
        nullable=False, unique=True,
    )

    vendor = Column(String(50), nullable=False)
    model = Column(String(100), nullable=True)
    serial = Column(String(100), nullable=True)
    firmware = Column(String(100), nullable=True)
    language = Column(String(50), nullable=True)

    # Everything else (leftover deviceconfig keys + parsed counters.dat).
    extra = Column(JSON, nullable=True)

    import_ = relationship('VentImport', back_populates='device_info')
