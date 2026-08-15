# Smart Home Health
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
from sqlalchemy import Column, Integer, Text, ForeignKey, TIMESTAMP
from sqlalchemy.orm import relationship
from schemas import Base


class EquipmentCountLog(Base):
    """Audit trail for physical stocktakes (absolute quantity sets).

    Separate from EquipmentChangeLog on purpose: change_log means "the item
    was physically replaced" and drives last_changed / the History page.
    A shelf count corrects quantity without touching either.
    """
    __tablename__ = 'equipment_count_log'

    id = Column(Integer, primary_key=True, autoincrement=True)
    equipment_id = Column(Integer, ForeignKey('equipment.id', ondelete='CASCADE'), nullable=False, index=True)
    quantity_before = Column(Integer, nullable=False)
    quantity_after = Column(Integer, nullable=False)
    note = Column(Text, nullable=True)
    counted_by = Column(Integer, ForeignKey('users.id', ondelete='SET NULL'), nullable=True)
    counted_at = Column(TIMESTAMP(timezone=True), nullable=False)

    # Relationships
    equipment = relationship('Equipment', back_populates='count_logs')
