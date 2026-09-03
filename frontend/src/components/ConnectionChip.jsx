/*
 * Smart Home Health
 * Copyright (C) 2026 John Carty
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */
// CONNECTED · SYNCED status chip (honest: green only while the hub answers
// the liveness probe). Pairs with src/hooks/useConnectionStatus.
import './connection-chip.css';

export default function ConnectionChip({ connection, stacked = false }) {
  const { connected, lastSuccess } = connection;
  const stamp = lastSuccess
    ? lastSuccess.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    : null;
  const stateWord = connected ? 'Connected' : 'Offline';
  const syncLine = stamp ? `${connected ? 'Synced' : 'Last synced'} ${stamp}` : null;
  return (
    <span className={`vc-chip ${connected ? '' : 'offline'} ${stacked ? 'stacked' : ''}`}>
      <span className="vc-chip-dot" aria-hidden="true" />
      {stacked ? (
        <span className="vc-chip-lines">
          <span>{stateWord}</span>
          {syncLine && <span>{syncLine}</span>}
        </span>
      ) : (
        `${stateWord}${syncLine ? ` · ${syncLine}` : ''}`
      )}
    </span>
  );
}
