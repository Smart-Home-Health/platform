"""
NiceGUI Web Interface for SHH Reader

Provides setup wizard, live dashboard, and settings management.
"""

import asyncio
import logging
import secrets
from datetime import datetime
from typing import Optional

from nicegui import ui, app
from cryptography.fernet import Fernet
import httpx

from ..config import config_manager, ReaderConfig
from ..modules.serial import SerialReader, SensorData
from ..modules.gpio import GPIOMonitor, AlarmState
from ..cache.sqlite import cache_manager
from ..connection.client import HostConnection

logger = logging.getLogger('shh_reader.ui')


# Global state
class AppState:
    config: Optional[ReaderConfig] = None
    serial_reader: Optional[SerialReader] = None
    gpio_monitor: Optional[GPIOMonitor] = None
    host_connection: Optional[HostConnection] = None
    
    # Current values for display
    current_spo2: int = -1
    current_bpm: int = -1
    current_perfusion: float = -1
    current_alarm1: bool = False
    current_alarm2: bool = False
    serial_status: str = "Not configured"
    serial_connected: bool = False
    gpio_status: str = "Not configured"
    gpio_available: bool = False
    host_connected: bool = False
    host_status: str = "Not configured"
    cache_unsynced: int = 0


state = AppState()


# --- Event Handlers ---

def on_sensor_data(data: SensorData):
    """Handle incoming sensor data"""
    state.current_spo2 = data.spo2
    state.current_bpm = data.bpm
    state.current_perfusion = data.perfusion
    
    # Send to host (will cache if disconnected)
    if state.host_connection:
        asyncio.create_task(
            state.host_connection.send_sensor_data(
                data.spo2, data.bpm, data.perfusion, data.timestamp
            )
        )


def on_serial_status(message: str, connected: bool):
    """Handle serial status changes"""
    state.serial_status = message
    state.serial_connected = connected


def on_alarm_state(alarm: AlarmState):
    """Handle alarm state changes"""
    state.current_alarm1 = alarm.alarm1
    state.current_alarm2 = alarm.alarm2
    
    # Send to host
    if state.host_connection:
        asyncio.create_task(
            state.host_connection.send_alarm_state(
                alarm.alarm1, alarm.alarm2, alarm.timestamp
            )
        )


def on_gpio_status(message: str, available: bool):
    """Handle GPIO status changes"""
    state.gpio_status = message
    state.gpio_available = available


def on_host_status(status):
    """Handle host connection status changes"""
    state.host_connected = status.connected
    if status.connected:
        state.host_status = "Connected"
    elif status.last_error:
        state.host_status = status.last_error
    else:
        state.host_status = "Disconnected"


# --- UI Pages ---

