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
// THE intake logging sheet. One feed is a LIST of items — formula plus a
// varying mix of juices and smoothies — logged together as one event whose
// rows share an event_group_id, so fluid and calorie math still sees each
// item separately.
//
// A hand-logged feed can also be linked to a scheduled feed: pick the feed
// and the entry records against it, marking it complete on the schedule
// board — no second "mark complete" step, no duplicate entry.
//
// Presets cover repeated combinations ("Peptamen 250 mL + 60 mL flush, pump").
// Applying one writes a separate intake record per component, grouped.
import { useEffect, useMemo, useState } from 'react';
import EntityModal from '../vc/EntityModal';
import ChipGroup from '../vc/ChipGroup';
import DisclosureRow from '../vc/DisclosureRow';
import WhenRow from './WhenRow';
import config from '../../config';
import { nutritionService } from '../../services/nutrition';
import {
  BreakfastIcon, DinnerIcon, LinkIcon, LunchIcon, MoreHorizontalIcon, SnackIcon,
} from '../Icons';
import IntakeItemsEditor from './IntakeItemsEditor';
import {
  feedTarget, makeItemRow, rowFromScheduleComponent, rowIsValid, rowToItemPayload,
  saveRowsAsItems,
} from './intakeItemRows';
import './nutrition-sheet.css';

// Meal context is optional and separate from the intake type. "Supplement"
// deliberately does not appear here as well as in the type list.
const CONTEXTS = [
  { value: 'breakfast', label: 'Breakfast', icon: <BreakfastIcon size={16} /> },
  { value: 'lunch', label: 'Lunch', icon: <LunchIcon size={16} /> },
  { value: 'dinner', label: 'Dinner', icon: <DinnerIcon size={16} /> },
  { value: 'snack', label: 'Snack', icon: <SnackIcon size={16} /> },
  { value: 'other', label: 'Other', icon: <MoreHorizontalIcon size={16} /> },
];

