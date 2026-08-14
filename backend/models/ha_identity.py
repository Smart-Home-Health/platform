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
"""Home Assistant identities observed on ingress requests.

Every HA user who opens the add-on panel gets a row here (upserted on
/api/auth/ha/login), which is exactly the population an administrator wants
to link to app users — no Supervisor API privileges needed for a picker.
The actual user mapping lives on ``users.ha_user_id``.
"""
from datetime import datetime

from sqlalchemy import Column, DateTime, Integer, String

from db import Base


class HASeenIdentity(Base):
    """An HA user id we've seen arrive via ingress, with display metadata."""
    __tablename__ = "ha_seen_identities"

    id = Column(Integer, primary_key=True, index=True)
    ha_user_id = Column(String(32), unique=True, nullable=False, index=True)
    username = Column(String(100), nullable=True)       # HA username; absent for some auth providers
    display_name = Column(String(100), nullable=True)   # HA display name, user-editable
    first_seen = Column(DateTime, default=datetime.utcnow, nullable=False)
    last_seen = Column(DateTime, default=datetime.utcnow, nullable=False)
