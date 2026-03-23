"""
CRUD operations for Implants
"""
from sqlalchemy.orm import Session
from sqlalchemy import and_
from datetime import datetime, timezone
from typing import List, Optional

from schemas.implant import Implant, ImplantNote


def get_implant(db: Session, implant_id: int) -> Optional[Implant]:
    """Get a single implant by ID"""
    return db.query(Implant).filter(Implant.id == implant_id).first()


def get_implants_by_patient(
    db: Session, 
    patient_id: int, 
    include_inactive: bool = False,
    implant_type: Optional[str] = None,
    status: Optional[str] = None
) -> List[Implant]:
    """Get all implants for a patient with optional filters"""
    query = db.query(Implant).filter(Implant.patient_id == patient_id)
    
    if not include_inactive:
        query = query.filter(Implant.active == True)
    
    if implant_type:
        query = query.filter(Implant.implant_type == implant_type)
    
    if status:
        query = query.filter(Implant.status == status)
    
    return query.order_by(Implant.is_life_sustaining.desc(), Implant.name).all()


def create_implant(db: Session, implant_data: dict, user_id: Optional[int] = None) -> Implant:
    """Create a new implant record"""
    now = datetime.now(timezone.utc)
    
    implant = Implant(
        **implant_data,
        created_at=now,
        updated_at=now,
        created_by=user_id
    )
    
    db.add(implant)
    db.commit()
    db.refresh(implant)
    return implant


def update_implant(db: Session, implant_id: int, update_data: dict) -> Optional[Implant]:
    """Update an existing implant"""
    implant = get_implant(db, implant_id)
    if not implant:
        return None
    
    update_data['updated_at'] = datetime.now(timezone.utc)
    
    for key, value in update_data.items():
        if hasattr(implant, key):
            setattr(implant, key, value)
    
    db.commit()
    db.refresh(implant)
    return implant


def delete_implant(db: Session, implant_id: int, soft_delete: bool = True) -> bool:
    """Delete an implant (soft delete by default)"""
    implant = get_implant(db, implant_id)
    if not implant:
        return False
    
    if soft_delete:
        implant.active = False
        implant.updated_at = datetime.now(timezone.utc)
        db.commit()
    else:
        db.delete(implant)
        db.commit()
    
    return True


# ============== Implant Notes ==============

def get_implant_notes(db: Session, implant_id: int) -> List[ImplantNote]:
    """Get all notes for an implant"""
    return db.query(ImplantNote).filter(
        ImplantNote.implant_id == implant_id
    ).order_by(ImplantNote.created_at.desc()).all()


def create_implant_note(
    db: Session, 
    implant_id: int, 
    note_data: dict, 
    user_id: Optional[int] = None
) -> ImplantNote:
    """Create a new note for an implant"""
    now = datetime.now(timezone.utc)
    
    note = ImplantNote(
        implant_id=implant_id,
        **note_data,
        created_at=now,
        created_by=user_id
    )
    
    db.add(note)
    
    # If this was a change, update the implant's last_change_date
    if note_data.get('was_changed') and note_data.get('new_serial_number'):
        implant = get_implant(db, implant_id)
        if implant:
            implant.last_change_date = now.date()
            implant.serial_number = note_data.get('new_serial_number')
            implant.updated_at = now
    
    db.commit()
    db.refresh(note)
    return note


def delete_implant_note(db: Session, note_id: int) -> bool:
    """Delete an implant note"""
    note = db.query(ImplantNote).filter(ImplantNote.id == note_id).first()
    if not note:
        return False
    
    db.delete(note)
    db.commit()
    return True


# ============== Helper Functions ==============

