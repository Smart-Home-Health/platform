"""
Serial Reader Module for SHH Reader

Reads pulse oximeter data from serial port and emits sensor events.
Adapted from backend/modules/serial_module.py for standalone operation.
"""

import asyncio
import logging
import re
import threading
from datetime import datetime
from typing import Optional, Callable, List, Tuple
from dataclasses import dataclass

import serial
import serial.tools.list_ports

logger = logging.getLogger('shh_reader.serial')


@dataclass
class SensorData:
    """Parsed sensor data from serial line"""
    timestamp: datetime
    spo2: int
    bpm: int
    perfusion: float
    status: Optional[str] = None
    raw: str = ""


class SerialReader:
    """
    Serial port reader for pulse oximeter data.
    
    Runs in a background thread for blocking I/O, publishes data via callback.
    """
    
    def __init__(
        self,
        on_data: Callable[[SensorData], None],
        on_status: Callable[[str, bool], None],  # (message, is_connected)
        loop: Optional[asyncio.AbstractEventLoop] = None
    ):
        self.on_data = on_data
        self.on_status = on_status
        self.loop = loop or asyncio.get_event_loop()
        
        self._port: Optional[str] = None
        self._baud: int = 115200
        self._serial: Optional[serial.Serial] = None
        self._running = False
        self._thread: Optional[threading.Thread] = None
        self._last_data_time: Optional[datetime] = None
        self._timeout_seconds = 10
        
    @staticmethod
    def scan_ports() -> List[Tuple[str, str]]:
        """
        Scan for available serial ports.
        
        Returns:
            List of (port, description) tuples
        """
        ports = []
        for port in serial.tools.list_ports.comports():
            ports.append((port.device, port.description))
        return ports
    
    @staticmethod
    def find_usb_serial() -> Optional[str]:
        """Find a USB serial adapter (cp210x or similar)"""
        for port in serial.tools.list_ports.comports():
            desc_lower = port.description.lower()
            if any(x in desc_lower for x in ['cp210', 'uart', 'usb', 'serial']):
                return port.device
        return None
    
    def sample_lines(self, port: str, baud: int, num_lines: int = 5, timeout: float = 5.0) -> List[str]:
        """
        Sample lines from a serial port for setup/testing.
        
        Args:
            port: Serial port path
            baud: Baud rate
            num_lines: Number of lines to capture
            timeout: Total timeout in seconds
            
        Returns:
            List of raw line strings
        """
        lines = []
        try:
            with serial.Serial(port, baud, timeout=1) as ser:
                start = datetime.now()
                while len(lines) < num_lines:
                    if (datetime.now() - start).total_seconds() > timeout:
                        break
                    line = ser.readline()
                    if line:
                        try:
                            decoded = line.decode('utf-8', errors='ignore').strip()
                            if decoded:
                                lines.append(decoded)
                        except:
                            pass
        except Exception as e:
            logger.error(f"Error sampling port {port}: {e}")
        return lines
    
    def parse_line(self, line: str) -> Optional[SensorData]:
        """
        Parse a line of pulse oximeter data.
        
        Expected format: "timestamp spo2 bpm perfusion [status]"
        Example: "26-Feb-09 12:34:56 97 72 3.5 OK"
        
        Returns:
            SensorData if parsed successfully, None otherwise
        """
        try:
            # Try to match the expected pattern
            # Pattern: date time spo2 bpm perfusion [status]
            parts = line.split()
            if len(parts) < 5:
                return None
            
            # Parse timestamp (first two parts)
            ts_str = f"{parts[0]} {parts[1]}"
            try:
                # Try common formats
                for fmt in ['%d-%b-%y %H:%M:%S', '%Y-%m-%d %H:%M:%S', '%m/%d/%Y %H:%M:%S']:
                    try:
                        timestamp = datetime.strptime(ts_str, fmt)
                        break
                    except ValueError:
                        continue
                else:
                    timestamp = datetime.now()
            except:
                timestamp = datetime.now()
            
            # Parse values
            spo2 = int(parts[2])
            bpm = int(parts[3])
            perfusion = float(parts[4])
            status = parts[5] if len(parts) > 5 else None
            
            # Validate ranges
            if not (0 <= spo2 <= 100):
                return None
            if not (0 <= bpm <= 300):
                return None
            
            return SensorData(
                timestamp=timestamp,
                spo2=spo2,
                bpm=bpm,
                perfusion=perfusion,
                status=status,
                raw=line
            )
            
        except (ValueError, IndexError) as e:
            logger.debug(f"Failed to parse line: {line} - {e}")
            return None
    
    def configure(self, port: str, baud: int = 115200):
        """Configure serial port settings"""
        self._port = port
        self._baud = baud
        logger.info(f"Serial configured: {port} @ {baud} baud")
    
    def start(self):
        """Start the serial reader thread"""
        if self._running:
            return
        
        if not self._port:
            logger.warning("Cannot start serial reader: no port configured")
            return
        
        self._running = True
        self._thread = threading.Thread(target=self._read_loop, daemon=True)
        self._thread.start()
        logger.info(f"Serial reader started on {self._port}")
    
    def stop(self):
        """Stop the serial reader"""
        self._running = False
        if self._serial:
            try:
                self._serial.close()
            except:
                pass
        if self._thread:
            self._thread.join(timeout=2)
        logger.info("Serial reader stopped")
    
    def _emit_data(self, data: SensorData):
        """Emit data via callback (thread-safe)"""
        if self.loop and self.on_data:
            self.loop.call_soon_threadsafe(lambda: self.on_data(data))
    
    def _emit_status(self, message: str, connected: bool):
        """Emit status via callback (thread-safe)"""
        if self.loop and self.on_status:
            self.loop.call_soon_threadsafe(lambda: self.on_status(message, connected))
    
    def _read_loop(self):
        """Main serial reading loop (runs in thread)"""
        while self._running:
            try:
                self._serial = serial.Serial(
                    self._port,
                    self._baud,
                    timeout=1
                )
                self._emit_status(f"Connected to {self._port}", True)
                logger.info(f"Serial port opened: {self._port}")
                
                while self._running:
                    # Check for timeout (no data)
                    if self._last_data_time:
                        elapsed = (datetime.now() - self._last_data_time).total_seconds()
                        if elapsed > self._timeout_seconds:
                            # Emit timeout values (-1)
                            self._emit_data(SensorData(
                                timestamp=datetime.now(),
                                spo2=-1,
                                bpm=-1,
                                perfusion=-1,
                                status="timeout",
                                raw=""
                            ))
                            self._last_data_time = datetime.now()
                    
                    # Read line
                    try:
                        line = self._serial.readline()
                        if line:
                            decoded = line.decode('utf-8', errors='ignore').strip()
                            if decoded:
                                data = self.parse_line(decoded)
                                if data:
                                    self._last_data_time = datetime.now()
                                    self._emit_data(data)
                    except serial.SerialException as e:
                        logger.error(f"Serial read error: {e}")
                        break
                        
            except serial.SerialException as e:
                self._emit_status(f"Connection failed: {e}", False)
                logger.error(f"Failed to open serial port: {e}")
                
            finally:
                if self._serial:
                    try:
                        self._serial.close()
                    except:
                        pass
                    self._serial = None
            
            # Wait before reconnecting
            if self._running:
                self._emit_status("Reconnecting...", False)
                for _ in range(50):  # 5 seconds with checks
                    if not self._running:
                        break
                    asyncio.get_event_loop().run_until_complete(asyncio.sleep(0.1))
