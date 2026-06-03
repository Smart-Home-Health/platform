# Smart Home Health Hub
# Copyright (C) 2026 John Carty
#
# This program is free software: you can redistribute it and/or modify
# it under the terms of the GNU Affero General Public License as published by
# the Free Software Foundation, either version 3 of the License, or
# (at your option) any later version.
#
# This program is distributed in the hope that it will be useful,
# but WITHOUT ANY WARRANTY; without even the implied warranty of
# MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
# GNU Affero General Public License for more details.
#
# You should have received a copy of the GNU Affero General Public License
# along with this program.  If not, see <https://www.gnu.org/licenses/>.
import os
import json
from datetime import datetime
import logging
import sqlite3
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base
from dotenv import load_dotenv

load_dotenv()

# Set up logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger('db')

# Database configuration
DB_PATH = os.getenv('DB_PATH', 'sensor_data.db')
SQLALCHEMY_DATABASE_URL = os.getenv('DATABASE_URL')

# Create engine with better connection pool settings
engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    pool_size=30,  # Increase pool size
    max_overflow=50,  # Increase overflow
    pool_timeout=120,  # Increase timeout
    pool_recycle=1800,  # Recycle connections every 30 minutes
    pool_pre_ping=True,  # Validate connections before use
    echo=False  # Set to True for SQL debugging
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# def init_db():
#     """Initialize the database with required tables."""
#     try:
#         conn = sqlite3.connect(DB_PATH)
#         cursor = conn.cursor()
        
#         # Create blood pressure table
#         cursor.execute('''
#         CREATE TABLE IF NOT EXISTS blood_pressure (
#             id INTEGER PRIMARY KEY AUTOINCREMENT,
#             timestamp TEXT NOT NULL,
#             systolic INTEGER NOT NULL,
#             diastolic INTEGER NOT NULL,
#             map INTEGER NOT NULL,
#             raw_data TEXT NOT NULL,
#             created_at TEXT NOT NULL
#         )
#         ''')
        
#         # Create temperature table
#         cursor.execute('''
#         CREATE TABLE IF NOT EXISTS temperature (
#             id INTEGER PRIMARY KEY AUTOINCREMENT,
#             timestamp TEXT NOT NULL,
#             skin_temp REAL,
#             body_temp REAL,
#             raw_data TEXT NOT NULL,
#             created_at TEXT NOT NULL
#         )
#         ''')
        
#         # Create generic vitals table for other measurements
#         cursor.execute('''
#         CREATE TABLE IF NOT EXISTS vitals (
#             id INTEGER PRIMARY KEY AUTOINCREMENT,
#             timestamp TEXT NOT NULL,
#             vital_type TEXT NOT NULL,
#             value REAL NOT NULL,
#             notes TEXT,
#             created_at TEXT NOT NULL
#         )
#         ''')
        
#         # Create settings table
#         cursor.execute('''
#         CREATE TABLE IF NOT EXISTS settings (
#             key TEXT PRIMARY KEY,
#             value TEXT NOT NULL,
#             data_type TEXT NOT NULL,
#             description TEXT,
#             updated_at TEXT NOT NULL
#         )
#         ''')
        
#         # Create pulse ox continuous data log
#         cursor.execute('''
#         CREATE TABLE IF NOT EXISTS pulse_ox_data (
#             id INTEGER PRIMARY KEY AUTOINCREMENT,
#             timestamp TEXT NOT NULL,
#             spo2 INTEGER,
#             bpm INTEGER,
#             pa REAL,
#             status TEXT,
#             motion TEXT,
#             spo2_alarm TEXT,
#             hr_alarm TEXT,
#             raw_data TEXT,
#             created_at TEXT NOT NULL
#         )
#         ''')
        
#         # Create monitoring alerts table
#         cursor.execute('''
#         CREATE TABLE IF NOT EXISTS monitoring_alerts (
#             id INTEGER PRIMARY KEY AUTOINCREMENT,
#             start_time TEXT NOT NULL,
#             end_time TEXT,
#             start_data_id INTEGER,
#             end_data_id INTEGER,
#             acknowledged INTEGER DEFAULT 0,
            
#             -- Pulse Ox Metrics
#             spo2_min INTEGER,
#             bpm_min INTEGER,
#             spo2_max INTEGER,
#             bpm_max INTEGER,
#             spo2_alarm_triggered INTEGER DEFAULT 0,
#             hr_alarm_triggered INTEGER DEFAULT 0,
            
#             -- External Alarm Line
#             external_alarm_triggered INTEGER DEFAULT 0,
            
#             -- Oxygen Usage
#             oxygen_used INTEGER DEFAULT 0,      -- 0 = No, 1 = Yes
#             oxygen_highest FLOAT,               -- Max liters or percent
#             oxygen_unit TEXT,                   -- Example: "L/min" or "%"
            
#             created_at TEXT NOT NULL
#         )
#         ''')
        
#         # Create ventilator alerts table
#         cursor.execute('''
#         CREATE TABLE IF NOT EXISTS ventilator_alerts (
#             id INTEGER PRIMARY KEY AUTOINCREMENT,
#             device_id TEXT NOT NULL,
#             pin INTEGER NOT NULL,
#             start_time TEXT NOT NULL,
#             end_time TEXT,
#             last_activity TEXT NOT NULL,
#             acknowledged INTEGER DEFAULT 0,
#             notes TEXT,
#             created_at TEXT NOT NULL
#         )
#         ''')
        
#         # Create external alarms table for detailed tracking
#         cursor.execute('''
#         CREATE TABLE IF NOT EXISTS external_alarms (
#             id INTEGER PRIMARY KEY AUTOINCREMENT,
#             alert_id INTEGER,
#             device_id TEXT NOT NULL,
#             pin INTEGER NOT NULL,
#             start_time TEXT NOT NULL,
#             end_time TEXT,
#             last_activity TEXT NOT NULL,
#             acknowledged INTEGER DEFAULT 0,
#             created_at TEXT NOT NULL,
#             FOREIGN KEY (alert_id) REFERENCES monitoring_alerts(id)
#         )
#         ''')
        
#         # Create equipment table
#         cursor.execute('''
#         CREATE TABLE IF NOT EXISTS equipment (
#             id INTEGER PRIMARY KEY AUTOINCREMENT,
#             name TEXT NOT NULL,
#             last_changed TEXT NOT NULL,
#             useful_days INTEGER NOT NULL
#         )
#         ''')
        
#         # Create equipment change log table
#         cursor.execute('''
#         CREATE TABLE IF NOT EXISTS equipment_change_log (
#             id INTEGER PRIMARY KEY AUTOINCREMENT,
#             equipment_id INTEGER NOT NULL,
#             changed_at TEXT NOT NULL,
#             FOREIGN KEY (equipment_id) REFERENCES equipment(id)
#         )
#         ''')
        
#         conn.commit()
#         logger.info(f"Database initialized at {DB_PATH}")
#     except sqlite3.Error as e:
#         logger.error(f"Database initialization error: {e}")
#     finally:
#         if conn:
#             conn.close()

