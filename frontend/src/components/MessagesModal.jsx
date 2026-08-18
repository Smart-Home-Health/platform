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
// Messages as a docked panel: the same board the admin page renders, scoped to
// what this user has to deal with.
//
// Two callers: the Messages nav action, and MessagesAutoPop after login (which
// hands over the list it already fetched so the generators don't run twice).
// Outside the dashboard's dock provider ModalBase falls back to a plain slab,
// which is what the auto-pop wants over an admin page.
import { useNavigate } from 'react-router-dom';
import ModalBase from './ModalBase';
import MessagesBoard from './messages/MessagesBoard';
import useMessages from './messages/useMessages';
import { useModalDock } from '../contexts/ModalDockContext';
import './section-panel/section-panel.css';

const MessagesModal = ({ onClose, initialMessages = null }) => {
  const navigate = useNavigate();
  const { docked, expanded } = useModalDock();
  const {
    status, setStatus, items, total, loading, error, busyId, dismiss, snooze,
  } = useMessages({ scope: 'mine', initialItems: initialMessages });

  // Narrow is the dock's first stop, not a viewport width.
  const dense = docked && !expanded;

  // Dismiss and snooze are only meaningful on an open message; the other two
  // tabs are archive, so the cards there carry no actions.
  const open = status === 'active';

  const handleReview = (message, link) => {
    onClose();
    navigate(link.to);
  };

  return (
    <ModalBase isOpen={true} onClose={onClose} title={
      <span className="mp-modal-title">
        <span>Messages</span>
        <span className="mp-modal-title-sub">
          {status === 'active'
            ? (total > 0 ? `${total} needing attention` : 'All caught up')
            : `${status.charAt(0).toUpperCase()}${status.slice(1)}`}
        </span>
      </span>
    }>
      <MessagesBoard
        items={items}
        loading={loading}
        error={error}
        status={status}
        onStatusChange={setStatus}
        statusCount={status === 'active' ? total : null}
        dense={dense}
        busyId={busyId}
        onDismiss={open ? dismiss : undefined}
        onSnooze={open ? snooze : undefined}
        onReview={handleReview}
      />
    </ModalBase>
  );
};

export default MessagesModal;
