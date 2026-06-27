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
import { useState, useEffect } from 'react';
import config, { apiFetch } from '../config';
import { useAuth } from '../contexts/AuthContext';
import { getMessagesPopKey } from '../utils/messagesPopThrottle';
import MessagesModal from './MessagesModal';

const POP_INTERVAL_MS = 60 * 60 * 1000; // re-pop on unlock at most hourly

/**
 * Pops the MessagesModal in the user's face when there are active messages.
 * Mounted inside Layout (every protected route). Layout remounts on
 * navigation, so the "already shown" throttle lives in sessionStorage keyed
 * by user id: each login/user-switch pops (the key is cleared on
 * logout/switch), while idle-lock unlocks and route changes re-pop at most
 * once per hour.
 */
const MessagesAutoPop = () => {
  const { user, isAuthenticated } = useAuth();
  const [open, setOpen] = useState(false);
  const [initialMessages, setInitialMessages] = useState(null);
  const userId = user?.id;

  useEffect(() => {
    if (!isAuthenticated || !userId) return;
    const key = getMessagesPopKey(userId);
    const last = Number(sessionStorage.getItem(key) || 0);
    if (Date.now() - last < POP_INTERVAL_MS) return;

    let cancelled = false;
    (async () => {
      try {
        const res = await apiFetch(`${config.apiUrl}/api/messages/active`);
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled && data.count > 0) {
          sessionStorage.setItem(key, String(Date.now()));
          setInitialMessages(data.items || []);
          setOpen(true);
        }
      } catch (err) {
        console.error('Error checking for active messages:', err);
      }
    })();
    return () => { cancelled = true; };
  }, [isAuthenticated, userId]);

  if (!open) return null;
  return <MessagesModal initialMessages={initialMessages} onClose={() => setOpen(false)} />;
};

export default MessagesAutoPop;