def format_implant_for_response(implant: Implant, include_notes: bool = False) -> dict:
    """Format an implant object for API response with provider names"""
    result = {
        'id': implant.id,
        'patient_id': implant.patient_id,
        'name': implant.name,
        'description': implant.description,
        'implant_type': implant.implant_type,
        'category': implant.category,
        'subcategory': implant.subcategory,
        'body_location': implant.body_location,
        'body_side': implant.body_side,
        'manufacturer': implant.manufacturer,
        'model': implant.model,
        'serial_number': implant.serial_number,
        'size': implant.size,
        'material': implant.material,
        'implant_date': implant.implant_date.isoformat() if implant.implant_date else None,
        'last_change_date': implant.last_change_date.isoformat() if implant.last_change_date else None,
        'next_change_date': implant.next_change_date.isoformat() if implant.next_change_date else None,
        'removal_date': implant.removal_date.isoformat() if implant.removal_date else None,
        'expiration_date': implant.expiration_date.isoformat() if implant.expiration_date else None,
        'implanting_provider_id': implant.implanting_provider_id,
        'managing_provider_id': implant.managing_provider_id,
        'facility_name': implant.facility_name,
        'facility_location': implant.facility_location,
        'status': implant.status,
        'notes': implant.notes,
        'care_instructions': implant.care_instructions,
        'complications': implant.complications,
        'mri_safe': implant.mri_safe,
        'mri_notes': implant.mri_notes,
        'is_life_sustaining': implant.is_life_sustaining,
        'requires_regular_change': implant.requires_regular_change,
        'change_frequency_days': implant.change_frequency_days,
        'active': implant.active,
        'created_at': implant.created_at.isoformat() if implant.created_at else None,
        'updated_at': implant.updated_at.isoformat() if implant.updated_at else None,
        'created_by': implant.created_by,
        'implanting_provider_name': None,
        'managing_provider_name': None,
        'created_by_name': None,
        'notes_count': len(implant.follow_up_notes) if implant.follow_up_notes else 0,
    }
    
    # Add provider names if relationships are loaded
    if implant.implanting_provider:
        result['implanting_provider_name'] = f"{implant.implanting_provider.title or ''} {implant.implanting_provider.first_name} {implant.implanting_provider.last_name}".strip()
    
    if implant.managing_provider:
        result['managing_provider_name'] = f"{implant.managing_provider.title or ''} {implant.managing_provider.first_name} {implant.managing_provider.last_name}".strip()
    
    if implant.created_by_user:
        result['created_by_name'] = implant.created_by_user.username
    
    if include_notes and implant.follow_up_notes:
        result['follow_up_notes'] = [format_implant_note_for_response(note) for note in implant.follow_up_notes]
    
    return result


def format_implant_note_for_response(note: ImplantNote) -> dict:
    """Format an implant note for API response"""
    result = {
        'id': note.id,
        'implant_id': note.implant_id,
        'note_type': note.note_type,
        'content': note.content,
        'was_changed': note.was_changed,
        'old_serial_number': note.old_serial_number,
        'new_serial_number': note.new_serial_number,
        'provider_id': note.provider_id,
        'created_at': note.created_at.isoformat() if note.created_at else None,
        'created_by': note.created_by,
        'provider_name': None,
        'created_by_name': None,
    }
    
    if note.provider:
        result['provider_name'] = f"{note.provider.title or ''} {note.provider.first_name} {note.provider.last_name}".strip()
    
    if note.created_by_user:
        result['created_by_name'] = note.created_by_user.username
    
    return result


# ============== Lookup Data ==============

IMPLANT_TYPES = [
    {'value': 'medical', 'label': 'Medical', 'description': 'Medical devices and implants (trach, shunt, pacemaker, etc.)'},
    {'value': 'cosmetic', 'label': 'Cosmetic', 'description': 'Cosmetic implants (breast, facial, etc.)'},
    {'value': 'body_modification', 'label': 'Body Modification', 'description': 'Subdermal implants, horns, etc.'},
    {'value': 'piercing', 'label': 'Piercing', 'description': 'Body piercings with permanent jewelry'},
    {'value': 'dental', 'label': 'Dental', 'description': 'Dental implants and devices'},
    {'value': 'orthopedic', 'label': 'Orthopedic', 'description': 'Joint replacements, plates, screws, etc.'},
    {'value': 'other', 'label': 'Other', 'description': 'Other types of implants'},
]

