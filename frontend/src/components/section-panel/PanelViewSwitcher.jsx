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
// The medication panel's view row: which list you are looking at, plus the PRN
// entry point. It sits in the body rather than in the modal title because it
// carries two lines and a count — the title bar is one tight line at the narrow
// dock stop.
//
// Built on Radix Select so focus, keyboard and outside-click come free, then
// skinned from the vc tokens; the menu portals to <body>, so the vc class rides
// along on SelectContent rather than being inherited.
import * as SelectPrimitive from '@radix-ui/react-select';
import {
  ChevronDownIcon, CheckIcon, CalendarIcon, ClipboardListIcon,
  PackageIcon, HistoryIcon, DashboardIcon, BellAlertIcon,
} from '../Icons';
import './section-panel.css';

// Keyed by view value; a view without an entry simply renders without an icon.
const VIEW_ICON = {
  scheduled: CalendarIcon,
  active: ClipboardListIcon,
  supplies: PackageIcon,
  history: HistoryIcon,
  dashboard: DashboardIcon,
  thresholds: BellAlertIcon,
};

/**
 * @param views  [{ value, label, sublabel, count?, note?, tone? }]
 *               `note` is the right-hand status line (e.g. "23 missed");
 *               `tone` colours it ('due' | 'given' | null).
 */
export default function PanelViewSwitcher({
  views,
  value,
  onChange,
  actions = [],
}) {
  const current = views.find((v) => v.value === value) || views[0];
  // Nutrition has a single view; a dropdown that cannot go anywhere is a lie
  // about what is available, so it renders as a plain heading instead.
  const single = views.length < 2;

  const actionButtons = actions.map((action) => (
    <button
      key={action.label}
      type="button"
      className="mp-prn-btn"
      onClick={action.onClick}
      disabled={action.disabled}
      title={action.title || action.label}
    >
      <span className="mp-prn-label">{action.label}</span>
      {action.count != null && <span className="mp-prn-count">{action.count}</span>}
    </button>
  ));

  if (single) {
    return (
      <div className="mp-viewrow">
        <span className="mp-viewrow-label">View</span>
        <div className="mp-viewrow-controls">
          <div className="mp-view-trigger static">
            <span className="mp-view-trigger-text">
              <span className="mp-view-title">{current?.label}</span>
              {current?.sublabel && <span className="mp-view-sub">{current.sublabel}</span>}
            </span>
            {current?.note && (
              <span className={`mp-view-note ${current.tone || ''}`}>{current.note}</span>
            )}
          </div>
          {actionButtons}
        </div>
      </div>
    );
  }

  return (
    <div className="mp-viewrow">
      <span className="mp-viewrow-label">View</span>
      <div className="mp-viewrow-controls">
        <SelectPrimitive.Root value={value} onValueChange={onChange}>
          <SelectPrimitive.Trigger className="mp-view-trigger" aria-label="Choose a view">
            <span className="mp-view-trigger-text">
              <span className="mp-view-title">{current?.label}</span>
              {current?.sublabel && <span className="mp-view-sub">{current.sublabel}</span>}
            </span>
            <SelectPrimitive.Icon asChild>
              <span className="mp-view-caret" aria-hidden="true"><ChevronDownIcon size={16} /></span>
            </SelectPrimitive.Icon>
          </SelectPrimitive.Trigger>

          <SelectPrimitive.Portal>
            <SelectPrimitive.Content position="popper" sideOffset={6} className="mp-view-menu">
              <SelectPrimitive.Viewport>
                {views.map((view) => {
                  const Icon = VIEW_ICON[view.value];
                  return (
                    <SelectPrimitive.Item key={view.value} value={view.value} className="mp-view-item">
                      {Icon && <span className="mp-view-item-icon" aria-hidden="true"><Icon size={22} /></span>}
                      <span className="mp-view-item-text">
                        <SelectPrimitive.ItemText>{view.label}</SelectPrimitive.ItemText>
                        {view.sublabel && <span className="mp-view-sub">{view.sublabel}</span>}
                      </span>
                      <span className="mp-view-item-meta">
                        <SelectPrimitive.ItemIndicator asChild>
                          <span className="mp-view-check" aria-hidden="true"><CheckIcon size={16} /></span>
                        </SelectPrimitive.ItemIndicator>
                        {view.note && (
                          <span className={`mp-view-note ${view.tone || ''}`}>{view.note}</span>
                        )}
                        {view.count != null && !view.note && (
                          <span className="mp-view-count">{view.count}</span>
                        )}
                      </span>
                    </SelectPrimitive.Item>
                  );
                })}
              </SelectPrimitive.Viewport>
            </SelectPrimitive.Content>
          </SelectPrimitive.Portal>
        </SelectPrimitive.Root>

        {actionButtons}
      </div>
    </div>
  );
}