@ui.page('/')
async def dashboard_page():
    """Main dashboard showing live vitals and status"""
    await config_manager.load()
    state.config = config_manager.config
    
    ui.dark_mode().enable()
    
    with ui.header().classes('bg-blue-900 text-white'):
        ui.label('SHH Reader').classes('text-xl font-bold')
        ui.space()
        with ui.row().classes('gap-4'):
            ui.link('Setup', '/setup').classes('text-white')
            ui.link('Settings', '/settings').classes('text-white')
    
    with ui.column().classes('w-full max-w-4xl mx-auto p-4 gap-4'):
        # Status Cards Row
        with ui.row().classes('w-full gap-4'):
            # Serial Status
            with ui.card().classes('flex-1'):
                ui.label('Serial').classes('text-sm text-gray-500')
                serial_status_label = ui.label().classes('text-lg')
                serial_indicator = ui.icon('circle').classes('text-2xl')
            
            # Host Status
            with ui.card().classes('flex-1'):
                ui.label('Host Connection').classes('text-sm text-gray-500')
                host_status_label = ui.label().classes('text-lg')
                host_indicator = ui.icon('circle').classes('text-2xl')
            
            # Cache Status
            with ui.card().classes('flex-1'):
                ui.label('Cache').classes('text-sm text-gray-500')
                cache_status_label = ui.label().classes('text-lg')
        
        # Vitals Display
        with ui.card().classes('w-full'):
            ui.label('Current Vitals').classes('text-xl font-bold mb-4')
            with ui.row().classes('w-full justify-around'):
                # SpO2
                with ui.column().classes('items-center'):
                    ui.label('SpO2').classes('text-gray-500')
                    spo2_label = ui.label('--').classes('text-5xl font-bold text-blue-400')
                    ui.label('%').classes('text-gray-500')
                
                # BPM
                with ui.column().classes('items-center'):
                    ui.label('Heart Rate').classes('text-gray-500')
                    bpm_label = ui.label('--').classes('text-5xl font-bold text-red-400')
                    ui.label('bpm').classes('text-gray-500')
                
                # Perfusion
                with ui.column().classes('items-center'):
                    ui.label('Perfusion').classes('text-gray-500')
                    perfusion_label = ui.label('--').classes('text-3xl font-bold text-green-400')
        
        # Alarms Display
        with ui.card().classes('w-full'):
            ui.label('Alarm Status').classes('text-xl font-bold mb-4')
            with ui.row().classes('w-full justify-around'):
                with ui.column().classes('items-center'):
                    ui.label(state.config.gpio_alarm1_device.upper() if state.config else 'ALARM 1').classes('text-gray-500')
                    alarm1_indicator = ui.icon('warning').classes('text-4xl')
                
                with ui.column().classes('items-center'):
                    ui.label(state.config.gpio_alarm2_device.upper() if state.config else 'ALARM 2').classes('text-gray-500')
                    alarm2_indicator = ui.icon('warning').classes('text-4xl')
    
    # Update loop
    async def update_display():
        while True:
            # Update vitals
            if state.current_spo2 >= 0:
                spo2_label.text = str(state.current_spo2)
            else:
                spo2_label.text = '--'
            
            if state.current_bpm >= 0:
                bpm_label.text = str(state.current_bpm)
            else:
                bpm_label.text = '--'
            
            if state.current_perfusion >= 0:
                perfusion_label.text = f'{state.current_perfusion:.1f}'
            else:
                perfusion_label.text = '--'
            
            # Update serial status
            serial_status_label.text = state.serial_status
            if state.serial_connected:
                serial_indicator.classes(replace='text-2xl text-green-500')
            else:
                serial_indicator.classes(replace='text-2xl text-gray-500')
            
            # Update host status
            host_status_label.text = state.host_status
            if state.host_connected:
                host_indicator.classes(replace='text-2xl text-green-500')
            else:
                host_indicator.classes(replace='text-2xl text-gray-500')
            
            # Update cache status
            state.cache_unsynced = await cache_manager.get_unsynced_count()
            cache_status_label.text = f'{state.cache_unsynced} pending'
            
            # Update alarms
            if state.current_alarm1:
                alarm1_indicator.classes(replace='text-4xl text-red-500')
            else:
                alarm1_indicator.classes(replace='text-4xl text-gray-600')
            
            if state.current_alarm2:
                alarm2_indicator.classes(replace='text-4xl text-red-500')
            else:
                alarm2_indicator.classes(replace='text-4xl text-gray-600')
            
            await asyncio.sleep(0.5)
    
    asyncio.create_task(update_display())


