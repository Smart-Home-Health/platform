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
// The messages list, shared by the admin page and the dashboard panel so both
// read the same. The hosts own fetching and the create/delete dialogs; this
// owns the status tabs, the source filter and the grouped cards.
//
// `dense` is the narrow dock stop, not "mobile" — a 380px panel on a 1920px
// screen is narrow, and window.innerWidth would call it desktop.
import { useMemo, useState } from 'react';
import MessageCard from './MessageCard';
import { groupMessages, sourceOptions, filterBySource, STATUS_TABS } from './messageMeta';
import { ChevronDownIcon } from '../Icons';
import './messages-panel.css';

export default function MessagesBoard({
  items,
  loading = false,
  error = null,
  status = 'active',
  onStatusChange,
  statusCount = null,
  dense = false,
  headerActions = null,
  footer = null,
  busyId = null,
  onDismiss,
  onSnooze,
  onDelete,
  onReview,
}) {
  const [source, setSource] = useState('all');
  const list = useMemo(() => (Array.isArray(items) ? items : []), [items]);
  const sources = useMemo(() => sourceOptions(list), [list]);
  // A filter that no longer matches anything would silently strip the list, so
  // an option that disappeared falls back to showing everything.
  const activeSource = sources.some(s => s.value === source) ? source : 'all';
  const groups = useMemo(
    () => groupMessages(filterBySource(list, activeSource)),
    [list, activeSource]
  );

  return (
    <div className={`mx-board${dense ? ' dense' : ''}`}>
      <div className="mx-toolbar">
        {onStatusChange && (
          <div className="mx-tabs" role="tablist" aria-label="Message status">
            {STATUS_TABS.map(tab => (
              <button
                key={tab.value}
                type="button"
                role="tab"
                aria-selected={status === tab.value}
                className={`mx-tab${status === tab.value ? ' active' : ''}`}
                onClick={() => onStatusChange(tab.value)}
              >
                {tab.label}
                {/* Count only where there is one: a "0" chip on the tab you
                    are already looking at is noise next to its empty state. */}
                {status === tab.value && statusCount > 0 && (
                  <span className="mx-tab-count">{statusCount}</span>
                )}
              </button>
            ))}
          </div>
        )}

        <div className="mx-toolbar-row">
          {/* Only worth showing when there is more than one kind of message in
              hand — a filter with a single option is a control that can't do
              anything. Native select rather than a portalled menu: the popup is
              drawn by the OS, so it can't inherit the wrong theme's tokens the
              way a body-portalled menu over the dark board would. */}
          {sources.length > 2 && (
          <label className="mx-source">
            <span className="mx-sr">Filter by source</span>
            <select
              value={activeSource}
              onChange={e => setSource(e.target.value)}
            >
              {sources.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
            <ChevronDownIcon size={14} />
          </label>
          )}
          {headerActions}
        </div>
      </div>

      {error && <div className="mx-error">{error}</div>}

      {loading ? (
        <div className="mx-empty">Loading messages…</div>
      ) : !groups.length ? (
        <div className="mx-empty">
          {/* Only the status can be empty: the source options are derived from
              the messages in hand, so a source that is showing nothing has
              already fallen back to "all" above. */}
          {status === 'active'
            ? 'All caught up — nothing needs your attention.'
            : `No ${status} messages.`}
        </div>
      ) : (
        groups.map(group => (
          <section key={group.key} className="mx-group">
            <h4 className="mx-group-head">
              {group.label}
              <span className="mx-group-count">{group.items.length}</span>
            </h4>
            <div className="mx-cards">
              {group.items.map(message => (
                <MessageCard
                  key={message.id}
                  message={message}
                  dense={dense}
                  busy={busyId === message.id}
                  onDismiss={onDismiss}
                  onSnooze={onSnooze}
                  onDelete={onDelete}
                  onReview={onReview}
                />
              ))}
            </div>
          </section>
        ))
      )}

      {footer}
    </div>
  );
}
