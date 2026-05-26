"""Base class for vendor-specific ventilator log parsers."""
from typing import Any, Dict, Optional


class VentilatorParser:
    """
    Vendor parser interface.

    Concrete parsers set `model_slug` (matches the value stored in
    PatientIntegration.settings["model"]) and `model_label` (UI display name)
    and implement `parse()`, which returns the dict to be stored in
    `vent_imports.parser_summary`.

    The worker invokes us keyword-only so the constructor can grow without
    breaking subclasses.
    """
    model_slug: str = ""
    model_label: str = ""

    def __init__(
        self,
        *,
        import_id: str,
        archive_path: str,
        extracted_dir: str,
        db=None,
        patient_integration=None,
        vent_import=None,
    ):
        self.import_id = import_id
        self.archive_path = archive_path
        self.extracted_dir = extracted_dir
        self.db = db
        self.patient_integration = patient_integration
        self.vent_import = vent_import

    def parse(self) -> Dict[str, Any]:
        raise NotImplementedError
