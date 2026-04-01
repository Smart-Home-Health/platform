"""
MQTT configuration and management routes
"""
import logging
import time
import os
from datetime import datetime
from fastapi import APIRouter, Depends, Body, HTTPException
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session, joinedload
from db import get_db
from crud.settings import get_setting, save_setting
from crud.patients import get_patient
from mqtt import send_mqtt_discovery
from models.mqtt import (
    MQTTSettings,
    MQTTConnectionTest,
    MQTTDiscoveryRequest,
    MQTTSettingsResponse,
    MQTTPatientConfigUpdate,
    MQTTPatientConfigResponse,
)
from schemas.patient import Patient
from schemas.integration import Integration as IntegrationModel, PatientIntegration
from integrations import get_integration
from dependencies import require_full_auth, get_current_account_id, require_read_access

logger = logging.getLogger("app")

router = APIRouter(prefix="/api/mqtt", tags=["mqtt"])


def _get_or_create_mqtt_integration(db: Session) -> IntegrationModel:
    """Ensure MQTT integration row exists (created from registry)."""
    integration = db.query(IntegrationModel).filter(IntegrationModel.slug == "mqtt").first()
    if not integration:
        integration_class = get_integration("mqtt")
        if not integration_class:
            raise HTTPException(status_code=500, detail="MQTT integration not registered")
        now = datetime.utcnow()
        integration = IntegrationModel(
            name=integration_class.name,
            slug=integration_class.slug,
            description=integration_class.description,
            auth_type=integration_class.auth_type,
            config_schema=integration_class.get_config_schema(),
            supported_vitals=integration_class.supported_vitals,
            is_active=True,
            created_at=now,
            updated_at=now,
        )
        db.add(integration)
        db.commit()
        db.refresh(integration)
    return integration


def get_default_mqtt_topics():
    """Get default MQTT topic configuration"""
    return {
        'spo2': {
            'enabled': True,
            'broadcast_topic': 'shh/spo2/state',
            'listen_topic': 'shh/spo2/set'
        },
        'bpm': {
            'enabled': True,
            'broadcast_topic': 'shh/bpm/state',
            'listen_topic': 'shh/bpm/set'
        },
        'perfusion': {
            'enabled': True,
            'broadcast_topic': 'shh/perfusion/state',
            'listen_topic': 'shh/perfusion/set'
        },
        'blood_pressure': {
            'enabled': True,
            'broadcast_topic': 'shh/bp/state',
            'listen_topic': 'shh/bp/set'
        },
        'temperature': {
            'enabled': True,
            'broadcast_topic': 'shh/temp/state',
            'listen_topic': 'shh/temp/set'
        },
        'nutrition': {
            'enabled': False,
            'water_broadcast_topic': 'shh/water/state',
            'water_listen_topic': 'shh/water/set',
            'calories_broadcast_topic': 'shh/calories/state',
            'calories_listen_topic': 'shh/calories/set'
        },
        'weight': {
            'enabled': False,
            'broadcast_topic': 'shh/weight/state',
            'listen_topic': 'shh/weight/set'
        },
        'bathroom': {
            'enabled': False,
            'broadcast_topic': 'shh/bathroom/state',
            'listen_topic': 'shh/bathroom/set'
        },
        'spo2_alarm': {
            'enabled': True,
            'broadcast_topic': 'shh/alarms/spo2',
            'listen_topic': 'shh/alarms/spo2/set'
        },
        'bpm_alarm': {
            'enabled': True,
            'broadcast_topic': 'shh/alarms/bpm',
            'listen_topic': 'shh/alarms/bpm/set'
        },
        'alarm1': {
            'enabled': True,
            'broadcast_topic': 'shh/alarms/gpio1',
            'listen_topic': 'shh/alarms/gpio1/set'
        },
        'alarm2': {
            'enabled': True,
            'broadcast_topic': 'shh/alarms/gpio2',
            'listen_topic': 'shh/alarms/gpio2/set'
        }
    }


@router.get("/settings", response_model=MQTTSettingsResponse)
async def get_mqtt_settings(db: Session = Depends(get_db)):
    """Get current MQTT settings"""
    try:
        settings = {}
        mqtt_keys = [
            'mqtt_enabled', 'mqtt_broker', 'mqtt_port', 'mqtt_username', 
            'mqtt_password', 'mqtt_client_id', 'mqtt_discovery_enabled', 
            'mqtt_test_mode', 'mqtt_base_topic'
        ]
        
        for key in mqtt_keys:
            settings[key] = get_setting(db, key)
        
        # Load topic configurations
        topics_setting = get_setting(db, 'mqtt_topics')
        default_topics = get_default_mqtt_topics()
        merged_topics = default_topics.copy()
        if topics_setting is not None:
            import json
            try:
                saved_topics = json.loads(topics_setting) if isinstance(topics_setting, str) else topics_setting
                merged_topics.update(saved_topics)
            except (json.JSONDecodeError, TypeError):
                pass
        settings['topics'] = merged_topics
        
        return settings
    except Exception as e:
        logger.error(f"Error getting MQTT settings: {e}")
        return JSONResponse(
            status_code=500,
            content={"detail": f"Error retrieving MQTT settings: {str(e)}"}
        )


