from typing import Optional, List
from datetime import datetime
from pydantic import BaseModel, Field


# Pydantic models for businesses
class BusinessBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    business_types: List[str] = Field(default_factory=list, description="List of business types (e.g., ['hospital', 'pharmacy', 'lab'])")
    phone: Optional[str] = Field(None, max_length=20)
    email: Optional[str] = Field(None, max_length=255)
    website: Optional[str] = Field(None, max_length=255)
    address_line1: Optional[str] = Field(None, max_length=255)
    address_line2: Optional[str] = Field(None, max_length=255)
    city: Optional[str] = Field(None, max_length=100)
    state: Optional[str] = Field(None, max_length=50)
    zip_code: Optional[str] = Field(None, max_length=20)
    country: Optional[str] = Field("USA", max_length=100)
    description: Optional[str] = None
    hours_of_operation: Optional[str] = None
    emergency_contact: Optional[str] = Field(None, max_length=100)
    active: bool = True


class BusinessCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    business_types: List[str] = Field(default_factory=list, description="List of business types")
    phone: Optional[str] = Field(None, max_length=20)
    email: Optional[str] = Field(None, max_length=255)
    website: Optional[str] = Field(None, max_length=255)
    address_line1: Optional[str] = Field(None, max_length=255)
    address_line2: Optional[str] = Field(None, max_length=255)
    city: Optional[str] = Field(None, max_length=100)
    state: Optional[str] = Field(None, max_length=50)
    zip_code: Optional[str] = Field(None, max_length=20)
    country: Optional[str] = Field("USA", max_length=100)
    description: Optional[str] = None
    hours_of_operation: Optional[str] = None
    emergency_contact: Optional[str] = Field(None, max_length=100)
    active: bool = True


class BusinessUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=200)
    business_types: Optional[List[str]] = Field(None, description="List of business types")
    phone: Optional[str] = Field(None, max_length=20)
    email: Optional[str] = Field(None, max_length=255)
    website: Optional[str] = Field(None, max_length=255)
    address_line1: Optional[str] = Field(None, max_length=255)
    address_line2: Optional[str] = Field(None, max_length=255)
    city: Optional[str] = Field(None, max_length=100)
    state: Optional[str] = Field(None, max_length=50)
    zip_code: Optional[str] = Field(None, max_length=20)
    country: Optional[str] = Field(None, max_length=100)
    description: Optional[str] = None
    hours_of_operation: Optional[str] = None
    emergency_contact: Optional[str] = Field(None, max_length=100)
    active: Optional[bool] = None


class BusinessResponse(BaseModel):
    id: int
    name: str
    business_types: List[str] = Field(default_factory=list)
    # Legacy field for backwards compatibility
    business_type: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    website: Optional[str] = None
    address_line1: Optional[str] = None
    address_line2: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    zip_code: Optional[str] = None
    country: Optional[str] = None
    description: Optional[str] = None
    hours_of_operation: Optional[str] = None
    emergency_contact: Optional[str] = None
    active: bool
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True
