"""
SQLite Cache for SHH Reader

Caches sensor data locally when host connection is down.
Automatically syncs cached data when connection is restored.
Retains data for 7 days before purging.
"""

import asyncio
import json
import logging
import os
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional, List, Dict, Any
from dataclasses import dataclass, asdict

import aiosqlite

logger = logging.getLogger('shh_reader.cache')


# Get data directory from environment
def get_db_path() -> Path:
    data_dir = Path(os.environ.get('SHH_READER_DATA_DIR', './data'))
    return data_dir / 'reader.db'


@dataclass
class CachedEvent:
    """A cached sensor or alarm event"""
    id: Optional[int]
    event_type: str  # 'sensor' or 'alarm'
    timestamp: str  # ISO format
    payload: Dict[str, Any]
    synced_at: Optional[str] = None
    
    def to_message(self) -> Dict[str, Any]:
        """Convert to message format for sending to host"""
        return {
            "type": self.event_type,
            "ts": self.timestamp,
            **self.payload
        }


class CacheManager:
    """
    Manages SQLite cache for offline data storage.
    
    Features:
    - Caches sensor and alarm events when host is disconnected
    - Replays unsynced events on reconnection
    - Auto-purges records older than 7 days
    """
    
    _instance: Optional['CacheManager'] = None
    
    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance._initialized = False
        return cls._instance
    
    def __init__(self):
        if self._initialized:
            return
        self._initialized = True
        self._retention_days = 7
        self._purge_task: Optional[asyncio.Task] = None
    
    async def init_db(self):
        """Initialize cache table"""
        async with aiosqlite.connect(get_db_path()) as db:
            await db.execute('''
                CREATE TABLE IF NOT EXISTS event_cache (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    event_type TEXT NOT NULL,
                    timestamp TEXT NOT NULL,
                    payload TEXT NOT NULL,
                    synced_at TEXT,
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP
                )
            ''')
            await db.execute('''
                CREATE INDEX IF NOT EXISTS idx_cache_synced 
                ON event_cache(synced_at)
            ''')
            await db.execute('''
                CREATE INDEX IF NOT EXISTS idx_cache_timestamp 
                ON event_cache(timestamp)
            ''')
            await db.commit()
        logger.info("Cache database initialized")
    
    async def start_purge_task(self):
        """Start background task to purge old records"""
        if self._purge_task is None:
            self._purge_task = asyncio.create_task(self._purge_loop())
    
    async def stop_purge_task(self):
        """Stop the purge task"""
        if self._purge_task:
            self._purge_task.cancel()
            try:
                await self._purge_task
            except asyncio.CancelledError:
                pass
            self._purge_task = None
    
    async def _purge_loop(self):
        """Background loop to purge old records"""
        while True:
            try:
                await asyncio.sleep(3600)  # Run every hour
                await self.purge_old_records()
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Purge task error: {e}")
    
    async def cache_event(self, event_type: str, timestamp: datetime, payload: Dict[str, Any]) -> int:
        """
        Cache an event for later sync.
        
        Args:
            event_type: 'sensor' or 'alarm'
            timestamp: Event timestamp
            payload: Event data (will be JSON serialized)
            
        Returns:
            Cache record ID
        """
        async with aiosqlite.connect(get_db_path()) as db:
            cursor = await db.execute('''
                INSERT INTO event_cache (event_type, timestamp, payload)
                VALUES (?, ?, ?)
            ''', (event_type, timestamp.isoformat(), json.dumps(payload)))
            await db.commit()
            return cursor.lastrowid
    
    async def mark_synced(self, event_ids: List[int]):
        """Mark events as synced"""
        if not event_ids:
            return
        
        now = datetime.utcnow().isoformat()
        async with aiosqlite.connect(get_db_path()) as db:
            placeholders = ','.join(['?' for _ in event_ids])
            await db.execute(f'''
                UPDATE event_cache 
                SET synced_at = ?
                WHERE id IN ({placeholders})
            ''', [now] + event_ids)
            await db.commit()
        logger.debug(f"Marked {len(event_ids)} events as synced")
    
    async def get_unsynced(self, limit: int = 100) -> List[CachedEvent]:
        """Get unsynced events for replay"""
        events = []
        async with aiosqlite.connect(get_db_path()) as db:
            db.row_factory = aiosqlite.Row
            async with db.execute('''
                SELECT id, event_type, timestamp, payload, synced_at
                FROM event_cache
                WHERE synced_at IS NULL
                ORDER BY timestamp ASC
                LIMIT ?
            ''', (limit,)) as cursor:
                async for row in cursor:
                    events.append(CachedEvent(
                        id=row['id'],
                        event_type=row['event_type'],
                        timestamp=row['timestamp'],
                        payload=json.loads(row['payload']),
                        synced_at=row['synced_at']
                    ))
        return events
    
    async def get_unsynced_count(self) -> int:
        """Get count of unsynced events"""
        async with aiosqlite.connect(get_db_path()) as db:
            async with db.execute('''
                SELECT COUNT(*) FROM event_cache WHERE synced_at IS NULL
            ''') as cursor:
                row = await cursor.fetchone()
                return row[0] if row else 0
    
    async def get_total_count(self) -> int:
        """Get total cached event count"""
        async with aiosqlite.connect(get_db_path()) as db:
            async with db.execute('SELECT COUNT(*) FROM event_cache') as cursor:
                row = await cursor.fetchone()
                return row[0] if row else 0
    
    async def purge_old_records(self) -> int:
        """
        Purge records older than retention period.
        
        Returns:
            Number of records deleted
        """
        cutoff = (datetime.utcnow() - timedelta(days=self._retention_days)).isoformat()
        async with aiosqlite.connect(get_db_path()) as db:
            cursor = await db.execute('''
                DELETE FROM event_cache WHERE timestamp < ?
            ''', (cutoff,))
            await db.commit()
            deleted = cursor.rowcount
        
        if deleted > 0:
            logger.info(f"Purged {deleted} old cache records")
        return deleted
    
    async def clear_synced(self) -> int:
        """
        Clear all synced records to free space.
        
        Returns:
            Number of records deleted
        """
        async with aiosqlite.connect(get_db_path()) as db:
            cursor = await db.execute('''
                DELETE FROM event_cache WHERE synced_at IS NOT NULL
            ''')
            await db.commit()
            return cursor.rowcount
    
    async def get_stats(self) -> Dict[str, Any]:
        """Get cache statistics"""
        async with aiosqlite.connect(get_db_path()) as db:
            stats = {}
            
            # Total count
            async with db.execute('SELECT COUNT(*) FROM event_cache') as cursor:
                row = await cursor.fetchone()
                stats['total'] = row[0] if row else 0
            
            # Unsynced count
            async with db.execute('SELECT COUNT(*) FROM event_cache WHERE synced_at IS NULL') as cursor:
                row = await cursor.fetchone()
                stats['unsynced'] = row[0] if row else 0
            
            # Synced count
            stats['synced'] = stats['total'] - stats['unsynced']
            
            # Oldest record
            async with db.execute('SELECT MIN(timestamp) FROM event_cache') as cursor:
                row = await cursor.fetchone()
                stats['oldest'] = row[0] if row and row[0] else None
            
            # Newest record
            async with db.execute('SELECT MAX(timestamp) FROM event_cache') as cursor:
                row = await cursor.fetchone()
                stats['newest'] = row[0] if row and row[0] else None
            
            return stats


# Global cache manager instance
cache_manager = CacheManager()