@router.post("/settings")
async def save_mqtt_settings(settings: MQTTSettings, db: Session = Depends(get_db)):
    """Save MQTT settings"""
    try:
        # Convert to dict and filter out None values
        settings_dict = {k: v for k, v in settings.model_dump().items() if v is not None}
        
        # Save basic MQTT settings with proper data types
        for key, value in settings_dict.items():
            if key != 'topics':  # Handle topics separately
                # Determine data type
                if key in ['mqtt_enabled', 'mqtt_discovery_enabled', 'mqtt_test_mode']:
                    data_type = 'bool'
                elif key == 'mqtt_port':
                    data_type = 'int'
                else:
                    data_type = 'string'
                save_setting(db, key, value, data_type)
        
        # Save topic configurations as JSON
        if 'topics' in settings_dict:
            import json
            save_setting(db, 'mqtt_topics', json.dumps(settings_dict['topics']), 'json')
        
        # Restart MQTT connection with new settings if MQTT is enabled
        restart_result = await restart_mqtt_if_enabled(db)
        
        return {"message": "MQTT settings saved successfully", "mqtt_restart": restart_result}
    except Exception as e:
        logger.error(f"Error saving MQTT settings: {e}")
        return JSONResponse(
            status_code=500,
            content={"detail": f"Error saving MQTT settings: {str(e)}"}
        )


async def restart_mqtt_if_enabled(db: Session):
    """Restart MQTT connection if enabled in settings"""
    import asyncio
    from main import get_modules, mqtt_update_bridge
    from mqtt.settings import is_mqtt_enabled
    from mqtt.service import get_mqtt_service, shutdown_mqtt_service

    try:
        modules = get_modules()
        mqtt_module = modules.get("mqtt")

        if not is_mqtt_enabled():
            shutdown_mqtt_service()
            if mqtt_module:
                mqtt_module.set_mqtt_components(None, None)
            return "MQTT disabled - stopped"

        # Shutdown existing connection
        shutdown_mqtt_service()

        # Re-initialize with current settings
        loop = asyncio.get_event_loop()
        service = get_mqtt_service()
        mqtt_manager, mqtt_publisher = service.initialize(loop, mqtt_update_bridge)

        if mqtt_manager and mqtt_publisher and mqtt_module:
            mqtt_module.set_mqtt_components(mqtt_manager, mqtt_publisher)
            await mqtt_module.start_event_subscribers()
            return "MQTT restarted successfully"
        else:
            return "MQTT initialization failed - check settings"

    except Exception as e:
        logger.error(f"Error restarting MQTT: {e}")
        return f"Error: {str(e)}"


@router.post("/test-connection")
async def test_mqtt_connection(settings: MQTTConnectionTest):
    """Test MQTT connection with provided settings"""
    try:
        import paho.mqtt.client as mqtt
        
        broker = settings.mqtt_broker
        port = settings.mqtt_port
        client_id = settings.mqtt_client_id
        username = settings.mqtt_username
        password = settings.mqtt_password
        
        logger.info(f"Testing MQTT connection to {broker}:{port} with client_id={client_id}")
        
        test_client = mqtt.Client(client_id=client_id)
        
        # Set credentials if provided
        if username and password:
            test_client.username_pw_set(username, password)
        
        connection_result = {"connected": False, "error": None}
        
        def on_connect(client, userdata, flags, rc):
            if rc == 0:
                connection_result["connected"] = True
                logger.info(f"MQTT test connection successful to {broker}:{port}")
            else:
                error_codes = {
                    1: "Connection refused - incorrect protocol version",
                    2: "Connection refused - invalid client identifier",
                    3: "Connection refused - server unavailable",
                    4: "Connection refused - bad username or password",
                    5: "Connection refused - not authorized"
                }
                error_msg = error_codes.get(rc, f"Unknown error code {rc}")
                connection_result["error"] = error_msg
                logger.error(f"MQTT test connection failed: {error_msg}")
        
        def on_disconnect(client, userdata, rc):
            connection_result["connected"] = False
        
        test_client.on_connect = on_connect
        test_client.on_disconnect = on_disconnect
        
        # Try to connect with longer timeout
        logger.info(f"Attempting connection to {broker}:{port}...")
        test_client.connect(broker, port, 60)  # 60 second keepalive
        test_client.loop_start()
        
        # Wait longer for connection attempt (some brokers are slow)
        import time
        max_wait = 5  # Wait up to 5 seconds
        waited = 0
        while waited < max_wait and not connection_result["connected"] and not connection_result["error"]:
            time.sleep(0.5)
            waited += 0.5
        
        test_client.loop_stop()
        
        if connection_result["connected"]:
            test_client.disconnect()
            logger.info("MQTT test connection successful")
            return {"status": "success", "message": "MQTT connection successful"}
        else:
            error_msg = connection_result["error"] or "Connection timed out - broker may be unreachable"
            logger.warning(f"MQTT test failed: {error_msg}")
            return JSONResponse(status_code=400, content={"detail": error_msg})
            
    except Exception as e:
        logger.error(f"Error testing MQTT connection: {e}")
        return JSONResponse(
            status_code=500,
            content={"detail": f"Error testing MQTT connection: {str(e)}"}
        )


