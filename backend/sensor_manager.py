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
# Define sensors and topics here to make it easily extendable
SENSOR_DEFINITIONS = {
    "spo2": "shh/spo2/state",
    "bpm": "shh/bpm/state",
    "perfusion": "shh/perfusion/state",
    "map_bp": "shh/map/state",
    "temp": "shh/temp/state",
    "status": "shh/status/state"
}
