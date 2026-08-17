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
// The two dock stops of the medication schedule. The point of these tests is
// that the layout follows the *dock*, not the viewport — jsdom reports a 1024px
// window throughout, so anything keyed to window.innerWidth would render the
// wide layout in every case here.
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';

import DoseScheduleView from './DoseScheduleView';
import { ModalDockProvider } from '../../contexts/ModalDockContext';

const at = (h, m = 0) => new Date(2026, 7, 17, h, m, 0).toISOString();

const ITEMS = [
  {
    id: 'briviact', name: 'Briviact', extra: '10 mL', description: 'Daily',
    status: 'missed', is_completed: false, scheduled_time: at(8),
    _raw: { schedule_id: 1, medication_id: 11 },
  },
  {
    id: 'propranolol', name: 'Propranolol', extra: '1 tablet', description: 'Daily',
    status: 'missed', is_completed: false, scheduled_time: at(8),
    _raw: { schedule_id: 2, medication_id: 12 },
  },
  {
    id: 'senna', name: 'Senna', extra: '3 tablets', description: 'Daily',
    status: 'completed', is_completed: true, scheduled_time: at(16),
    _raw: { schedule_id: 3, medication_id: 13 },
  },
];

const renderAt = (dock, props = {}) => {
  const value = {
    docked: true, expanded: false, toggleExpand: vi.fn(), setExpanded: vi.fn(), ...dock,
  };
  const utils = render(
    <ModalDockProvider value={value}>
      <DoseScheduleView items={ITEMS} {...props} />
    </ModalDockProvider>
  );
  return { ...utils, dock: value };
};

describe('DoseScheduleView — narrow stop', () => {
  it('leads with what is overdue and how many need attention', () => {
    renderAt({ expanded: false });
    expect(screen.getByText(/2 missed · 08:00/i)).toBeInTheDocument();
    expect(screen.getByText(/2 of 3 need attention/i)).toBeInTheDocument();
  });

  it('bands the cards by time so the slots are scannable', () => {
    const { container } = renderAt({ expanded: false });
    const times = [...container.querySelectorAll('.ld-dose-slot-time')].map(t => t.textContent);
    expect(times).toEqual(['08:00', '16:00']);
    // The time lives in the band header, so the card no longer repeats it.
    const firstCard = container.querySelector('.ld-dose-card');
    expect(within(firstCard).getByText('Daily')).toBeInTheDocument();
    expect(within(firstCard).queryByText(/08:00/)).toBeNull();
  });

  it('separates yesterday from today rather than merging the same time slot', () => {
    const withYesterday = [
      { ...ITEMS[0], id: 'y-briviact', is_yesterday: true },
      ITEMS[0],
    ];
    const { container } = render(
      <ModalDockProvider value={{ docked: true, expanded: false, setExpanded: vi.fn() }}>
        <DoseScheduleView items={withYesterday} />
      </ModalDockProvider>
    );
    const dayHeads = [...container.querySelectorAll('.ld-dose-day-head')].map(d => d.textContent);
    expect(dayHeads).toEqual(['Yesterday', 'Today']);
    // Two 08:00 bands, one per day — not one band with a duplicate-looking pair.
    expect(container.querySelectorAll('.ld-dose-slot-time')).toHaveLength(2);
  });

  it('renders cards, not the table, however wide the window claims to be', () => {
    const { container } = renderAt({ expanded: false });
    expect(container.querySelector('.ld-dose-panel.narrow')).toBeInTheDocument();
    expect(container.querySelector('table')).toBeNull();
    expect(container.querySelectorAll('.ld-dose-card')).toHaveLength(3);
  });

  it('tapping a card expands the panel and selects that dose', () => {
    const onSelect = vi.fn();
    const { dock } = renderAt({ expanded: false }, { onSelect });

    fireEvent.click(screen.getByRole('button', { name: /Briviact, Missed\. Open details\./i }));

    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ name: 'Briviact' }));
    expect(dock.setExpanded).toHaveBeenCalledWith(true);
  });

  it('recording from a card acts in place, without widening the panel', () => {
    const onRecord = vi.fn();
    const onSelect = vi.fn();
    const { dock, container } = renderAt({ expanded: false }, { onRecord, onSelect });

    const card = container.querySelector('.ld-dose-card');
    fireEvent.click(within(card).getByRole('button', { name: /record dose/i }));

    expect(onRecord).toHaveBeenCalledWith(expect.objectContaining({ name: 'Briviact' }));
    expect(dock.setExpanded).not.toHaveBeenCalled();
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('offers no actions on a dose already given', () => {
    const { container } = renderAt({ expanded: false }, { onRecord: vi.fn(), onSkip: vi.fn() });
    const given = [...container.querySelectorAll('.ld-dose-card')].find(
      c => within(c).queryByText('Senna')
    );
    expect(within(given).queryByRole('button', { name: /record dose/i })).toBeNull();
    expect(within(given).queryByRole('button', { name: /skip/i })).toBeNull();
  });

  it('record all is offered per time band, and only what still needs doing', () => {
    const onRecordAll = vi.fn();
    renderAt({ expanded: false }, { onRecordAll });
    // 16:00 holds only an already-given dose, so it offers nothing to record.
    const buttons = screen.getAllByRole('button', { name: /record all/i });
    expect(buttons).toHaveLength(2); // the lead line, plus the 08:00 band
    fireEvent.click(buttons[1]);
    expect(onRecordAll).toHaveBeenCalledWith([
      expect.objectContaining({ name: 'Briviact' }),
      expect.objectContaining({ name: 'Propranolol' }),
    ]);
  });
});

