# modules/serial_module.py
"""
Serial communication module - manages serial port connections and publishes sensor data events.
"""
import asyncio
import os
import time
import serial
from serial.tools import list_ports
from typing import Optional
from datetime import datetime
import logging
import threading

from bus import EventBus
from events import SensorUpdate, SerialConnectionEvent, EventSource

logger = logging.getLogger("serial_module")

class SerialModule:
    """Manages serial port communication and publishes sensor data events."""
    
    def __init__(self, event_bus: EventBus, loop: asyncio.AbstractEventLoop):
        self.event_bus = event_bus
        self.loop = loop
        self.serial_connection: Optional[serial.Serial] = None
        self.is_connected = False
        self.is_running = False
        self.current_port = None
        self.default_baud_rate = 115200  # Default fallback
        
        # Thread for blocking serial operations
        self.serial_thread: Optional[threading.Thread] = None
        
        # Timeout tracking for missing data
        self.last_data_time = time.time()
        self.timeout_seconds = 10  # Send -1 values after 10 seconds of no data
        
    def test_raw_serial_read(self) -> str:
        """Test method to read raw data from serial port for debugging."""
        if not self.serial_connection or not self.is_connected:
            return "No serial connection"
        
        try:
            # Try different read methods
            if self.serial_connection.in_waiting > 0:
                # Read all available bytes
                raw_bytes = self.serial_connection.read(self.serial_connection.in_waiting)
                return f"Raw bytes: {raw_bytes} | Decoded: '{raw_bytes.decode('utf-8', errors='ignore')}'"
            else:
                return "No data waiting in buffer"
        except Exception as e:
            return f"Error reading: {e}"

    def get_baud_rate(self) -> int:
        """Get baud rate from settings or use default."""
        try:
            from crud.settings import get_setting
            from db import get_db
            db = next(get_db())
            val = get_setting(db, "baud_rate", self.default_baud_rate)
            logger.info(f"Retrieved baud_rate from settings: {val} (type: {type(val)})")
            db.close()
            try:
                baud_rate = int(val)
                logger.info(f"Using baud rate: {baud_rate}")
                return baud_rate
            except (ValueError, TypeError):
                logger.warning(f"Invalid baud_rate value from settings: {val}, using default: {self.default_baud_rate}")
                return self.default_baud_rate
        except Exception as e:
            logger.warning(f"Error getting baud_rate from settings: {e}, using default: {self.default_baud_rate}")
            return self.default_baud_rate

    def find_serial_port(self) -> Optional[str]:
        """Scan for compatible serial ports."""
        ports = list_ports.comports()
        for port in ports:
            desc = port.description.lower()
            if "cp210" in desc or "uart" in desc:
                logger.info(f"Found serial device: {port.device} ({desc})")
                return port.device
        
        logger.warning("No compatible serial device found")
        return None

    def connect_serial(self) -> Optional[serial.Serial]:
        """Attempt to connect to a serial port."""
        port = self.find_serial_port()
        if not port:
            return None
            
        try:
            baud_rate = self.get_baud_rate()
            logger.info(f"Attempting to connect to {port} at {baud_rate} baud")
            # Use explicit serial parameters like the working version
            ser = serial.Serial(
                port, 
                baud_rate, 
                timeout=1, 
                rtscts=False,  # Disable RTS/CTS flow control
                dsrdtr=False   # Disable DTR/DSR flow control
            )
            logger.info(f"Connected to serial port {port} at {baud_rate} baud")
            return ser
        except Exception as e:
            logger.error(f"Failed to connect to serial port {port}: {e}")
            return None

    def publish_connection_event(self, connected: bool, port: Optional[str] = None, error: Optional[str] = None):
        """Publish a serial connection event."""
        try:
            event = SerialConnectionEvent(
                ts=datetime.now(),
                connected=connected,
                port=port,
                error=error,
                source=EventSource.SERIAL
            )
            
            # Use thread-safe call to publish from the serial thread
            future = asyncio.run_coroutine_threadsafe(
                self.event_bus.publish(event, topic="serial.connection"),
                self.loop
            )
            future.result(timeout=2.0)  # Increased timeout
            logger.debug(f"Published connection event: connected={connected}, port={port}")
        except asyncio.TimeoutError:
            logger.warning("Timeout publishing connection event - event bus may be overloaded")
        except Exception as e:
            logger.error(f"Failed to publish connection event: {e}")
            # Continue execution - don't let publishing failures stop the module

    def publish_sensor_data(self, sensor_data: dict, raw_line: str):
        """Publish sensor data event."""
        try:
            event = SensorUpdate(
                ts=datetime.now(),
                values=sensor_data,
                raw=raw_line,
                source=EventSource.SERIAL
            )
            
            # Update last data time when we have real data
            self.last_data_time = time.time()
            
            # Use thread-safe call to publish from the serial thread
            future = asyncio.run_coroutine_threadsafe(
                self.event_bus.publish(event, topic="sensors.update"),
                self.loop
            )
            future.result(timeout=2.0)  # Increased timeout
            logger.debug(f"Published sensor data: {sensor_data}")
        except asyncio.TimeoutError:
            logger.warning("Timeout publishing sensor data - event bus may be overloaded")
        except Exception as e:
            logger.error(f"Failed to publish sensor data: {e}")
            # Continue execution - don't let publishing failures stop the module

    def publish_timeout_data(self):
        """Publish -1 values when no data received for timeout period."""
        try:
            timeout_data = {
                "spo2": -1,
                "bpm": -1,
                "perfusion": -1,
                "status": "timeout"
            }
            
            event = SensorUpdate(
                ts=datetime.now(),
                values=timeout_data,
                raw="TIMEOUT - No data received",
                source=EventSource.SERIAL
            )
            
            # Use thread-safe call to publish from the serial thread
            future = asyncio.run_coroutine_threadsafe(
                self.event_bus.publish(event, topic="sensors.update"),
                self.loop
            )
            future.result(timeout=2.0)  # Increased timeout
            logger.info("Published timeout values (-1) due to no serial data")
        except asyncio.TimeoutError:
            logger.warning("Timeout publishing timeout data - event bus may be overloaded")
        except Exception as e:
            logger.error(f"Failed to publish timeout data: {e}")
            # Continue execution - don't let publishing failures stop the timeout mechanism

    def check_data_timeout(self):
        """Check if we should send timeout values."""
        if time.time() - self.last_data_time > self.timeout_seconds:
            self.publish_timeout_data()
            # Reset timer to avoid spamming timeout messages
            self.last_data_time = time.time() - self.timeout_seconds + 5  # Send again in 5 seconds

    def parse_pulse_ox_line(self, raw_line: str) -> Optional[dict]:
        """Parse a pulse oximeter data line."""
        logger.debug(f"Parsing line: '{raw_line}' (length: {len(raw_line)})")
        parts = raw_line.strip().split()
        logger.debug(f"Split into {len(parts)} parts: {parts}")
        
        if len(parts) < 5:
            logger.debug(f"Skipping invalid line - need at least 5 parts, got {len(parts)}: {raw_line}")
            return None

        timestamp = f"{parts[0]} {parts[1]}"
        spo2_str = parts[2].rstrip("*")
        bpm_str = parts[3].rstrip("*")
        pa_str = parts[4]
        status = parts[5] if len(parts) > 5 else None

        logger.debug(f"Extracted values - spo2_str: '{spo2_str}', bpm_str: '{bpm_str}', pa_str: '{pa_str}', status: '{status}'")

        sensor_data = {}

        if spo2_str.isdigit():
            sensor_data["spo2"] = int(spo2_str)

        if bpm_str.isdigit():
            sensor_data["bpm"] = int(bpm_str)

        try:
            perf = float(pa_str)
            sensor_data["perfusion"] = perf
        except ValueError:
            logger.debug(f"Could not parse perfusion value: '{pa_str}'")
            pass

        if status:
            sensor_data["status"] = status

        if sensor_data:
            logger.debug(f"Parsed sensor data: {sensor_data}")
            return sensor_data
        else:
            logger.warning(f"No valid sensor data extracted from line: '{raw_line}'")
        
        return None

    def serial_worker(self):
        """Worker thread for reading serial data."""
        logger.info("Serial worker thread started")
        
        # Initialize the timer
        self.last_data_time = time.time()
        
        while self.is_running:
            try:
                # Check for data timeout regardless of connection status
                self.check_data_timeout()
                
                # Try to connect if not connected
                if not self.serial_connection:
                    self.serial_connection = self.connect_serial()
                    if self.serial_connection:
                        self.is_connected = True
                        self.current_port = self.serial_connection.name
                        self.publish_connection_event(True, self.current_port)
                    else:
                        self.is_connected = False
                        self.current_port = None
                        if self.is_running:  # Only publish if we're still supposed to be running
                            self.publish_connection_event(False, error="No port found")
                        time.sleep(5)  # Wait before trying again
                        continue

                # Read data from serial port
                try:
                    # Use ascii decoding like the working version
                    raw_line = self.serial_connection.readline().decode('ascii', errors='ignore').strip()
                    if raw_line:
                        logger.info(f"Received raw data: '{raw_line}' (length: {len(raw_line)})")
                        
                        # Parse the data
                        sensor_data = self.parse_pulse_ox_line(raw_line)
                        if sensor_data:
                            self.publish_sensor_data(sensor_data, raw_line)
                        else:
                            logger.warning(f"Failed to parse line: '{raw_line}'")
                    # Remove the debug message for empty reads to reduce log noise
                        
                except serial.SerialException as e:
                    logger.warning(f"Serial exception: {e}")
                    self.is_connected = False
                    self.publish_connection_event(False, self.current_port, str(e))
                    try:
                        self.serial_connection.close()
                    except:
                        pass
                    self.serial_connection = None
                    time.sleep(2)
                    
            except Exception as e:
                logger.error(f"Unexpected error in serial worker: {e}")
                time.sleep(1)

        # Cleanup on exit
        if self.serial_connection:
            try:
                self.serial_connection.close()
            except:
                pass
            self.serial_connection = None
            self.is_connected = False
            self.publish_connection_event(False)
        
        logger.info("Serial worker thread stopped")

    def start(self):
        """Start the serial module."""
        if self.is_running:
            logger.warning("Serial module already running")
            return
            
        self.is_running = True
        self.serial_thread = threading.Thread(target=self.serial_worker, daemon=True)
        self.serial_thread.start()
        logger.info("Serial module started")

    def stop(self):
        """Stop the serial module."""
        self.is_running = False
        if self.serial_thread:
            self.serial_thread.join(timeout=5.0)
        logger.info("Serial module stopped")

    def reconnect(self):
        """Reconnect the serial port (useful when baud rate changes)."""
        logger.info("Reconnecting serial port...")
        if self.serial_connection:
            try:
                self.serial_connection.close()
                logger.info("Closed existing serial connection")
            except Exception as e:
                logger.warning(f"Error closing serial connection: {e}")
            self.serial_connection = None
            self.is_connected = False
        
        # The serial_worker thread will automatically reconnect with new settings
        logger.info("Serial port will reconnect with updated settings")

    def get_status(self) -> dict:
        """Get current status of the serial module."""
        return {
            "connected": self.is_connected,
            "port": self.current_port,
            "baud_rate": self.get_baud_rate(),
            "running": self.is_running
        }
