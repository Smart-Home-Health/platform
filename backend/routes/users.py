"""
User management routes for CRUD operations on users
Separate from auth routes which handle login/session management
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List, Optional
import logging

from db import get_db
from schemas.user import UserResponse, UserCreate, UserUpdate, UserListItem
from crud.users import (
    get_user_by_id, get_user_by_username, get_user_by_email,
    get_all_users, create_user, update_user, delete_user,
    get_all_roles, get_role_by_id, get_role_by_name, create_role,
    assign_role_to_user, remove_role_from_user,
    get_all_permissions, get_permission_by_id, get_permission_by_name,
    create_permission, update_permission, delete_permission,
    assign_permission_to_role, set_force_password_reset, create_audit_log
)
from dependencies import get_current_user, require_permission, require_system_admin
from models.users import User, Role, Permission
from schemas.patient import Patient, PatientAccess, AccessLevel

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/users", tags=["User Management"])


@router.get("")
def list_users(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get list of all users (requires authentication)"""
    users = get_all_users(db)
    
    # Pre-fetch patient assignments for all users
    all_grants = db.query(PatientAccess).filter(PatientAccess.is_active == True).all()
    user_patients = {}
    for g in all_grants:
        user_patients.setdefault(g.user_id, []).append(g.patient_id)

    result = []
    for u in users:
        item = UserListItem(
            id=u.id,
            username=u.username,
            full_name=u.full_name,
            email=u.email,
            is_active=u.is_active,
            is_system_admin=u.is_system_admin,
            has_pin=bool(u.pin_hash),
            force_password_reset=u.force_password_reset,
            roles=[{"id": r.id, "name": r.name, "display_name": r.display_name} for r in u.roles],
            created_at=u.created_at,
            last_login=u.last_login
        )
        # Attach patient_ids as extra field
        item_dict = item.model_dump()
        item_dict["patient_ids"] = user_patients.get(u.id, [])
        result.append(item_dict)
    return result


@router.get("/roles")
def list_roles(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get list of all roles (requires authentication)"""
    roles = get_all_roles(db)
    
    return [
        {
            "id": role.id,
            "name": role.name,
            "display_name": role.display_name,
            "description": role.description,
            "is_active": role.is_active,
            "permissions": [
                {"id": p.id, "name": p.name, "display_name": p.display_name}
                for p in role.permissions if p.is_active
            ]
        }
        for role in roles
    ]


# ==================== Permission Endpoints ====================
# NOTE: These must be defined BEFORE /{user_id} routes to avoid path conflicts

@router.get("/permissions")
def list_permissions(
    category: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get list of all permissions (requires authentication)"""
    permissions = get_all_permissions(db, category=category)
    
    return [
        {
            "id": perm.id,
            "name": perm.name,
            "display_name": perm.display_name,
            "description": perm.description,
            "category": perm.category,
            "is_active": perm.is_active
        }
        for perm in permissions
    ]


@router.get("/permissions/{permission_id}")
def get_permission(
    permission_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get permission by ID"""
    perm = get_permission_by_id(db, permission_id)
    if not perm:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Permission not found"
        )
    
    return {
        "id": perm.id,
        "name": perm.name,
        "display_name": perm.display_name,
        "description": perm.description,
        "category": perm.category,
        "is_active": perm.is_active,
        "roles": [
            {"id": r.id, "name": r.name, "display_name": r.display_name}
            for r in perm.roles if r.is_active
        ]
    }


@router.post("/permissions")
def create_permission_endpoint(
    request: dict,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Create a new permission (requires authentication)"""
    name = request.get("name")
    display_name = request.get("display_name")
    category = request.get("category")
    description = request.get("description")
    
    if not name or not display_name or not category:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="name, display_name, and category are required"
        )
    
    # Check for duplicate
    existing = get_permission_by_name(db, name)
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Permission with this name already exists"
        )
    
    perm = create_permission(db, name, display_name, category, description)
    
    return {
        "id": perm.id,
        "name": perm.name,
        "display_name": perm.display_name,
        "description": perm.description,
        "category": perm.category,
        "is_active": perm.is_active
    }


@router.put("/permissions/{permission_id}")
def update_permission_endpoint(
    permission_id: int,
    request: dict,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Update a permission (requires authentication)"""
    perm = get_permission_by_id(db, permission_id)
    if not perm:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Permission not found"
        )
    
    # Check for duplicate name if changing
    new_name = request.get("name")
    if new_name and new_name != perm.name:
        existing = get_permission_by_name(db, new_name)
        if existing:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Permission with this name already exists"
            )
    
    perm = update_permission(
        db,
        permission_id,
        name=request.get("name"),
        display_name=request.get("display_name"),
        category=request.get("category"),
        description=request.get("description"),
        is_active=request.get("is_active")
    )
    
    return {
        "id": perm.id,
        "name": perm.name,
        "display_name": perm.display_name,
        "description": perm.description,
        "category": perm.category,
        "is_active": perm.is_active
    }


@router.delete("/permissions/{permission_id}")
def delete_permission_endpoint(
    permission_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Delete a permission (requires authentication)"""
    perm = get_permission_by_id(db, permission_id)
    if not perm:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Permission not found"
        )
    
    # Delete the permission
    success = delete_permission(db, permission_id)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to delete permission"
        )
    
    return {"message": "Permission deleted successfully"}