describe('DoseScheduleView — expanded stop', () => {
  it('shows the four counts for the day', () => {
    const { container } = renderAt({ expanded: true });
    const tiles = [...container.querySelectorAll('.ld-dose-tile')].map(t => t.textContent);
    expect(tiles).toEqual(['Given1', 'Due0', 'Missed2', 'Skipped0']);
  });

  it('groups the table by time slot', () => {
    const { container } = renderAt({ expanded: true });
    expect(container.querySelector('.ld-dose-panel.wide')).toBeInTheDocument();
    const slots = [...container.querySelectorAll('.ld-dose-slot-time')].map(s => s.textContent);
    expect(slots).toEqual(['08:00', '16:00']);
    expect(screen.getByText('2 medications')).toBeInTheDocument();
    expect(screen.getByText('1 medication')).toBeInTheDocument();
  });

  it('selecting a row does not resize the panel — the detail pane is already there', () => {
    const onSelect = vi.fn();
    const { dock } = renderAt({ expanded: true }, { onSelect });

    fireEvent.click(screen.getByRole('button', { name: 'Propranolol' }));

    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ name: 'Propranolol' }));
    expect(dock.setExpanded).not.toHaveBeenCalled();
  });

  it('marks the selected row', () => {
    const { container } = renderAt({ expanded: true }, { selectedId: 'propranolol' });
    const selected = container.querySelectorAll('tr.selected');
    expect(selected).toHaveLength(1);
    expect(within(selected[0]).getByText('Propranolol')).toBeInTheDocument();
  });

  it('renders the detail pane beside the list', () => {
    renderAt({ expanded: true }, { detail: <p>Dose details go here</p> });
    expect(screen.getByText('Dose details go here')).toBeInTheDocument();
  });

  it('record all in a slot passes only that slot, only what is open', () => {
    const onRecordAll = vi.fn();
    renderAt({ expanded: true }, { onRecordAll });
    // The 16:00 slot holds one already-given dose, so it offers no Record all.
    const buttons = screen.getAllByRole('button', { name: /record all/i });
    expect(buttons).toHaveLength(1);
    fireEvent.click(buttons[0]);
    expect(onRecordAll).toHaveBeenCalledWith([
      expect.objectContaining({ name: 'Briviact' }),
      expect.objectContaining({ name: 'Propranolol' }),
    ]);
  });
});

describe('DoseScheduleView — empty and loading', () => {
  it('says so when the day is empty', () => {
    render(
      <ModalDockProvider value={{ docked: true, expanded: false, setExpanded: vi.fn() }}>
        <DoseScheduleView items={[]} emptyText="No scheduled medications for today" />
      </ModalDockProvider>
    );
    expect(screen.getByText('No scheduled medications for today')).toBeInTheDocument();
  });

  it('shows a loading state rather than an empty day', () => {
    render(
      <ModalDockProvider value={{ docked: true, expanded: false, setExpanded: vi.fn() }}>
        <DoseScheduleView items={[]} loading />
      </ModalDockProvider>
    );
    expect(screen.getByText(/loading schedule/i)).toBeInTheDocument();
  });
});

// A phone is not docked: it fills the screen, has no expand control, and never
// has room for a pane beside the list.
describe('DoseScheduleView — phone', () => {
  const onPhone = (props = {}) => {
    const dock = { docked: false, expanded: false, toggleExpand: null, setExpanded: vi.fn() };
    const utils = render(
      <ModalDockProvider value={dock}>
        <DoseScheduleView items={ITEMS} {...props} />
      </ModalDockProvider>
    );
    return { ...utils, dock };
  };

  it('gets the cards, not the table', () => {
    const { container } = onPhone();
    expect(container.querySelector('.ld-dose-panel.narrow')).toBeInTheDocument();
    expect(container.querySelector('table')).toBeNull();
  });

  it('never switches to the wide layout, even once a dose is selected', () => {
    // The host still hands setExpanded down, so selecting must not be allowed
    // to flip a 390px screen to the side-by-side table.
    const { container, dock } = onPhone({ selectedId: 'briviact', detail: <p>Details</p> });
    expect(container.querySelector('.ld-dose-panel.wide')).toBeNull();
    expect(dock.setExpanded).not.toHaveBeenCalled();
  });

  it('shows the detail in place of the list, with a way back', () => {
    const onSelect = vi.fn();
    const { container } = onPhone({
      selectedId: 'briviact', detail: <p>Dose details go here</p>, onSelect,
    });

    expect(screen.getByText('Dose details go here')).toBeInTheDocument();
    expect(container.querySelectorAll('.ld-dose-card')).toHaveLength(0);

    fireEvent.click(screen.getByRole('button', { name: /back to schedule/i }));
    expect(onSelect).toHaveBeenCalledWith(null);
  });

  it('tapping a dose selects it without asking for a width it cannot get', () => {
    const onSelect = vi.fn();
    const { dock } = onPhone({ onSelect });
    fireEvent.click(screen.getByRole('button', { name: /Briviact, Missed\. Open details\./i }));
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ name: 'Briviact' }));
    expect(dock.setExpanded).not.toHaveBeenCalled();
  });

  it('stays on the list while nothing is selected', () => {
    const { container } = onPhone({ detail: <p>Dose details go here</p> });
    expect(screen.queryByText('Dose details go here')).toBeNull();
    expect(container.querySelectorAll('.ld-dose-card')).toHaveLength(3);
  });
});
