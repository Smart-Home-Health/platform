"""
Seed default roles and permissions for the application
"""
from sqlalchemy.orm import Session
from crud.users import (
    get_permission_by_name, create_permission,
    get_role_by_name, create_role,
    assign_permission_to_role,
    get_default_organization, create_organization
)
from models.users import OrganizationType
import logging

logger = logging.getLogger(__name__)


def seed_permissions(db: Session):
    """Create default permissions if they don't exist"""
    
    # Define sections based on nav bar
    sections = [
        ("patients", "Patients"),
        ("medications", "Medications"),
        ("care_tasks", "Care Tasks"),
        ("equipment", "Equipment"),
        ("nutrition", "Nutrition"),
        ("providers", "Providers"),
        ("businesses", "Businesses"),
        ("monitoring", "Monitoring"),
        ("vitals", "Vitals"),
        ("users", "Users"),
        ("roles", "Roles"),
        ("shipments", "Shipments"),
        ("settings", "Settings"),
        ("audit", "Audit"),
    ]
    
    # CRUD operations for each section
    operations = [
        ("create", "Create", "Create new"),
        ("read", "View", "View"),
        ("update", "Edit", "Edit"),
        ("delete", "Delete", "Delete"),
    ]
    
    default_permissions = []
    
    # Generate CRUD permissions for each section
    for section_code, section_name in sections:
        for op_code, op_name, op_desc in operations:
            perm_name = f"{section_code}.{op_code}"
            display_name = f"{op_name} {section_name}"
            description = f"{op_desc} {section_name.lower()}"
            default_permissions.append((perm_name, display_name, description, section_code))
    
    # Add special/legacy permissions for backward compatibility
    legacy_permissions = [
        ("medications.administer", "Administer Medications", "Record medication administration", "medications"),
        ("care_tasks.perform", "Perform Care Tasks", "Record care task completion", "care_tasks"),
        ("vitals.record", "Record Vitals", "Manually record vital signs", "vitals"),
        ("equipment.change", "Change Equipment", "Record equipment changes", "equipment"),
        ("monitoring.acknowledge", "Acknowledge Alerts", "Acknowledge monitoring alerts", "monitoring"),
        ("shipments.receive", "Receive Shipments", "Record shipment item receipts", "shipments"),
        ("shipments.finalize", "Finalize Shipments", "Finalize shipments and generate alerts", "shipments"),
    ]
    default_permissions.extend(legacy_permissions)
    
    created_count = 0
    for name, display_name, description, category in default_permissions:
        perm = get_permission_by_name(db, name)
        if not perm:
            create_permission(db, name, display_name, category, description)
            created_count += 1
    
    if created_count > 0:
        logger.info(f"Created {created_count} default permissions")
    
    return created_count