@router.get("/{user_id}", response_model=UserResponse)
def get_user(
    user_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get user by ID"""
    user = get_user_by_id(db, user_id)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    return user


@router.post("", response_model=UserResponse)
def create_new_user(
    user_data: UserCreate,
    current_user: User = Depends(require_permission("users.create")),
    db: Session = Depends(get_db)
):
    """Create a new user - requires users.create permission"""
    # Check if username exists
    if get_user_by_username(db, user_data.username):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Username already taken"
        )
    
    # Check if email exists (if provided)
    if user_data.email and get_user_by_email(db, user_data.email):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already in use"
        )
    
    # Create user under the same account as the creating user
    try:
        user = create_user(
            db=db,
            username=user_data.username,
            password=user_data.password,
            full_name=user_data.full_name,
            email=user_data.email,
            pin=user_data.pin,
            is_active=user_data.is_active if hasattr(user_data, 'is_active') else True,
            role_ids=user_data.role_ids if hasattr(user_data, 'role_ids') else None
        )
        if current_user.account_id and not user.account_id:
            user.account_id = current_user.account_id
            db.commit()
            db.refresh(user)
        return user
    except Exception as e:
        logger.error(f"Error creating user: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error creating user: {str(e)}"
        )


@router.put("/{user_id}", response_model=UserResponse)
def update_existing_user(
    user_id: int,
    user_data: UserUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Update an existing user"""
    user = get_user_by_id(db, user_id)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    # Check username uniqueness if changing
    if user_data.username and user_data.username != user.username:
        existing = get_user_by_username(db, user_data.username)
        if existing:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Username already taken"
            )
    
    # Check email uniqueness if changing
    if user_data.email and user_data.email != user.email:
        existing = get_user_by_email(db, user_data.email)
        if existing:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Email already in use"
            )
    
    try:
        updated_user = update_user(db, user_id, user_data)
        return updated_user
    except Exception as e:
        logger.error(f"Error updating user: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error updating user: {str(e)}"
        )


@router.post("/{user_id}/force-password-reset", response_model=UserResponse)
def force_user_password_reset(
    user_id: int,
    current_user: User = Depends(require_system_admin),
    db: Session = Depends(get_db)
):
    """
    Flag a user for a forced first-login password reset (system administrators only).

    Flag-only: the user keeps their current password and is forced to choose a new one
    (and may optionally set a PIN) the next time they sign in.
    """
    user = get_user_by_id(db, user_id)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )

    updated_user = set_force_password_reset(db, user_id, True)

    import json
    create_audit_log(
        db,
        user_id=current_user.id,
        action="user.password_reset.forced",
        details=json.dumps({"target_user_id": user_id, "username": user.username})
    )

    return updated_user


