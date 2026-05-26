from sqlalchemy import (
    Column, Integer, String, Text, TIMESTAMP, JSON, Numeric, UniqueConstraint
)
from sqlalchemy.sql import func
from schemas import Base


class VentParameterDictionary(Base):
    """
    Vendor-supplied parameter metadata (label, units, scale factor, enum value
    maps). Loaded from the vendor's metadata file once per import; rows are
    upserted on (vendor, parameter_key).

    For VOCSN this is sourced from TrendMetaData.json — ~528 entries.
    """
    __tablename__ = 'vent_parameter_dictionary'

    id = Column(Integer, primary_key=True, autoincrement=True)
    vendor = Column(String(50), nullable=False, index=True)
    parameter_key = Column(String(100), nullable=False)   # the vendor's KeyID

    display_label = Column(Text, nullable=False)
    display_type = Column(String(50), nullable=True)      # NumericMonitor, EnumeratedSetting, ...
    display_units = Column(String(50), nullable=True)
    scale_factor = Column(Numeric, nullable=True)
    precision = Column(Integer, nullable=True)
    tag_name = Column(Text, nullable=True)
    grouping = Column(String(50), nullable=True, index=True)

    # For enum types: {raw_value: display_label}
    enum_values = Column(JSON, nullable=True)

    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(
        TIMESTAMP(timezone=True),
        server_default=func.now(), onupdate=func.now(), nullable=False,
    )

    __table_args__ = (
        UniqueConstraint('vendor', 'parameter_key', name='uq_vent_param_vendor_key'),
    )