@ui.page('/setup')
async def setup_page():
    """Setup wizard for serial port configuration"""
    await config_manager.load()
    state.config = config_manager.config
    
    ui.dark_mode().enable()
    
    with ui.header().classes('bg-blue-900 text-white'):
        ui.label('SHH Reader - Setup').classes('text-xl font-bold')
        ui.space()
        ui.link('← Back', '/').classes('text-white')
    
    with ui.column().classes('w-full max-w-2xl mx-auto p-4 gap-4'):
        ui.label('Serial Port Configuration').classes('text-2xl font-bold')
        
        # Port Selection
        with ui.card().classes('w-full'):
            ui.label('1. Select Serial Port').classes('text-lg font-bold mb-2')
            
            ports = SerialReader.scan_ports()
            port_options = {p[0]: f"{p[0]} - {p[1]}" for p in ports}
            
            if not ports:
                ui.label('No serial ports found').classes('text-yellow-500')
                port_select = ui.select(options={}, label='Port').classes('w-full')
            else:
                default_port = state.config.serial_port or (ports[0][0] if ports else None)
                port_select = ui.select(
                    options=port_options,
                    value=default_port,
                    label='Port'
                ).classes('w-full')
            
            ui.button('Refresh Ports', on_click=lambda: ui.navigate.reload()).classes('mt-2')
        
        # Baud Rate
        with ui.card().classes('w-full'):
            ui.label('2. Select Baud Rate').classes('text-lg font-bold mb-2')
            
            baud_options = [9600, 19200, 38400, 57600, 115200, 230400]
            baud_select = ui.select(
                options=baud_options,
                value=state.config.serial_baud or 115200,
                label='Baud Rate'
            ).classes('w-full')
        
        # Sample Lines
        with ui.card().classes('w-full'):
            ui.label('3. Test Connection').classes('text-lg font-bold mb-2')
            ui.label('Sample lines from the serial port to verify settings:').classes('text-gray-500 mb-2')
            
            sample_output = ui.textarea(label='Sample Data').classes('w-full font-mono').props('readonly rows=6')
            
            async def do_sample():
                if not port_select.value:
                    ui.notify('Please select a port', type='warning')
                    return
                
                sample_output.value = 'Sampling...'
                await asyncio.sleep(0.1)  # Let UI update
                
                # Run in thread to not block
                reader = SerialReader(lambda x: None, lambda x, y: None)
                lines = await asyncio.get_event_loop().run_in_executor(
                    None,
                    reader.sample_lines,
                    port_select.value,
                    baud_select.value,
                    5,
                    5.0
                )
                
                if lines:
                    sample_output.value = '\n'.join(lines)
                    ui.notify(f'Received {len(lines)} lines', type='positive')
                else:
                    sample_output.value = 'No data received. Check port and baud rate.'
                    ui.notify('No data received', type='warning')
            
            ui.button('Sample Lines', on_click=do_sample).classes('mt-2')
        
        # Save
        with ui.card().classes('w-full'):
            async def save_config():
                await config_manager.save(
                    serial_port=port_select.value,
                    serial_baud=baud_select.value,
                    serial_enabled=True
                )
                ui.notify('Configuration saved!', type='positive')
                
                # Restart serial reader if running
                if state.serial_reader:
                    state.serial_reader.stop()
                    state.serial_reader.configure(port_select.value, baud_select.value)
                    state.serial_reader.start()
                
                await asyncio.sleep(1)
                ui.navigate.to('/')
            
            ui.button('Save & Start', on_click=save_config).classes('w-full').props('color=primary')


