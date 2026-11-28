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
"""Occurrence-specific reminders and profile defaults for new schedules."""
import sqlalchemy as sa
from alembic import op

revision = '062_schedule_reminders'
down_revision = '061_check_recipients'
branch_labels = None
depends_on = None

TABLES = ('patients', 'medication_schedule', 'care_task_schedule', 'nutrition_schedules')
SCHEDULES = {'medication_schedule': 'medications', 'care_task_schedule': 'care_tasks', 'nutrition_schedules': 'nutrition'}
# The first two historical log tables store the original firing as naive UTC.
LOGS = {
    'medication_log': ('medications', 'schedule_id', 'scheduled_time', "NEW.scheduled_time AT TIME ZONE 'UTC'"),
    'care_task_log': ('care_tasks', 'schedule_id', 'scheduled_time', "NEW.scheduled_time AT TIME ZONE 'UTC'"),
    'nutrition_intake': ('nutrition', 'schedule_id', 'scheduled_time', 'NEW.scheduled_time'),
    'schedule_manager_actions': ('nutrition', 'check_schedule_id', 'check_scheduled_time', 'NEW.check_scheduled_time'),
}


def upgrade():
    for table in TABLES:
        op.add_column(table, sa.Column('reminder_window_minutes', sa.Integer, nullable=True))
        op.create_check_constraint(f'ck_{table}_reminder_window', table, 'reminder_window_minutes > 0')
    op.create_table('schedule_reminders',
        sa.Column('patient_id', sa.Integer, sa.ForeignKey('patients.id', ondelete='CASCADE'), primary_key=True),
        sa.Column('category', sa.String(16), primary_key=True),
        sa.Column('schedule_id', sa.Integer, primary_key=True),
        sa.Column('scheduled_at', sa.DateTime(timezone=True), primary_key=True),
        sa.Column('original_due_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('deadline_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('remind_at', sa.DateTime(timezone=True)),
        sa.Column('notified_at', sa.DateTime(timezone=True)),
        sa.Column('updated_by', sa.Integer, sa.ForeignKey('users.id', ondelete='SET NULL')),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("category IN ('medications', 'care_tasks', 'nutrition')", name='ck_reminder_category'),
        sa.CheckConstraint('remind_at IS NULL OR remind_at <= deadline_at', name='ck_reminder_deadline'),
    )
    op.create_index('ix_schedule_reminders_pending', 'schedule_reminders', ['patient_id', 'category', 'remind_at'])

    # A polymorphic schedule key cannot have a normal FK to three tables.
    # A database trigger also covers parent cascades, imports and bulk deletes.
    op.execute("""
        CREATE FUNCTION delete_schedule_reminders() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN
            DELETE FROM schedule_reminders WHERE category = TG_ARGV[0] AND schedule_id = OLD.id;
            RETURN OLD;
        END $$;
    """)
    for table, category in SCHEDULES.items():
        op.execute(f"CREATE TRIGGER delete_reminders AFTER DELETE ON {table} FOR EACH ROW "
                   f"EXECUTE FUNCTION delete_schedule_reminders('{category}')")

    # Charting and snoozing serialize on the same patient. Clearing in the
    # original chart transaction covers single, bulk, historical and mixed feeds.
    for table, (category, schedule, timestamp, instant) in LOGS.items():
        op.execute(f"""
            CREATE FUNCTION clear_reminder_{table}() RETURNS trigger LANGUAGE plpgsql AS $$
            BEGIN
                PERFORM id FROM patients WHERE id = NEW.patient_id FOR NO KEY UPDATE;
                UPDATE schedule_reminders SET remind_at = NULL, notified_at = NULL, updated_at = now()
                  WHERE patient_id = NEW.patient_id AND category = '{category}'
                    AND schedule_id = NEW.{schedule} AND scheduled_at = date_trunc('minute', {instant})
                    AND remind_at IS NOT NULL;
                RETURN NEW;
            END $$;
            CREATE TRIGGER clear_reminder BEFORE INSERT OR UPDATE OF {schedule}, {timestamp} ON {table}
              FOR EACH ROW WHEN (NEW.{schedule} IS NOT NULL AND NEW.{timestamp} IS NOT NULL)
              EXECUTE FUNCTION clear_reminder_{table}();
        """)


def downgrade():
    for table in LOGS:
        op.execute(f"DROP TRIGGER clear_reminder ON {table}")
        op.execute(f"DROP FUNCTION clear_reminder_{table}()")
    for table in SCHEDULES:
        op.execute(f"DROP TRIGGER delete_reminders ON {table}")
    op.execute("DROP FUNCTION delete_schedule_reminders()")
    op.drop_table('schedule_reminders')
    for table in TABLES:
        op.drop_constraint(f'ck_{table}_reminder_window', table, type_='check')
        op.drop_column(table, 'reminder_window_minutes')
