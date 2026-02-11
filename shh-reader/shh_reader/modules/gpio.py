"""
GPIO Monitor Module for SHH Reader

Monitors external alarm relays via GPIO pins on Raspberry Pi.
Adapted from backend/modules/gpio_module.py for standalone operation.
"""

import asyncio
import logging
import threading
from datetime import datetime
from typing import Optional, Callable, List
from dataclasses import dataclass

logger = logging.getLogger('shh_reader.gpio')

# Try to import gpiod, gracefully handle if not available
try:
    import gpiod
    GPIO_AVAILABLE = True
except ImportError:
    GPIO_AVAILABLE = False
    logger.warning("gpiod not available - GPIO monitoring disabled")


@dataclass
class AlarmState:
    """Current state of alarm inputs"""
    timestamp: datetime
    alarm1: bool
    alarm2: bool
    alarm1_device: str = "vent"
    alarm2_device: str = "pulseox"


class GPIOMonitor:
    """
    GPIO monitor for external alarm relay contacts.
    
    Monitors configured GPIO pins for alarm states and emits events on change.
    Works with active-low relay contacts (LOW = alarm active).
    """
    
    def __init__(
        self,
        on_alarm: Callable[[AlarmState], None],
        on_status: Callable[[str, bool], None],  # (message, is_available)
        loop: Optional[asyncio.AbstractEventLoop] = None
    ):
        self.on_alarm = on_alarm
        self.on_status = on_status
        self.loop = loop or asyncio.get_event_loop()
        
        # Configuration
        self._alarm1_pins: List[int] = [17, 18, 27, 22]
        self._alarm2_pins: List[int] = [5, 6, 13, 19]
        self._alarm1_device: str = "vent"
        self._alarm2_device: str = "pulseox"
        self._alarm1_recovery: int = 30  # seconds
        self._alarm2_recovery: int = 30
        
        # State
        self._running = False
        self._thread: Optional[threading.Thread] = None
        self._chip = None
        self._lines = None
        
        # Current alarm state
        self._alarm1_active = False
        self._alarm2_active = False
        self._alarm1_clear_time: Optional[datetime] = None
        self._alarm2_clear_time: Optional[datetime] = None
    
    @staticmethod
    def is_available() -> bool:
        """Check if GPIO is available on this system"""
        if not GPIO_AVAILABLE:
            return False
        try:
            chip = gpiod.Chip('/dev/gpiochip0')
            chip.close()
            return True
        except:
            return False
    
    def configure(
        self,
        alarm1_pins: List[int] = None,
        alarm2_pins: List[int] = None,
        alarm1_device: str = None,
        alarm2_device: str = None,
        alarm1_recovery: int = None,
        alarm2_recovery: int = None
    ):
        """Configure GPIO settings"""
        if alarm1_pins is not None:
            self._alarm1_pins = alarm1_pins
        if alarm2_pins is not None:
            self._alarm2_pins = alarm2_pins
        if alarm1_device is not None:
            self._alarm1_device = alarm1_device
        if alarm2_device is not None:
            self._alarm2_device = alarm2_device
        if alarm1_recovery is not None:
            self._alarm1_recovery = alarm1_recovery
        if alarm2_recovery is not None:
            self._alarm2_recovery = alarm2_recovery
        
        logger.info(f"GPIO configured: alarm1={self._alarm1_device} pins={self._alarm1_pins}, "
                   f"alarm2={self._alarm2_device} pins={self._alarm2_pins}")
    
    def start(self):
        """Start the GPIO monitor thread"""
        if not GPIO_AVAILABLE:
            self._emit_status("GPIO not available on this system", False)
            return
        
        if self._running:
            return
        
        self._running = True
        self._thread = threading.Thread(target=self._monitor_loop, daemon=True)
        self._thread.start()
        logger.info("GPIO monitor started")
    
    def stop(self):
        """Stop the GPIO monitor"""
        self._running = False
        if self._thread:
            self._thread.join(timeout=2)
        if self._chip:
            try:
                self._chip.close()
            except:
                pass
        logger.info("GPIO monitor stopped")
    
    def _emit_alarm(self, state: AlarmState):
        """Emit alarm state via callback (thread-safe)"""
        if self.loop and self.on_alarm:
            self.loop.call_soon_threadsafe(lambda: self.on_alarm(state))
    
    def _emit_status(self, message: str, available: bool):
        """Emit status via callback (thread-safe)"""
        if self.loop and self.on_status:
            self.loop.call_soon_threadsafe(lambda: self.on_status(message, available))
    
    def _check_alarm_pins(self, pins: List[int]) -> bool:
        """
        Check if any alarm pin is active (LOW = active).
        
        Returns True if alarm is active.
        """
        if not self._chip:
            return False
        
        try:
            for pin in pins:
                line = self._chip.get_line(pin)
                line.request(consumer="shh-reader", type=gpiod.LINE_REQ_DIR_IN)
                value = line.get_value()
                line.release()
                if value == 0:  # Active low
                    return True
        except Exception as e:
            logger.debug(f"Error reading GPIO pin: {e}")
        
        return False
    
    def _process_alarm_state(self):
        """Check alarm states and emit if changed"""
        now = datetime.now()
        
        # Check alarm 1
        alarm1_raw = self._check_alarm_pins(self._alarm1_pins)
        if alarm1_raw:
            self._alarm1_active = True
            self._alarm1_clear_time = None
        elif self._alarm1_active:
            # Alarm was active, start recovery timer
            if self._alarm1_clear_time is None:
                self._alarm1_clear_time = now
            elif (now - self._alarm1_clear_time).total_seconds() >= self._alarm1_recovery:
                self._alarm1_active = False
                self._alarm1_clear_time = None
        
        # Check alarm 2
        alarm2_raw = self._check_alarm_pins(self._alarm2_pins)
        if alarm2_raw:
            self._alarm2_active = True
            self._alarm2_clear_time = None
        elif self._alarm2_active:
            if self._alarm2_clear_time is None:
                self._alarm2_clear_time = now
            elif (now - self._alarm2_clear_time).total_seconds() >= self._alarm2_recovery:
                self._alarm2_active = False
                self._alarm2_clear_time = None
        
        return AlarmState(
            timestamp=now,
            alarm1=self._alarm1_active,
            alarm2=self._alarm2_active,
            alarm1_device=self._alarm1_device,
            alarm2_device=self._alarm2_device
        )
    
    def _monitor_loop(self):
        """Main GPIO monitoring loop (runs in thread)"""
        last_state: Optional[AlarmState] = None
        
        while self._running:
            try:
                # Open GPIO chip
                self._chip = gpiod.Chip('/dev/gpiochip0')
                self._emit_status("GPIO monitoring active", True)
                logger.info("GPIO chip opened")
                
                while self._running:
                    state = self._process_alarm_state()
                    
                    # Emit if state changed
                    if last_state is None or \
                       state.alarm1 != last_state.alarm1 or \
                       state.alarm2 != last_state.alarm2:
                        self._emit_alarm(state)
                        last_state = state
                        logger.info(f"Alarm state changed: alarm1={state.alarm1}, alarm2={state.alarm2}")
                    
                    # Small delay between checks
                    import time
                    time.sleep(0.1)
                    
            except Exception as e:
                self._emit_status(f"GPIO error: {e}", False)
                logger.error(f"GPIO error: {e}")
                
            finally:
                if self._chip:
                    try:
                        self._chip.close()
                    except:
                        pass
                    self._chip = None
            
            # Wait before retry
            if self._running:
                import time
                time.sleep(5)