@ui.page('/settings')
async def settings_page():
    """Settings page for host connection and pairing"""
    await config_manager.load()
    state.config = config_manager.config
    
    ui.dark_mode().enable()
    
    with ui.header().classes('bg-blue-900 text-white'):
        ui.label('SHH Reader - Settings').classes('text-xl font-bold')
        ui.space()
        ui.link('← Back', '/').classes('text-white')
    
    with ui.column().classes('w-full max-w-2xl mx-auto p-4 gap-4'):
        # Device Info
        with ui.card().classes('w-full'):
            ui.label('Device Information').classes('text-lg font-bold mb-2')
            
            device_name = ui.input(
                label='Device Name',
                value=state.config.device_name
            ).classes('w-full')
            
            async def save_device_name():
                await config_manager.save(device_name=device_name.value)
                ui.notify('Device name saved', type='positive')
            
            ui.button('Save', on_click=save_device_name).classes('mt-2')
        
        # Pairing Status
        with ui.card().classes('w-full'):
            ui.label('Host Connection').classes('text-lg font-bold mb-2')
            
            if state.config.paired:
                ui.label(f'✓ Paired with: {state.config.host_url}').classes('text-green-500')
                ui.label(f'Paired at: {state.config.paired_at}').classes('text-gray-500 text-sm')
                
                async def unpair():
                    await config_manager.save(
                        paired=False,
                        host_url=None,
                        encryption_key=None,
                        paired_at=None
                    )
                    if state.host_connection:
                        await state.host_connection.stop()
                    ui.notify('Unpaired from host', type='info')
                    ui.navigate.reload()
                
                ui.button('Unpair', on_click=unpair).classes('mt-2').props('color=negative')
            else:
                ui.label('Not paired with any host').classes('text-yellow-500')
                ui.label('Use the host platform to initiate pairing with this reader.').classes('text-gray-500 text-sm mt-2')
                
                # Show pairing code if pending
                if state.config.pairing_pending and state.config.pairing_code:
                    with ui.card().classes('w-full bg-blue-900 mt-4'):
                        ui.label('Pairing Code').classes('text-lg font-bold')
                        ui.label(state.config.pairing_code).classes('text-4xl font-mono tracking-widest text-center py-4')
                        ui.label('Enter this code on the host to complete pairing').classes('text-sm text-gray-400')
        
        # GPIO Settings
        with ui.card().classes('w-full'):
            ui.label('GPIO Settings').classes('text-lg font-bold mb-2')
            
            gpio_enabled = ui.switch(
                'Enable GPIO Monitoring',
                value=state.config.gpio_enabled
            )
            
            with ui.row().classes('w-full gap-4'):
                alarm1_device = ui.input(
                    label='Alarm 1 Device',
                    value=state.config.gpio_alarm1_device
                ).classes('flex-1')
                alarm2_device = ui.input(
                    label='Alarm 2 Device',
                    value=state.config.gpio_alarm2_device
                ).classes('flex-1')
            
            async def save_gpio():
                await config_manager.save(
                    gpio_enabled=gpio_enabled.value,
                    gpio_alarm1_device=alarm1_device.value,
                    gpio_alarm2_device=alarm2_device.value
                )
                ui.notify('GPIO settings saved', type='positive')
            
            ui.button('Save GPIO Settings', on_click=save_gpio).classes('mt-2')
        
        # Cache Info
        with ui.card().classes('w-full'):
            ui.label('Cache Statistics').classes('text-lg font-bold mb-2')
            
            cache_stats_label = ui.label('Loading...').classes('font-mono text-sm')
            
            async def load_cache_stats():
                stats = await cache_manager.get_stats()
                cache_stats_label.text = (
                    f"Total: {stats['total']} | "
                    f"Unsynced: {stats['unsynced']} | "
                    f"Synced: {stats['synced']}"
                )
            
            asyncio.create_task(load_cache_stats())
            
            async def clear_synced():
                count = await cache_manager.clear_synced()
                ui.notify(f'Cleared {count} synced records', type='positive')
                await load_cache_stats()
            
            ui.button('Clear Synced Records', on_click=clear_synced).classes('mt-2')


# --- API Endpoints ---

from starlette.requests import Request

@app.get('/api/status')
async def get_status():
    """Get reader status"""
    return {
        'device_name': state.config.device_name if state.config else 'Unknown',
        'paired': state.config.paired if state.config else False,
        'serial': {
            'connected': state.serial_connected,
            'status': state.serial_status
        },
        'gpio': {
            'available': state.gpio_available,
            'status': state.gpio_status
        },
        'host': {
            'connected': state.host_connected,
            'status': state.host_status
        },
        'sensors': {
            'spo2': state.current_spo2,
            'bpm': state.current_bpm,
            'perfusion': state.current_perfusion
        },
        'alarms': {
            'alarm1': state.current_alarm1,
            'alarm2': state.current_alarm2
        },
        'cache_unsynced': state.cache_unsynced
    }

