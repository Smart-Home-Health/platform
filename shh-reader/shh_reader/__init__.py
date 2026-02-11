"""
SHH Reader - Standalone Sensor Gateway

A Docker-deployable sensor reader with:
- Serial port monitoring (pulse oximeter)
- GPIO alarm monitoring
- SQLite caching for offline resilience
- Encrypted WebSocket connection to SHH host
- NiceGUI web interface for setup and monitoring
"""

__version__ = "1.0.0"
