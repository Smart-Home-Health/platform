from sqlalchemy import (
    Column, Integer, String, Text, ForeignKey, TIMESTAMP, JSON, BigInteger
)
from sqlalchemy.orm import relationship
from schemas import Base


class VentImport(Base):
    """
    One row per uploaded ventilator log archive (tar/tar.gz).

    Replaces the previous on-disk meta.json. The archive itself still lives
    on disk at storage_path so the parser can be re-run.
    """
    __tablename__ = 'vent_imports'

    # UUID hex string — matches the directory name under /app/data/vent_imports/
    id = Column(String(36), primary_key=True)

    patient_id = Column(
        Integer, ForeignKey('patients.id', ondelete='CASCADE'),
        nullable=False, index=True,
    )
    integration_id = Column(
        Integer, ForeignKey('patient_integrations.id', ondelete='CASCADE'),
        nullable=False, index=True,
    )

    vendor = Column(String(50), nullable=False)       # e.g. "vocsn"
    model = Column(String(100), nullable=True)        # e.g. "V.HOME"
    device_serial = Column(String(100), nullable=True)

    file_name = Column(Text, nullable=False)          # original upload filename
    file_size_bytes = Column(BigInteger, nullable=True)
    storage_path = Column(Text, nullable=False)       # absolute path on disk

    # queued | extracting | parsing | completed | failed
    status = Column(String(20), nullable=False, default='queued', index=True)
    error = Column(Text, nullable=True)

    uploaded_at = Column(TIMESTAMP(timezone=True), nullable=False)
    uploaded_by = Column(
        Integer, ForeignKey('users.id', ondelete='SET NULL'), nullable=True,
    )
    parsed_at = Column(TIMESTAMP(timezone=True), nullable=True)

    # Parser-specific counts, file inventory sample, etc.
    parser_summary = Column(JSON, nullable=True)

    # Relationships
    samples = relationship(
        'VentSample', back_populates='import_', cascade='all, delete-orphan',
        passive_deletes=True,
    )
    device_info = relationship(
        'VentDeviceInfo', back_populates='import_', cascade='all, delete-orphan',
        uselist=False, passive_deletes=True,
    )