def seed_roles(db: Session):
    """Create default roles with their permissions"""
    
    default_roles = {
        "system_admin": {
            "display_name": "System Administrator",
            "description": "Full system access with all permissions",
            "permissions": [
                # Full CRUD on all sections
                "patients.create", "patients.read", "patients.update", "patients.delete",
                "medications.create", "medications.read", "medications.update", "medications.delete", "medications.administer",
                "care_tasks.create", "care_tasks.read", "care_tasks.update", "care_tasks.delete", "care_tasks.perform",
                "equipment.create", "equipment.read", "equipment.update", "equipment.delete", "equipment.change",
                "nutrition.create", "nutrition.read", "nutrition.update", "nutrition.delete",
                "providers.create", "providers.read", "providers.update", "providers.delete",
                "businesses.create", "businesses.read", "businesses.update", "businesses.delete",
                "monitoring.create", "monitoring.read", "monitoring.update", "monitoring.delete", "monitoring.acknowledge",
                "vitals.create", "vitals.read", "vitals.update", "vitals.delete", "vitals.record",
                "shipments.create", "shipments.read", "shipments.update", "shipments.delete", "shipments.receive", "shipments.finalize",
                "users.create", "users.read", "users.update", "users.delete",
                "roles.create", "roles.read", "roles.update", "roles.delete",
                "settings.create", "settings.read", "settings.update", "settings.delete",
                "audit.create", "audit.read", "audit.update", "audit.delete",
            ]
        },
        "nurse": {
            "display_name": "Registered Nurse",
            "description": "Full clinical access for nursing duties",
            "permissions": [
                "patients.read", "patients.update",
                "medications.create", "medications.read", "medications.update", "medications.administer",
                "care_tasks.create", "care_tasks.read", "care_tasks.update", "care_tasks.perform",
                "equipment.read", "equipment.update", "equipment.change",
                "nutrition.create", "nutrition.read", "nutrition.update",
                "providers.read",
                "businesses.read",
                "monitoring.read", "monitoring.update", "monitoring.acknowledge",
                "vitals.read", "vitals.record",
                "shipments.create", "shipments.read", "shipments.update", "shipments.receive", "shipments.finalize",
                "users.read",
                "settings.read",
            ]
        },
        "caregiver": {
            "display_name": "Caregiver",
            "description": "Standard care duties and documentation",
            "permissions": [
                "patients.read",
                "medications.read", "medications.administer",
                "care_tasks.read", "care_tasks.perform",
                "equipment.read", "equipment.change",
                "nutrition.read", "nutrition.create",
                "providers.read",
                "businesses.read",
                "monitoring.read", "monitoring.acknowledge",
                "vitals.read", "vitals.record",
                "shipments.read", "shipments.receive",
            ]
        },
        "family": {
            "display_name": "Family Member",
            "description": "View-only access with limited recording capabilities",
            "permissions": [
                "patients.read",
                "medications.read",
                "care_tasks.read",
                "equipment.read",
                "nutrition.read",
                "providers.read",
                "monitoring.read",
                "vitals.read",
                "shipments.read",
            ]
        },
        "monitor": {
            "display_name": "Monitor Only",
            "description": "Read-only access to vitals and alerts",
            "permissions": [
                "vitals.read",
                "equipment.read",
                "monitoring.read",
            ]
        }
    }
    
    created_count = 0
    for role_name, role_data in default_roles.items():
        role = get_role_by_name(db, role_name)
        if not role:
            # Get permission IDs
            permission_ids = []
            for perm_name in role_data["permissions"]:
                perm = get_permission_by_name(db, perm_name)
                if perm:
                    permission_ids.append(perm.id)
            
            # Create role
            role = create_role(
                db,
                name=role_name,
                display_name=role_data["display_name"],
                description=role_data["description"],
                permission_ids=permission_ids
            )
            
            # Mark as system role
            role.is_system_role = True
            db.commit()
            
            created_count += 1
        else:
            # Update existing role permissions if needed
            existing_perm_names = {p.name for p in role.permissions}
            required_perm_names = set(role_data["permissions"])
            
            # Add missing permissions
            for perm_name in required_perm_names - existing_perm_names:
                perm = get_permission_by_name(db, perm_name)
                if perm:
                    assign_permission_to_role(db, role.id, perm.id)
    
    if created_count > 0:
        logger.info(f"Created {created_count} default roles")
    
    return created_count


def seed_default_organization(db: Session):
    """Create the default 'Smart Home Health' organization if it doesn't exist"""
    org = get_default_organization(db)
    if not org:
        org = create_organization(
            db,
            name="Smart Home Health",
            slug="smart-home-health",
            org_type=OrganizationType.OTHER,
            is_default=True
        )
        logger.info("Created default organization: Smart Home Health")
        return 1
    return 0


def seed_default_data(db: Session):
    """Seed all default roles and permissions"""
    logger.info("Seeding default roles and permissions...")
    
    # First create default organization
    org_count = seed_default_organization(db)
    
    # Create permissions
    perm_count = seed_permissions(db)
    
    # Then create roles with permissions
    role_count = seed_roles(db)
    
    logger.info(f"Seeding complete: {org_count} organizations, {perm_count} permissions, {role_count} roles")
    return {"organizations": org_count, "permissions": perm_count, "roles": role_count}
