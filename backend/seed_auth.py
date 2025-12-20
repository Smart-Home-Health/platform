"""
Seed default roles and permissions for the application
"""
from sqlalchemy.orm import Session
from crud.users import (
    get_permission_by_name, create_permission,
    get_role_by_name, create_role,
    assign_permission_to_role
)
import logging

logger = logging.getLogger(__name__)


def seed_permissions(db: Session):
    """Create default permissions if they don't exist"""
    
    default_permissions = [
        # Medication permissions
        ("medications.view", "View Medications", "View medication schedules and logs", "medications"),
        ("medications.administer", "Administer Medications", "Record medication administration", "medications"),
        ("medications.manage", "Manage Medications", "Add, edit, delete medications", "medications"),
        
        # Care task permissions
        ("care_tasks.view", "View Care Tasks", "View care task schedules and logs", "care_tasks"),
        ("care_tasks.perform", "Perform Care Tasks", "Record care task completion", "care_tasks"),
        ("care_tasks.manage", "Manage Care Tasks", "Add, edit, delete care tasks", "care_tasks"),
        
        # Vital signs permissions
        ("vitals.view", "View Vitals", "View vital sign readings", "vitals"),
        ("vitals.record", "Record Vitals", "Manually record vital signs", "vitals"),
        
        # Equipment permissions
        ("equipment.view", "View Equipment", "View equipment status", "equipment"),
        ("equipment.change", "Change Equipment", "Record equipment changes", "equipment"),
        ("equipment.manage", "Manage Equipment", "Add, edit equipment definitions", "equipment"),
        
        # Nutrition permissions
        ("nutrition.view", "View Nutrition", "View nutrition intake", "nutrition"),
        ("nutrition.record", "Record Nutrition", "Record nutrition intake", "nutrition"),
        ("nutrition.manage", "Manage Nutrition", "Manage nutrition plans", "nutrition"),
        
        # Monitoring/Alert permissions
        ("monitoring.view", "View Alerts", "View monitoring alerts", "monitoring"),
        ("monitoring.manage", "Manage Alerts", "Acknowledge and manage alerts", "monitoring"),
        
        # Patient permissions
        ("patients.view", "View Patients", "View patient information", "patients"),
        ("patients.manage", "Manage Patients", "Add, edit patient information", "patients"),
        
        # System permissions
        ("settings.view", "View Settings", "View system settings", "system"),
        ("settings.manage", "Manage Settings", "Modify system settings", "system"),
        ("users.view", "View Users", "View user list", "system"),
        ("users.manage", "Manage Users", "Add, edit, delete users", "system"),
        ("roles.manage", "Manage Roles", "Add, edit roles and permissions", "system"),
        ("audit.view", "View Audit Logs", "View system audit logs", "system"),
    ]
    
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
                "medications.view", "medications.administer", "medications.manage",
                "care_tasks.view", "care_tasks.perform", "care_tasks.manage",
                "vitals.view", "vitals.record",
                "equipment.view", "equipment.change", "equipment.manage",
                "nutrition.view", "nutrition.record", "nutrition.manage",
                "monitoring.view", "monitoring.manage",
                "patients.view", "patients.manage",
                "settings.view", "settings.manage",
                "users.view", "users.manage", "roles.manage",
                "audit.view"
            ]
        },
        "nurse": {
            "display_name": "Registered Nurse",
            "description": "Full clinical access for nursing duties",
            "permissions": [
                "medications.view", "medications.administer", "medications.manage",
                "care_tasks.view", "care_tasks.perform", "care_tasks.manage",
                "vitals.view", "vitals.record",
                "equipment.view", "equipment.change", "equipment.manage",
                "nutrition.view", "nutrition.record", "nutrition.manage",
                "monitoring.view", "monitoring.manage",
                "patients.view", "patients.manage",
                "settings.view",
                "users.view"
            ]
        },
        "caregiver": {
            "display_name": "Caregiver",
            "description": "Standard care duties and documentation",
            "permissions": [
                "medications.view", "medications.administer",
                "care_tasks.view", "care_tasks.perform",
                "vitals.view", "vitals.record",
                "equipment.view", "equipment.change",
                "nutrition.view", "nutrition.record",
                "monitoring.view",
                "patients.view"
            ]
        },
        "family": {
            "display_name": "Family Member",
            "description": "View-only access with limited recording capabilities",
            "permissions": [
                "medications.view",
                "care_tasks.view",
                "vitals.view",
                "equipment.view",
                "nutrition.view", "nutrition.record",
                "monitoring.view",
                "patients.view"
            ]
        },
        "monitor": {
            "display_name": "Monitor Only",
            "description": "Read-only access to vitals and alerts",
            "permissions": [
                "vitals.view",
                "equipment.view",
                "monitoring.view"
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


def seed_default_data(db: Session):
    """Seed all default roles and permissions"""
    logger.info("Seeding default roles and permissions...")
    
    # First create permissions
    perm_count = seed_permissions(db)
    
    # Then create roles with permissions
    role_count = seed_roles(db)
    
    logger.info(f"Seeding complete: {perm_count} permissions, {role_count} roles")
    return {"permissions": perm_count, "roles": role_count}
