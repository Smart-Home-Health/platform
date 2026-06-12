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
"""
On-hand quantity guard for medication administration.

Administering a dose larger than what's on hand (e.g. giving a med whose
quantity is 0) is refused; the caller must update the on-hand quantity first.
A medication with `quantity is None` is treated as not inventory-tracked and is
left ungated.
"""
from typing import Optional

from fastapi.responses import JSONResponse


def is_insufficient_quantity(med, dose) -> bool:
    """True when `dose` (>0) exceeds the medication's tracked on-hand quantity."""
    if dose is None or float(dose) <= 0:
        return False
    if med is None or med.quantity is None:
        return False  # untracked inventory — not gated
    return float(med.quantity) < float(dose)


def insufficient_quantity_response(med, dose) -> Optional[JSONResponse]:
    """Return a 409 the frontend uses to open the "update quantity" gate, or
    None when the administration may proceed."""
    if not is_insufficient_quantity(med, dose):
        return None
    return JSONResponse(
        status_code=409,
        content={
            "detail": (
                f"{med.name} has only {med.quantity} {med.quantity_unit or ''}".rstrip()
                + f" on hand, but the dose is {dose}. Update the on-hand quantity to continue."
            ),
            "error": "insufficient_quantity",
            "medication_id": med.id,
            "medication_name": med.name,
            "current_quantity": med.quantity,
            "quantity_unit": med.quantity_unit,
            "requested_dose": dose,
        },
    )


class InsufficientMedicationQuantityError(Exception):
    """Raised by administer_medication when on-hand quantity is below the dose.

    Carries the medication and dose so the route layer can build the matching
    `insufficient_quantity_response`.
    """

    def __init__(self, med, dose):
        self.medication = med
        self.dose = dose
        super().__init__(
            f"Insufficient quantity for medication {getattr(med, 'id', None)}: "
            f"have {getattr(med, 'quantity', None)}, need {dose}"
        )