@router.delete("/{user_id}")
def delete_existing_user(
    user_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Delete a user"""
    # Prevent self-deletion
    if current_user.id == user_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot delete your own account"
        )
    
    user = get_user_by_id(db, user_id)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    try:
        delete_user(db, user_id)
        return {"message": "User deleted successfully"}
    except Exception as e:
        logger.error(f"Error deleting user: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error deleting user: {str(e)}"
        )


@router.post("/{user_id}/roles/{role_id}")
def add_role_to_user(
    user_id: int,
    role_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Add a role to a user"""
    user = get_user_by_id(db, user_id)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    try:
        assign_role_to_user(db, user_id, role_id)
        return {"message": "Role added successfully"}
    except Exception as e:
        logger.error(f"Error adding role: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error adding role: {str(e)}"
        )


@router.delete("/{user_id}/roles/{role_id}")
def remove_user_role(
    user_id: int,
    role_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Remove a role from a user"""
    user = get_user_by_id(db, user_id)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    try:
        remove_role_from_user(db, user_id, role_id)
        return {"message": "Role removed successfully"}
    except Exception as e:
        logger.error(f"Error removing role: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error removing role: {str(e)}"
        )


# ==================== Patient Assignment Endpoints ====================


@router.get("/{user_id}/patients")
def get_user_patients(
    user_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get patient IDs assigned to a user"""
    grants = db.query(PatientAccess).filter(
        PatientAccess.user_id == user_id,
        PatientAccess.is_active == True,
    ).all()
    return {"patient_ids": [g.patient_id for g in grants]}


@router.put("/{user_id}/patients")
def set_user_patients(
    user_id: int,
    body: dict,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Replace all patient assignments for a user.
    Expects: { "patient_ids": [1, 2, 3] }
    """
    user = get_user_by_id(db, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    desired_ids = set(body.get("patient_ids", []))

    # Current active grants for this user
    existing = db.query(PatientAccess).filter(
        PatientAccess.user_id == user_id,
    ).all()
    existing_map = {g.patient_id: g for g in existing}

    # Deactivate removed
    for pid, grant in existing_map.items():
        if pid not in desired_ids:
            db.delete(grant)

    # Add new
    from datetime import datetime
    for pid in desired_ids:
        if pid in existing_map:
            # Re-activate if it was inactive
            grant = existing_map[pid]
            if not grant.is_active:
                grant.is_active = True
        else:
            db.add(PatientAccess(
                patient_id=pid,
                user_id=user_id,
                access_level=AccessLevel.CAREGIVER,
                is_active=True,
                granted_by_user_id=current_user.id,
                granted_at=datetime.utcnow(),
            ))

    db.commit()
    return {"success": True, "patient_ids": list(desired_ids)}


# ==================== Role CRUD Endpoints ====================

@router.post("/roles")
def create_new_role(
    role_data: dict,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Create a new role"""
    # Check if role name exists
    if get_role_by_name(db, role_data.get("name")):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Role name already exists"
        )
    
    try:
        role = create_role(
            db=db,
            name=role_data.get("name"),
            display_name=role_data.get("display_name"),
            description=role_data.get("description"),
            is_system_role=False
        )
        
        # Assign permissions if provided
        permission_ids = role_data.get("permission_ids", [])
        for perm_id in permission_ids:
            try:
                assign_permission_to_role(db, role.id, perm_id)
            except:
                pass  # Skip invalid permissions
        
        db.refresh(role)
        
        return {
            "id": role.id,
            "name": role.name,
            "display_name": role.display_name,
            "description": role.description,
            "is_active": role.is_active,
            "is_system_role": role.is_system_role,
            "permissions": [
                {"id": p.id, "name": p.name, "display_name": p.display_name}
                for p in role.permissions if p.is_active
            ]
        }
    except Exception as e:
        logger.error(f"Error creating role: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error creating role: {str(e)}"
        )


@router.get("/roles/{role_id}")
def get_role(
    role_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get role by ID"""
    role = get_role_by_id(db, role_id)
    if not role:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Role not found"
        )
    
    return {
        "id": role.id,
        "name": role.name,
        "display_name": role.display_name,
        "description": role.description,
        "is_active": role.is_active,
        "is_system_role": role.is_system_role,
        "permissions": [
            {"id": p.id, "name": p.name, "display_name": p.display_name}
            for p in role.permissions if p.is_active
        ],
        "user_count": len(role.users)
    }


@router.put("/roles/{role_id}")
def update_role(
    role_id: int,
    role_data: dict,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Update an existing role"""
    role = get_role_by_id(db, role_id)
    if not role:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Role not found"
        )
    
    try:
        # Update basic fields
        if "display_name" in role_data:
            role.display_name = role_data["display_name"]
        if "description" in role_data:
            role.description = role_data["description"]
        if "is_active" in role_data and not role.is_system_role:
            role.is_active = role_data["is_active"]
        
        # Update permissions if provided
        if "permission_ids" in role_data:
            # Clear existing permissions
            role.permissions.clear()
            # Add new permissions
            for perm_id in role_data["permission_ids"]:
                perm = get_permission_by_id(db, perm_id)
                if perm:
                    role.permissions.append(perm)
        
        db.commit()
        db.refresh(role)
        
        return {
            "id": role.id,
            "name": role.name,
            "display_name": role.display_name,
            "description": role.description,
            "is_active": role.is_active,
            "is_system_role": role.is_system_role,
            "permissions": [
                {"id": p.id, "name": p.name, "display_name": p.display_name}
                for p in role.permissions if p.is_active
            ]
        }
    except Exception as e:
        db.rollback()
        logger.error(f"Error updating role: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error updating role: {str(e)}"
        )


@router.delete("/roles/{role_id}")
def delete_role(
    role_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Delete a role"""
    role = get_role_by_id(db, role_id)
    if not role:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Role not found"
        )
    
    if role.is_system_role:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot delete a system role"
        )
    
    try:
        db.delete(role)
        db.commit()
        return {"message": "Role deleted successfully"}
    except Exception as e:
        db.rollback()
        logger.error(f"Error deleting role: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error deleting role: {str(e)}"
        )
