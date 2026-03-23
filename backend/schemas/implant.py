"""
Implant SQLAlchemy ORM model
Track medical implants, cosmetic implants, body modifications, piercings, etc.
"""
from sqlalchemy import Column, Integer, String, Text, Boolean, Date, TIMESTAMP, ForeignKey
from sqlalchemy.orm import relationship
from schemas import Base


class Implant(Base):
    """Track patient implants and body modifications with provider associations"""
    __tablename__ = 'implants'
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    account_id = Column(Integer, ForeignKey('accounts.id', ondelete='CASCADE'), nullable=True, index=True)  # Account this implant belongs to
    patient_id = Column(Integer, ForeignKey('patients.id'), nullable=False)
    
    # Core implant info
    name = Column(String(255), nullable=False)  # Primary name (e.g., "Tracheostomy Tube", "VP Shunt", "Breast Implant")
    description = Column(Text, nullable=True)  # Detailed description
    
    # Classification
    implant_type = Column(String(50), nullable=False, default='medical')  # medical, cosmetic, body_modification, piercing, other
    category = Column(String(100), nullable=True)  # e.g., respiratory, neurological, cardiac, aesthetic, jewelry
    subcategory = Column(String(100), nullable=True)  # e.g., tracheostomy, shunt, pacemaker, breast, ear, tongue
    
    # Location
    body_location = Column(String(100), nullable=False)  # Where on the body (e.g., "neck", "head/brain", "chest", "left ear lobe")
    body_side = Column(String(20), nullable=True)  # left, right, bilateral, midline, n/a
    
    # Device/Product details (for medical/cosmetic)
    manufacturer = Column(String(255), nullable=True)  # Manufacturer name
    model = Column(String(255), nullable=True)  # Model/product name
    serial_number = Column(String(255), nullable=True)  # Serial/lot number
    size = Column(String(100), nullable=True)  # Size specification (e.g., "6.0 cuffed", "400cc", "14g")
    material = Column(String(100), nullable=True)  # Material (e.g., "silicone", "titanium", "surgical steel")
    
    # Dates
    implant_date = Column(Date, nullable=True)  # When implanted/placed
    last_change_date = Column(Date, nullable=True)  # Last time changed/replaced (for things like trach tubes)
    next_change_date = Column(Date, nullable=True)  # Scheduled next change
    removal_date = Column(Date, nullable=True)  # If removed
    expiration_date = Column(Date, nullable=True)  # If device has expiration (e.g., pacemaker battery)
    
    # Provider associations
    implanting_provider_id = Column(Integer, ForeignKey('providers.id'), nullable=True)  # Who placed it
    managing_provider_id = Column(Integer, ForeignKey('providers.id'), nullable=True)  # Who manages ongoing care
    
    # Facility where implanted
    facility_name = Column(String(255), nullable=True)  # Hospital/clinic name
    facility_location = Column(String(255), nullable=True)  # City, State or address
    
    # Status
    status = Column(String(50), nullable=False, default='active')  # active, removed, replaced, failed, pending
    
    # Clinical notes
    notes = Column(Text, nullable=True)  # General notes
    care_instructions = Column(Text, nullable=True)  # Care/maintenance instructions
    complications = Column(Text, nullable=True)  # Any complications history
    
    # For medical implants - MRI safety, etc.
    mri_safe = Column(String(50), nullable=True)  # safe, conditional, unsafe, unknown
    mri_notes = Column(Text, nullable=True)  # MRI-specific notes/conditions
    
    # Flags
    is_life_sustaining = Column(Boolean, default=False)  # Critical for life (trach, pacemaker, etc.)
    requires_regular_change = Column(Boolean, default=False)  # Needs periodic replacement
    change_frequency_days = Column(Integer, nullable=True)  # How often to change (in days)
    
    # Status
    active = Column(Boolean, default=True, nullable=False)
    
    # Metadata
    created_at = Column(TIMESTAMP(timezone=True), nullable=False)
    updated_at = Column(TIMESTAMP(timezone=True), nullable=False)
    created_by = Column(Integer, ForeignKey('users.id'), nullable=True)
    
    # Relationships
    patient = relationship('Patient', back_populates='implants')
    implanting_provider = relationship('Provider', foreign_keys=[implanting_provider_id])
    managing_provider = relationship('Provider', foreign_keys=[managing_provider_id])
    created_by_user = relationship('User', foreign_keys=[created_by])
    follow_up_notes = relationship('ImplantNote', back_populates='implant', cascade='all, delete-orphan', order_by='ImplantNote.created_at.desc()')


class ImplantNote(Base):
    """Track follow-up notes, changes, and updates for an implant"""
    __tablename__ = 'implant_notes'
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    implant_id = Column(Integer, ForeignKey('implants.id'), nullable=False)
    
    # Note content
    note_type = Column(String(50), nullable=False, default='follow_up')  # follow_up, change, complication, maintenance, status_change, provider_note
    content = Column(Text, nullable=False)
    
    # If this was a change/replacement
    was_changed = Column(Boolean, default=False)
    old_serial_number = Column(String(255), nullable=True)  # Previous serial if changed
    new_serial_number = Column(String(255), nullable=True)  # New serial if changed
    
    # Optional provider association
    provider_id = Column(Integer, ForeignKey('providers.id'), nullable=True)
    
    # Metadata
    created_at = Column(TIMESTAMP(timezone=True), nullable=False)
    created_by = Column(Integer, ForeignKey('users.id'), nullable=True)
    
    # Relationships
    implant = relationship('Implant', back_populates='follow_up_notes')
    provider = relationship('Provider', foreign_keys=[provider_id])
    created_by_user = relationship('User', foreign_keys=[created_by])
