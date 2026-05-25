"""Ventilator log import integration.

Users configure this integration once per patient, pick a supported ventilator
model (VOCSN to start), then upload a tar/tar.gz export from the device.
The route layer extracts the archive and dispatches to the model-specific
parser in `ventilator_parsers/`.

No streaming sync, no auth — this integration exists to ingest periodic
file-based exports, not to talk to the device live. Real-time vent data still
comes through the existing shh-reader path.
"""
from datetime import datetime
from typing import Any, Dict, List, Optional

from .base import (
    AuthenticationError,
    BaseIntegration,
    DeviceInfo,
    SyncResult,
)
from .registry import register
from .ventilator_parsers import SUPPORTED_MODELS, get_parser


@register
class VentilatorIntegration(BaseIntegration):
    slug = "ventilator"
    name = "Ventilator"
    description = "Import ventilator log exports (e.g. VOCSN tar balls)."
    auth_type = "none"
    supported_vitals = []
    supports_import = True

    @classmethod
    def get_config_schema(cls) -> Dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "model": {
                    "type": "string",
                    "title": "Ventilator Model",
                    "description": "Which ventilator did this export come from?",
                    "enum": [m["value"] for m in SUPPORTED_MODELS],
                    "enumLabels": [m["label"] for m in SUPPORTED_MODELS],
                    "default": SUPPORTED_MODELS[0]["value"] if SUPPORTED_MODELS else None,
                },
            },
            "required": ["model"],
        }

    async def authenticate(self, auth_data: Dict[str, Any]) -> Dict[str, Any]:
        # No credentials needed; activation is just "I chose a model".
        model = (auth_data or {}).get("model") or (self.settings or {}).get("model")
        if not model:
            raise AuthenticationError("Ventilator model is required")
        if model not in {m["value"] for m in SUPPORTED_MODELS}:
            raise AuthenticationError(f"Unsupported ventilator model: {model}")
        return {"authenticated": True, "type": "ventilator", "model": model}

    async def refresh_credentials(self) -> Dict[str, Any]:
        return {"authenticated": True, "type": "ventilator"}

    async def fetch_devices(self) -> List[DeviceInfo]:
        return []

    async def sync_data(
        self,
        since: Optional[datetime] = None,
        device_ids: Optional[List[str]] = None,
    ) -> SyncResult:
        return SyncResult(
            success=True,
            readings_count=0,
            readings=[],
            error_message="Ventilator integration ingests via file upload — no streaming sync.",
            sync_timestamp=datetime.utcnow(),
        )

    async def test_connection(self) -> bool:
        return True

    def import_file(self, *, import_id: str, archive_path: str, extracted_dir: str,
                    db=None, patient_integration=None, vent_import=None) -> Dict[str, Any]:
        """Extract → dispatch to the model parser. Settings carry the model slug."""
        settings = self.settings or {}
        model = settings.get("model")
        # Be forgiving when the model is missing: if exactly one parser is
        # registered, use it. The frontend should always send a model, but old
        # PatientIntegration rows created before the model field existed (or
        # before the form bug fix that landed alongside this code) end up with
        # empty settings.
        if not model:
            if len(SUPPORTED_MODELS) == 1:
                model = SUPPORTED_MODELS[0]["value"]
            else:
                raise ValueError("No ventilator model configured for this integration")
        try:
            parser_cls = get_parser(model)
        except KeyError:
            raise ValueError(f"No parser registered for ventilator model '{model}'")
        parser = parser_cls(
            import_id=import_id,
            archive_path=archive_path,
            extracted_dir=extracted_dir,
            db=db,
            patient_integration=patient_integration,
            vent_import=vent_import,
        )
        return parser.parse()
