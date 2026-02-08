"""
Smart Device Integrations Package

This package provides a plugin-style system for integrating external health devices
and services (Withings, iHealth, etc.) following a standardized interface.

Each integration must:
1. Inherit from BaseIntegration
2. Implement all abstract methods
3. Output VitalReading objects that get normalized into the vitals table
"""

from .base import BaseIntegration, VitalReading, DeviceInfo, SyncResult, IntegrationError, AuthenticationError
from .registry import IntegrationRegistry, get_integration

__all__ = [
    'BaseIntegration',
    'VitalReading',
    'DeviceInfo',
    'SyncResult',
    'IntegrationError',
    'AuthenticationError',
    'IntegrationRegistry',
    'get_integration',
]

# Auto-register integrations by importing them
from . import manual
from . import withings