@router.get("/patients", response_model=list[MQTTPatientConfigResponse])
async def list_mqtt_patients(
    db: Session = Depends(get_db),
    _: bool = Depends(require_full_auth),
    __: bool = Depends(require_read_access),
    account_id: int = Depends(get_current_account_id),
):
    """
    List all patients with their MQTT config (enabled, sections).
    Used by admin Configuration > MQTT to show per-patient enable and section permissions.
    """
    mqtt_integration = _get_or_create_mqtt_integration(db)
    patients = db.query(Patient).filter(
        Patient.account_id == account_id,
        Patient.is_active == True,
    ).all()
    out = []
    for p in patients:
        pi = (
            db.query(PatientIntegration)
            .filter(
                PatientIntegration.patient_id == p.id,
                PatientIntegration.integration_id == mqtt_integration.id,
                PatientIntegration.account_id == account_id,
            )
            .first()
        )
        settings = (pi.settings or {}) if pi else {}
        enabled = settings.get("enabled", False) if pi and pi.is_enabled else False
        sections = settings.get("sections") or {}
        out.append(
            MQTTPatientConfigResponse(
                patient_id=p.id,
                patient_name=f"{p.first_name} {p.last_name}".strip() or None,
                enabled=enabled,
                sections=sections,
                integration_id=pi.id if pi else None,
            )
        )
    return out


@router.put("/patients/{patient_id}", response_model=MQTTPatientConfigResponse)
async def update_mqtt_patient_config(
    patient_id: int,
    body: MQTTPatientConfigUpdate,
    db: Session = Depends(get_db),
    _: bool = Depends(require_full_auth),
    account_id: int = Depends(get_current_account_id),
):
    """
    Create or update MQTT config for a patient (enable + section permissions).
    Creates or updates PatientIntegration for slug 'mqtt'.
    """
    patient = db.query(Patient).filter(
        Patient.id == patient_id,
        Patient.account_id == account_id,
    ).first()
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")
    mqtt_integration = _get_or_create_mqtt_integration(db)
    pi = (
        db.query(PatientIntegration)
        .filter(
            PatientIntegration.patient_id == patient_id,
            PatientIntegration.integration_id == mqtt_integration.id,
            PatientIntegration.account_id == account_id,
        )
        .first()
    )
    now = datetime.utcnow()
    settings = (pi.settings or {}).copy() if pi else {}
    settings["enabled"] = body.enabled
    settings["sections"] = body.sections or {}
    if not pi:
        pi = PatientIntegration(
            account_id=account_id,
            patient_id=patient_id,
            integration_id=mqtt_integration.id,
            settings=settings,
            is_enabled=body.enabled,
            created_at=now,
            updated_at=now,
        )
        db.add(pi)
    else:
        pi.settings = settings
        pi.is_enabled = body.enabled
        pi.updated_at = now
    db.commit()
    db.refresh(pi)
    return MQTTPatientConfigResponse(
        patient_id=patient_id,
        patient_name=f"{patient.first_name} {patient.last_name}".strip() or None,
        enabled=body.enabled,
        sections=settings.get("sections") or {},
        integration_id=pi.id,
    )


@router.post("/send-discovery")
async def send_mqtt_discovery_endpoint(request: MQTTDiscoveryRequest):
    """Send MQTT discovery messages to Home Assistant. Optional patient_id = that patient only."""
    try:
        test_mode = request.test_mode
        patient_id = request.patient_id
        
        # Get the MQTT manager from modules
        from main import get_modules
        modules = get_modules()
        mqtt_module = modules.get("mqtt")
        
        if mqtt_module and mqtt_module.mqtt_manager and mqtt_module.mqtt_manager.is_connected():
            send_mqtt_discovery(mqtt_module.mqtt_manager.client, test_mode=test_mode, patient_id=patient_id)
            return {"message": "MQTT discovery messages sent successfully"}
        else:
            return JSONResponse(
                status_code=400,
                content={"detail": "MQTT client not connected"}
            )
            
    except Exception as e:
        logger.error(f"Error sending MQTT discovery: {e}")
        return JSONResponse(
            status_code=500,
            content={"detail": f"Error sending MQTT discovery: {str(e)}"}
        )
