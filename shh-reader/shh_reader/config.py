"""
Configuration Management for SHH Reader

Stores configuration in SQLite database for persistence across restarts.
"""

import os
import json
import socket
import aiosqlite
from pathlib import Path
from typing import Optional, Any
from dataclasses import dataclass, field, asdict
from datetime import datetime

# Get data directory from environment
def get_data_dir() -> Path:
    return Path(os.environ.get('SHH_READER_DATA_DIR', './data'))


def get_db_path() -> Path:
    return get_data_dir() / 'reader.db'


@dataclass
class ReaderConfig:
    """Reader configuration settings"""
    # Identity
    device_name: str = field(default_factory=lambda: socket.gethostname())
    
    # Serial settings
    serial_port: Optional[str] = None
    serial_baud: int = 115200
    serial_enabled: bool = False
    
    # GPIO settings
    gpio_enabled: bool = False
    gpio_alarm1_pins: list = field(default_factory=lambda: [17, 18, 27, 22])
    gpio_alarm2_pins: list = field(default_factory=lambda: [5, 6, 13, 19])
    gpio_alarm1_device: str = "vent"
    gpio_alarm2_device: str = "pulseox"
    gpio_alarm1_recovery: int = 30
    gpio_alarm2_recovery: int = 30
    
    # Host connection
    host_url: Optional[str] = None
    encryption_key: Optional[str] = None
    paired: bool = False
    paired_at: Optional[str] = None
    
    # Pairing state (not persisted)
    pairing_code: Optional[str] = field(default=None, repr=False)
    pairing_pending: bool = False


class ConfigManager:
    """Manages reader configuration in SQLite"""
    
    _instance: Optional['ConfigManager'] = None
    _config: Optional[ReaderConfig] = None
    
    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance
    
    @property
    def config(self) -> ReaderConfig:
        if self._config is None:
            raise RuntimeError("ConfigManager not initialized. Call await config_manager.load() first.")
        return self._config
    
    async def init_db(self):
        """Initialize database tables"""
        async with aiosqlite.connect(get_db_path()) as db:
            await db.execute('''
                CREATE TABLE IF NOT EXISTS config (
                    key TEXT PRIMARY KEY,
                    value TEXT,
                    updated_at TEXT
                )
            ''')
            await db.commit()
    
    async def load(self) -> ReaderConfig:
        """Load configuration from database"""
        await self.init_db()
        
        self._config = ReaderConfig()
        
        async with aiosqlite.connect(get_db_path()) as db:
            async with db.execute('SELECT key, value FROM config') as cursor:
                async for row in cursor:
                    key, value = row
                    if hasattr(self._config, key):
                        # Parse JSON for complex types
                        try:
                            parsed = json.loads(value)
                        except (json.JSONDecodeError, TypeError):
                            parsed = value
                        setattr(self._config, key, parsed)
        
        return self._config
    
    async def save(self, **kwargs):
        """Save configuration values to database"""
        if self._config is None:
            await self.load()
        
        async with aiosqlite.connect(get_db_path()) as db:
            now = datetime.utcnow().isoformat()
            for key, value in kwargs.items():
                if hasattr(self._config, key):
                    setattr(self._config, key, value)
                    # Serialize complex types to JSON
                    if isinstance(value, (list, dict)):
                        value = json.dumps(value)
                    elif value is None:
                        value = ''
                    else:
                        value = str(value) if not isinstance(value, str) else value
                    
                    await db.execute('''
                        INSERT OR REPLACE INTO config (key, value, updated_at)
                        VALUES (?, ?, ?)
                    ''', (key, value, now))
            await db.commit()
    
    async def get(self, key: str, default: Any = None) -> Any:
        """Get a single config value"""
        if self._config is None:
            await self.load()
        return getattr(self._config, key, default)
    
    async def set(self, key: str, value: Any):
        """Set a single config value"""
        await self.save(**{key: value})


# Global config manager instance
config_manager = ConfigManager()