IMPLANT_CATEGORIES = [
    # Medical
    {'value': 'respiratory', 'label': 'Respiratory', 'implant_type': 'medical'},
    {'value': 'neurological', 'label': 'Neurological', 'implant_type': 'medical'},
    {'value': 'cardiac', 'label': 'Cardiac', 'implant_type': 'medical'},
    {'value': 'gastrointestinal', 'label': 'Gastrointestinal', 'implant_type': 'medical'},
    {'value': 'urological', 'label': 'Urological', 'implant_type': 'medical'},
    {'value': 'vascular', 'label': 'Vascular', 'implant_type': 'medical'},
    {'value': 'auditory', 'label': 'Auditory', 'implant_type': 'medical'},
    {'value': 'ocular', 'label': 'Ocular', 'implant_type': 'medical'},
    # Cosmetic
    {'value': 'breast', 'label': 'Breast', 'implant_type': 'cosmetic'},
    {'value': 'facial', 'label': 'Facial', 'implant_type': 'cosmetic'},
    {'value': 'buttock', 'label': 'Buttock', 'implant_type': 'cosmetic'},
    {'value': 'calf', 'label': 'Calf', 'implant_type': 'cosmetic'},
    {'value': 'pectoral', 'label': 'Pectoral', 'implant_type': 'cosmetic'},
    # Body modification
    {'value': 'subdermal', 'label': 'Subdermal', 'implant_type': 'body_modification'},
    {'value': 'transdermal', 'label': 'Transdermal', 'implant_type': 'body_modification'},
    {'value': 'magnetic', 'label': 'Magnetic', 'implant_type': 'body_modification'},
    {'value': 'rfid_nfc', 'label': 'RFID/NFC', 'implant_type': 'body_modification'},
    # Piercing
    {'value': 'ear', 'label': 'Ear', 'implant_type': 'piercing'},
    {'value': 'facial_piercing', 'label': 'Facial', 'implant_type': 'piercing'},
    {'value': 'oral', 'label': 'Oral', 'implant_type': 'piercing'},
    {'value': 'body_piercing', 'label': 'Body', 'implant_type': 'piercing'},
    # Dental
    {'value': 'tooth_implant', 'label': 'Tooth Implant', 'implant_type': 'dental'},
    {'value': 'dentures', 'label': 'Dentures', 'implant_type': 'dental'},
    {'value': 'orthodontic', 'label': 'Orthodontic', 'implant_type': 'dental'},
    # Orthopedic
    {'value': 'joint_replacement', 'label': 'Joint Replacement', 'implant_type': 'orthopedic'},
    {'value': 'spinal', 'label': 'Spinal', 'implant_type': 'orthopedic'},
    {'value': 'fixation', 'label': 'Plates/Screws/Rods', 'implant_type': 'orthopedic'},
]

IMPLANT_STATUSES = [
    {'value': 'active', 'label': 'Active'},
    {'value': 'pending', 'label': 'Pending Placement'},
    {'value': 'removed', 'label': 'Removed'},
    {'value': 'replaced', 'label': 'Replaced'},
    {'value': 'failed', 'label': 'Failed'},
    {'value': 'expired', 'label': 'Expired'},
]

MRI_SAFETY_OPTIONS = [
    {'value': 'safe', 'label': 'MR Safe', 'description': 'Safe in all MRI environments'},
    {'value': 'conditional', 'label': 'MR Conditional', 'description': 'Safe under specific conditions'},
    {'value': 'unsafe', 'label': 'MR Unsafe', 'description': 'Not safe for MRI'},
    {'value': 'unknown', 'label': 'Unknown', 'description': 'MRI safety not determined'},
]

BODY_SIDES = [
    {'value': 'left', 'label': 'Left'},
    {'value': 'right', 'label': 'Right'},
    {'value': 'bilateral', 'label': 'Bilateral'},
    {'value': 'midline', 'label': 'Midline'},
    {'value': 'n/a', 'label': 'N/A'},
]