const toLocalInput = (value) => {
  const d = value ? new Date(value) : new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
    + `T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const feedTimeLabel = (iso) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  let hours = d.getHours();
  const minutes = String(d.getMinutes()).padStart(2, '0');
  const suffix = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12 === 0 ? 12 : hours % 12;
  return `${hours}:${minutes} ${suffix}`;
};

/** One editor row from an existing intake record (edit mode). */
const rowFromExisting = (record) => makeItemRow({
  itemId: record.item_id ?? null,
  itemName: record.item_name || '',
  itemType: record.item_type || 'liquid',
  amount: record.amount != null ? String(record.amount) : '',
  amountUnit: record.amount_unit || 'ml',
  feedRoute: record.feed_route || '',
  rateMlPerHr: record.rate_ml_per_hr != null ? String(record.rate_ml_per_hr) : '',
  durationMinutes: record.duration_minutes != null ? String(record.duration_minutes) : '',
  calories: record.calories != null ? String(record.calories) : '',
  protein: record.protein_grams != null ? String(record.protein_grams) : '',
  carbs: record.carbs_grams != null ? String(record.carbs_grams) : '',
  fat: record.fat_grams != null ? String(record.fat_grams) : '',
  fiber: record.fiber_grams != null ? String(record.fiber_grams) : '',
  sodium: record.sodium_mg != null ? String(record.sodium_mg) : '',
});

/** Prefill rows from a scheduled feed's component mix (or single default). */
const rowsFromFeed = (feed) => {
  if (feed.components?.length) return feed.components.map(rowFromScheduleComponent);
  if (feed.default_item || feed.default_amount != null) {
    return [makeItemRow({
      itemName: feed.default_item || feed.name || '',
      itemType: 'liquid',
      amount: feed.default_amount != null ? String(feed.default_amount) : '',
      amountUnit: feed.default_amount_unit || 'ml',
      calories: feed.default_calories != null ? String(feed.default_calories) : '',
    })];
  }
  return [];
};

export default function IntakeSheet({
  open, onClose, onSaved, patient, editing, defaultDateTime,
  careTaskLogId, careTaskName,
}) {
  const [mealType, setMealType] = useState(null);
  const [consumedAt, setConsumedAt] = useState(() => toLocalInput(defaultDateTime));
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState([]);
  const [recent, setRecent] = useState([]);
  const [presets, setPresets] = useState([]);
  const [feeds, setFeeds] = useState([]);          // today's open scheduled feeds
  const [linkedFeed, setLinkedFeed] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setLinkedFeed(null);
    if (editing) {
      setMealType(editing.meal_type || null);
      setConsumedAt(toLocalInput(editing.consumed_at));
      setNotes(editing.notes || '');
      setItems([rowFromExisting(editing)]);
    } else {
      setMealType(null);
      setConsumedAt(toLocalInput(defaultDateTime));
      setNotes('');
      setItems([]);
    }
  }, [open, editing, defaultDateTime]);

  // Recent combinations and presets back the one-tap prefill rows.
  useEffect(() => {
    if (!open || !patient || editing) return;
    let cancelled = false;
    Promise.all([
      nutritionService.recent(patient.id).catch(() => ({ recent: [] })),
      nutritionService.listPresets(patient.id).catch(() => []),
    ]).then(([recentBody, presetList]) => {
      if (cancelled) return;
      setRecent(recentBody.recent || []);
      setPresets(Array.isArray(presetList) ? presetList : []);
    });
    return () => { cancelled = true; };
  }, [open, patient, editing]);

  // Today's still-open scheduled feeds, for the link picker. A hand-logged
  // entry linked to one records against it and marks it complete.
  useEffect(() => {
    if (!open || !patient || editing || careTaskLogId) return;
    let cancelled = false;
    const today = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const dateParam = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
    const tz = -today.getTimezoneOffset();
    fetch(
      `${config.apiUrl}/api/schedule/daily?patient_id=${patient.id}&target_date=${dateParam}&tz_offset_minutes=${tz}`,
      { credentials: 'include' },
    )
      .then((res) => (res.ok ? res.json() : { nutrition: [] }))
      .then((data) => {
        if (cancelled) return;
        setFeeds((data.nutrition || []).filter(
          (row) => row.schedule_id && !row.completed && !row.is_prn
            && row.intake_type !== 'output'
            // Flush follow-ups have their own Run flow; linking a hand-log
            // to one would double-complete it.
            && row.row_kind !== 'flush',
        ));
      })
      .catch(() => { if (!cancelled) setFeeds([]); });
    return () => { cancelled = true; };
  }, [open, patient, editing, careTaskLogId]);

  const applyRecent = (option) => {
    const entry = option.entry;
    setItems((prev) => [...prev, makeItemRow({
      itemName: entry.item_name,
      itemType: entry.item_type || 'liquid',
      amount: entry.amount != null ? String(entry.amount) : '',
      amountUnit: entry.amount_unit || 'ml',
    })]);
  };

  const applyPreset = async (option) => {
    if (!patient) return;
    setSaving(true);
    setError(null);
    try {
      await nutritionService.applyPreset(option.preset.id, {
        patient_id: patient.id,
        consumed_at: new Date(consumedAt).toISOString(),
        meal_type: mealType || undefined,
        care_task_log_id: careTaskLogId || undefined,
      });
      onSaved?.();
      onClose?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const feedKey = (feed) => `${feed.schedule_id}|${feed.scheduled_time}`;

  const chooseFeed = (key) => {
    if (!key) { setLinkedFeed(null); return; }
    const feed = feeds.find((f) => feedKey(f) === key);
    if (!feed) return;
    setLinkedFeed(feed);
    // An empty sheet takes the feed's expected mix as its starting point.
    if (items.length === 0) setItems(rowsFromFeed(feed));
  };

  const canSave = items.length > 0 && items.every(rowIsValid) && !saving;

  const submit = async (event) => {
    event.preventDefault();
    if (!patient || !canSave) return;
    setSaving(true);
    setError(null);
    try {
      if (editing) {
        await nutritionService.updateIntake(editing.id, {
          ...rowToItemPayload(items[0]),
          consumed_at: new Date(consumedAt).toISOString(),
          meal_type: mealType || null,
          notes: notes || null,
        });
      } else {
        await nutritionService.createIntakeEvent({
          patient_id: patient.id,
          consumed_at: new Date(consumedAt).toISOString(),
          meal_type: mealType || null,
          notes: notes || null,
          ...(careTaskLogId ? { care_task_log_id: careTaskLogId } : {}),
          ...(linkedFeed ? {
            schedule_id: linkedFeed.schedule_id,
            scheduled_time: linkedFeed.scheduled_time,
          } : {}),
          items: items.map(rowToItemPayload),
        });
        await saveRowsAsItems(items, patient.id);
      }
      onSaved?.();
      onClose?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const itemCount = items.length;
  const submitLabel = useMemo(() => {
    if (saving) return 'Saving…';
    if (editing) return 'Save changes';
    if (itemCount > 1) return `Log ${itemCount} items`;
    return 'Log intake';
  }, [saving, editing, itemCount]);

  if (!patient) return null;

  return (
    <EntityModal
      open={open}
      onOpenChange={(next) => { if (!next) onClose?.(); }}
      title={editing ? 'Edit intake' : 'Log intake'}
    >
      <form className="em-form nsheet" onSubmit={submit}>
        <p className="nsheet-sub">
          {careTaskName
            ? `Recording against ${careTaskName}.`
            : 'Add food, fluids, supplements, or a tube feeding — several items in one go.'}
        </p>
        {error && <div className="em-error">{error}</div>}

        <WhenRow
          id="intake-when"
          value={consumedAt}
          onChange={setConsumedAt}
        />

        <ChipGroup
          label="Context"
          optional
          scroll
          options={CONTEXTS}
          value={mealType}
          onChange={setMealType}
        />

        {!editing && !careTaskLogId && feeds.length > 0 && (
          <ChipGroup
            label="Scheduled feed"
            hint="Linking marks the feed complete."
            optional
            scroll
            options={feeds.map((f) => ({
              value: feedKey(f),
              label: `${f.name} · ${feedTimeLabel(f.scheduled_time)}`,
              icon: <LinkIcon size={14} />,
            }))}
            value={linkedFeed ? feedKey(linkedFeed) : null}
            onChange={chooseFeed}
          />
        )}
        {linkedFeed && (
          <p className="nsheet-note nsheet-linked">
            Linked to {linkedFeed.name} · {feedTimeLabel(linkedFeed.scheduled_time)}.
            Logging will mark it complete. Tap the chip again to unlink.
          </p>
        )}

        {!editing && presets.length > 0 && (
          <ChipGroup
            label="Presets"
            hint="Logs every part as its own record."
            mode="action"
            scroll
            options={presets.map((p) => ({
              value: `preset-${p.id}`,
              label: p.name,
              sublabel: `${p.components?.length || 0} items`,
              preset: p,
            }))}
            onSelect={applyPreset}
          />
        )}

        {!editing && recent.length > 0 && (
          <ChipGroup
            label="Recent"
            hint="Tap to add as an item."
            mode="action"
            scroll
            options={recent.map((r, i) => ({
              value: `recent-${i}`,
              label: `${r.item_name} · ${r.amount} ${r.amount_unit}`,
              entry: r,
            }))}
            onSelect={applyRecent}
          />
        )}

        <IntakeItemsEditor
          patient={patient}
          items={items}
          onChange={setItems}
          maxItems={editing ? 1 : null}
          // Linked to a scheduled feed: show its planned totals and what the
          // mix is still missing while it is being built.
          target={linkedFeed ? feedTarget(linkedFeed) : null}
          targetLabel={linkedFeed?.name}
          idPrefix="intake"
        />

        <DisclosureRow
          label="Notes"
          optional
          summary={notes ? notes.slice(0, 60) : undefined}
        >
          <textarea
            className="em-input"
            rows={3}
            placeholder="Anything worth passing on"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </DisclosureRow>

        <div className="em-footer">
          <button type="button" className="em-cancel" onClick={onClose}>Cancel</button>
          <button type="submit" className="em-submit" disabled={!canSave}>
            {submitLabel}
          </button>
        </div>
      </form>
    </EntityModal>
  );
}
