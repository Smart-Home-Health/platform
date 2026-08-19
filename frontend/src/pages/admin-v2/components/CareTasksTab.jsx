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
// The care tasks themselves — what exists, how often it happens, and whether
// it is running. Replaces the table the Manage page used to render.
import { useMemo, useState } from 'react';
import EntityToolbar from '../../../components/vc/EntityToolbar';
import EntityCard from '../../../components/vc/EntityCard';
import {
  CareTasksIcon, ClockIcon, TagIcon, NutritionIcon,
} from '../../../components/Icons';
import { describeCron } from './cronLabel';
import './care-tasks-page.css';

export default function CareTasksTab({
  tasks = [],
  categories = [],
  schedulesByTask = {},
  loading,
  canCreate, canUpdate, canDelete,
  onAdd, onEdit, onDelete, onToggle, onManageSchedules, onManageCategories,
}) {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('active');
  const [categoryFilter, setCategoryFilter] = useState('all');

  const counts = useMemo(() => ({
    active: tasks.filter((t) => t.active !== false).length,
    paused: tasks.filter((t) => t.active === false).length,
  }), [tasks]);

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    return tasks.filter((task) => {
      const isActive = task.active !== false;
      if (status === 'active' && !isActive) return false;
      if (status === 'paused' && isActive) return false;
      if (categoryFilter === 'none' && task.category_id) return false;
      if (categoryFilter !== 'all' && categoryFilter !== 'none'
          && String(task.category_id) !== categoryFilter) return false;
      if (!term) return true;
      return [task.name, task.description, task.category_name]
        .filter(Boolean)
        .some((f) => String(f).toLowerCase().includes(term));
    });
  }, [tasks, search, status, categoryFilter]);

  const menuFor = (task) => {
    const items = [];
    if (canUpdate) {
      items.push({ label: 'Edit', onClick: () => onEdit(task) });
      items.push({ label: 'Schedules', onClick: () => onManageSchedules(task) });
      items.push({
        label: task.active === false ? 'Resume' : 'Pause',
        onClick: () => onToggle(task),
      });
    }
    if (canDelete) {
      items.push({ label: 'Deactivate', onClick: () => onDelete(task), danger: true });
    }
    return items;
  };

  return (
    <div className="ctp">
      <EntityToolbar
        counts={[
          { key: 'active', label: 'Active', count: counts.active },
          { key: 'paused', label: 'Paused', count: counts.paused },
        ]}
        activeCount={status}
        onCountChange={setStatus}
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search care tasks"
        filter={{
          value: categoryFilter,
          onChange: setCategoryFilter,
          label: 'Category',
          options: [
            { value: 'all', label: 'All categories' },
            ...categories.map((c) => ({ value: String(c.id), label: c.name })),
            { value: 'none', label: 'Uncategorised' },
          ],
        }}
        onAdd={canCreate ? onAdd : undefined}
        addLabel="Add task"
      />

      {canUpdate && (
        <div className="ctp-actions">
          <button type="button" className="ctp-link" onClick={onManageCategories}>
            <TagIcon size={15} /> Manage categories
          </button>
        </div>
      )}

      {loading ? (
        <div className="ec-empty">Loading care tasks…</div>
      ) : visible.length === 0 ? (
        <div className="ec-empty">
          <CareTasksIcon size={32} />
          <p>
            {tasks.length === 0
              ? 'No care tasks yet.'
              : 'No care tasks match your search.'}
          </p>
        </div>
      ) : (
        <>
          <h3 className="admin-v2-section-title">
            {status === 'paused' ? 'Paused' : 'Active'} · {visible.length}
          </h3>
          <div className="ec-grid">
            {visible.map((task) => {
              const schedules = schedulesByTask[task.id] || [];
              const running = schedules.filter((s) => s.active !== false);

              const details = [{
                icon: <ClockIcon size={18} />,
                label: 'Runs',
                value: running.length === 0
                  ? 'As needed'
                  : running.length === 1
                    ? describeCron(running[0].cron_expression)
                    : `${running.length} schedules`,
              }];
              if (schedules.length > running.length) {
                details.push({
                  icon: <ClockIcon size={18} />,
                  label: 'Paused',
                  value: `${schedules.length - running.length} schedule${
                    schedules.length - running.length === 1 ? '' : 's'}`,
                });
              }

              const badges = [task.category_name].filter(Boolean);
              // Naming a category "Feeding" changes what completing the task
              // does; the card says so rather than leaving it to be discovered.
              if (task.is_nutrition) badges.push('Records intake');

              return (
                <EntityCard
                  key={task.id}
                  icon={task.is_nutrition
                    ? <NutritionIcon size={18} />
                    : <CareTasksIcon size={18} />}
                  title={task.name}
                  badges={badges}
                  inactive={task.active === false}
                  tag={task.active === false ? { label: 'Paused', tone: 'idle' } : undefined}
                  details={details}
                  menu={menuFor(task)}
                >
                  {task.category_color && (
                    <p className="ctp-cat">
                      <span className="ct-cat-dot" style={{ background: task.category_color }} />
                      {task.category_name}
                    </p>
                  )}
                  {task.description && <p className="ec-note">{task.description}</p>}
                </EntityCard>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
