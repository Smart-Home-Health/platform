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
// One message. Severity is carried by the badge and the icon rather than by a
// bar down the side of the card — the side bar reads as filler, and the badge
// is where someone actually looks for the level.
import { useState } from 'react';
import {
  MedicationIcon, MessagesIcon, BellAlertIcon, MoreHorizontalIcon,
  CheckIcon, ClockIcon, TrashIcon, ChevronRightIcon,
} from '../Icons';
import {
  severityOf, categoryOf, formatWhen, scopeLabel, snoozeNote,
  reviewLink, primaryAction, SNOOZE_OPTIONS,
} from './messageMeta';

const ICONS = { medication: MedicationIcon, message: MessagesIcon, system: BellAlertIcon };

export default function MessageCard({
  message,
  busy = false,
  dense = false,
  onDismiss,
  onSnooze,
  onDelete,
  onReview,
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const severity = severityOf(message);
  const category = categoryOf(message);
  const Icon = ICONS[category.icon] || BellAlertIcon;
  const review = reviewLink(message);
  const primary = primaryAction(message);
  const snoozed = snoozeNote(message);
  const canSnooze = message.snoozable && onSnooze;
  const showReview = !!review && !!onReview;
  const showDismiss = !!primary && !!onDismiss;
  // The explanation belongs where someone would otherwise hunt for a Dismiss
  // button — not on an archived card, where nothing is offered anyway.
  const showNote = !primary && !!onDismiss;
  const hasMenu = canSnooze || !!onDelete;
  // An archived card takes no actions but delete. Rather than draw a whole
  // action row to hold one overflow button, the button moves up beside the
  // category label and the row is not rendered at all.
  const hasActionRow = showDismiss || showReview || showNote;

  return (
    <article className={`mx-card ${severity.key}${busy ? ' busy' : ''}`}>
      <div className="mx-card-top">
        <span className={`mx-badge ${severity.key}`}>{severity.label}</span>
        <span className="mx-cat">{category.label}</span>
        {hasMenu && !hasActionRow && (
          <button
            type="button"
            className={`mx-more${menuOpen ? ' open' : ''}`}
            onClick={() => setMenuOpen(v => !v)}
            aria-expanded={menuOpen}
            aria-label={`More actions for ${message.title}`}
          >
            <MoreHorizontalIcon size={16} />
          </button>
        )}
      </div>

      <div className="mx-card-main">
        <span className={`mx-icon ${severity.key}`} aria-hidden="true">
          <Icon size={dense ? 22 : 26} />
        </span>
        <div className="mx-card-text">
          <h3 className="mx-title">{message.title}</h3>
          {message.body && <p className="mx-body">{message.body}</p>}
          <div className="mx-meta">
            <span>{formatWhen(message.created_at)}</span>
            <span className="mx-dot" aria-hidden="true">·</span>
            <span>{scopeLabel(message)}</span>
            {message.data?.patient_name && (
              <>
                <span className="mx-dot" aria-hidden="true">·</span>
                <span>{message.data.patient_name}</span>
              </>
            )}
          </div>
          {snoozed && <div className="mx-snoozed">{snoozed}</div>}
        </div>
      </div>

      {hasActionRow && (
      <div className="mx-card-actions">
        <div className="mx-card-actions-main">
          {showDismiss && (
            <button
              type="button"
              className="mx-btn primary"
              onClick={() => onDismiss(message)}
              disabled={busy}
            >
              <CheckIcon size={13} />
              {primary.label}
            </button>
          )}
          {showReview && (
            <button type="button" className="mx-link" onClick={() => onReview(message, review)}>
              {review.label}
              <ChevronRightIcon size={14} />
            </button>
          )}
          {/* A missing Dismiss has to be explained rather than just absent:
              the message is waiting on the condition behind it, not on the
              reader. Shown even beside a Review link, which is where someone
              would otherwise look for the button that isn't there. */}
          {showNote && (
            <span className="mx-note">Clears when the underlying condition is resolved</span>
          )}
        </div>
        {hasMenu && (
          <button
            type="button"
            className={`mx-more${menuOpen ? ' open' : ''}`}
            onClick={() => setMenuOpen(v => !v)}
            aria-expanded={menuOpen}
            aria-label={`More actions for ${message.title}`}
          >
            <MoreHorizontalIcon size={16} />
          </button>
        )}
      </div>
      )}

      {/* Opens in place rather than as a floating menu: the card lives inside a
          scrolling docked panel, where an anchored popover drifts off its row. */}
      {hasMenu && menuOpen && (
        <div className="mx-menu">
          {canSnooze && (
            <div className="mx-menu-row">
              <span className="mx-menu-label"><ClockIcon size={13} /> Snooze</span>
              <div className="mx-menu-opts">
                {SNOOZE_OPTIONS.map(opt => (
                  <button
                    key={opt.minutes}
                    type="button"
                    className="mx-btn ghost sm"
                    onClick={() => { setMenuOpen(false); onSnooze(message, opt.minutes); }}
                    disabled={busy}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          )}
          {onDelete && (
            <div className="mx-menu-row">
              <span className="mx-menu-label"><TrashIcon size={13} /> Remove</span>
              <div className="mx-menu-opts">
                <button
                  type="button"
                  className="mx-btn danger sm"
                  onClick={() => { setMenuOpen(false); onDelete(message); }}
                  disabled={busy}
                >
                  Delete permanently
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </article>
  );
}
