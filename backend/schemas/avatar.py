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
"""What the API says about a person's avatar, shared by users and patients."""
from typing import Optional

from pydantic import BaseModel


class AvatarState(BaseModel):
    # Random UUID set by "shuffle design"; None means the frontend derives the
    # seed from "<kind>:<id>".
    avatar_seed: Optional[str] = None
    # uuid-named file under PHOTOS_DIR; None means no photo, draw the identicon.
    avatar_photo: Optional[str] = None
