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
"""
Inbound Home Assistant integration: read selected HA entities and record them
as patient vitals or environmental observations.

- ``client``: HA REST/WebSocket API client (supervisor-proxy or external).
- ``service``: config/state accessors, entity-state -> vital/observation routing.
- ``listener``: the background WS subscription loop started from main.py.
"""
