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