@app.post('/api/pair')
async def handle_pair_request(request: Request):
    """Handle pairing request from host"""
    import json
    body = await request.body()
    data = json.loads(body)
    
    host_url = data.get('host_url')
    encryption_key = data.get('encryption_key')
    
    if not host_url or not encryption_key:
        return {'error': 'Missing host_url or encryption_key'}
    
    # Generate pairing code
    code = ''.join([str(secrets.randbelow(10)) for _ in range(6)])
    
    # Store pending pairing
    await config_manager.save(
        pairing_pending=True,
        pairing_code=code
    )
    state.config = await config_manager.load()
    
    return {'code': code, 'device_name': state.config.device_name}


@app.post('/api/pair/confirm')
async def handle_pair_confirm(request: Request):
    """Confirm pairing with code"""
    import json
    body = await request.body()
    data = json.loads(body)
    
    code = str(data.get('code', ''))
    host_url = data.get('host_url')
    encryption_key = data.get('encryption_key')
    
    await config_manager.load()
    
    if not state.config.pairing_pending:
        return {'error': 'No pending pairing request'}
    
    # Compare as strings to handle type mismatch from JSON parsing
    if code != str(state.config.pairing_code):
        return {'error': 'Invalid pairing code'}
    
    # Complete pairing
    await config_manager.save(
        paired=True,
        host_url=host_url,
        encryption_key=encryption_key,
        paired_at=datetime.utcnow().isoformat(),
        pairing_pending=False,
        pairing_code=None
    )
    
    # Start host connection
    if state.host_connection:
        await state.host_connection.stop()
    
    state.host_connection = HostConnection(
        on_status_change=on_host_status
    )
    state.host_connection.configure(host_url, encryption_key, state.config.device_name)
    await state.host_connection.start()
    
    return {'success': True}


# --- App Startup ---

async def startup():
    """Initialize on app startup"""
    logger.info("Initializing SHH Reader...")
    
    # Initialize database
    await config_manager.load()
    await cache_manager.init_db()
    await cache_manager.start_purge_task()
    
    state.config = config_manager.config
    loop = asyncio.get_event_loop()
    
    # Start serial reader if configured
    if state.config.serial_enabled and state.config.serial_port:
        state.serial_reader = SerialReader(
            on_data=on_sensor_data,
            on_status=on_serial_status,
            loop=loop
        )
        state.serial_reader.configure(state.config.serial_port, state.config.serial_baud)
        state.serial_reader.start()
    
    # Start GPIO monitor if enabled
    if state.config.gpio_enabled and GPIOMonitor.is_available():
        state.gpio_monitor = GPIOMonitor(
            on_alarm=on_alarm_state,
            on_status=on_gpio_status,
            loop=loop
        )
        state.gpio_monitor.configure(
            alarm1_device=state.config.gpio_alarm1_device,
            alarm2_device=state.config.gpio_alarm2_device
        )
        state.gpio_monitor.start()
    
    # Start host connection if paired
    if state.config.paired and state.config.host_url and state.config.encryption_key:
        state.host_connection = HostConnection(
            on_status_change=on_host_status
        )
        state.host_connection.configure(
            state.config.host_url,
            state.config.encryption_key,
            state.config.device_name
        )
        await state.host_connection.start()
    
    logger.info("SHH Reader initialized")


async def shutdown():
    """Cleanup on app shutdown"""
    logger.info("Shutting down SHH Reader...")
    
    if state.serial_reader:
        state.serial_reader.stop()
    
    if state.gpio_monitor:
        state.gpio_monitor.stop()
    
    if state.host_connection:
        await state.host_connection.stop()
    
    await cache_manager.stop_purge_task()
    
    logger.info("SHH Reader shutdown complete")


def run_app(host: str = '0.0.0.0', port: int = 8080):
    """Run the NiceGUI application"""
    app.on_startup(startup)
    app.on_shutdown(shutdown)
    
    ui.run(
        host=host,
        port=port,
        title='SHH Reader',
        favicon='🏥',
        dark=True,
        reload=False
    )
