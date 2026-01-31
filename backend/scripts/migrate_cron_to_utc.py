#!/usr/bin/env python3
"""
Migration script to convert cron expressions from EST (UTC-5) to UTC.

This script updates all cron expressions in:
- medication_schedule
- care_task_schedule  
- nutrition_schedules

Run with: python scripts/migrate_cron_to_utc.py
"""
import sys
import os

# Add parent directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
import re

# EST offset (UTC-5). Positive because we're adding to convert EST -> UTC
EST_OFFSET_HOURS = 5

def convert_cron_to_utc(cron_expression: str) -> str:
    """
    Convert a cron expression from EST to UTC by adding 5 hours to the hour field.
    
    Handles:
    - Simple hours: "0 8 * * *" -> "0 13 * * *"
    - Hour ranges: "0 8-17 * * *" -> "0 13-22 * * *"
    - Hour lists: "0 8,12,20 * * *" -> "0 13,17,1 * * *" (with day-of-week adjustment)
    - Day wraparound: "0 20 * * 1,3,5" -> "0 1 * * 2,4,6" (next day)
    """
    parts = cron_expression.strip().split()
    if len(parts) != 5:
        print(f"  WARNING: Invalid cron expression (not 5 parts): {cron_expression}")
        return cron_expression
    
    minute, hour, day_of_month, month, day_of_week = parts
    
    # Handle hour field
    new_hour, day_shift = convert_hour_field(hour)
    
    # Handle day-of-week field if there's a day shift
    new_day_of_week = day_of_week
    if day_shift != 0 and day_of_week != '*':
        new_day_of_week = shift_day_of_week(day_of_week, day_shift)
    
    # Handle day-of-month if there's a day shift (more complex, skip for now)
    new_day_of_month = day_of_month
    if day_shift != 0 and day_of_month != '*':
        print(f"  WARNING: Day-of-month shift needed but not implemented: {cron_expression}")
    
    return f"{minute} {new_hour} {new_day_of_month} {month} {new_day_of_week}"


def convert_hour_field(hour_field: str) -> tuple:
    """
    Convert hour field from EST to UTC.
    Returns (new_hour_field, day_shift) where day_shift is 0, 1, or -1.
    """
    if hour_field == '*':
        return '*', 0
    
    # Handle step values like */2
    if '/' in hour_field:
        base, step = hour_field.split('/')
        if base == '*':
            return hour_field, 0  # */n doesn't change with timezone
        new_base, day_shift = convert_hour_field(base)
        return f"{new_base}/{step}", day_shift
    
    # Handle ranges like 8-17
    if '-' in hour_field and ',' not in hour_field:
        start, end = hour_field.split('-')
        new_start = (int(start) + EST_OFFSET_HOURS) % 24
        new_end = (int(end) + EST_OFFSET_HOURS) % 24
        day_shift = 1 if int(start) + EST_OFFSET_HOURS >= 24 else 0
        
        # If range wraps around midnight, this is complex - just convert simply
        if new_start > new_end:
            print(f"  WARNING: Range wraps around midnight after conversion: {hour_field}")
        
        return f"{new_start}-{new_end}", day_shift
    
    # Handle lists like 8,12,20
    if ',' in hour_field:
        hours = hour_field.split(',')
        new_hours = []
        day_shifts = []
        for h in hours:
            new_h = (int(h) + EST_OFFSET_HOURS) % 24
            new_hours.append(str(new_h))
            day_shifts.append(1 if int(h) + EST_OFFSET_HOURS >= 24 else 0)
        
        # Check if all day shifts are the same
        if len(set(day_shifts)) > 1:
            print(f"  WARNING: Mixed day shifts in hour list: {hour_field} -> some wrap, some don't")
        
        return ','.join(new_hours), day_shifts[0] if day_shifts else 0
    
    # Simple single hour
    try:
        hour_int = int(hour_field)
        new_hour = (hour_int + EST_OFFSET_HOURS) % 24
        day_shift = 1 if hour_int + EST_OFFSET_HOURS >= 24 else 0
        return str(new_hour), day_shift
    except ValueError:
        print(f"  WARNING: Cannot parse hour field: {hour_field}")
        return hour_field, 0


def shift_day_of_week(dow_field: str, shift: int) -> str:
    """
    Shift day-of-week field by given number of days.
    Cron days: 0=Sunday, 1=Monday, ..., 6=Saturday
    """
    if dow_field == '*':
        return '*'
    
    # Handle lists like 1,3,5
    if ',' in dow_field:
        days = dow_field.split(',')
        new_days = []
        for d in days:
            new_d = (int(d) + shift) % 7
            new_days.append(str(new_d))
        return ','.join(new_days)
    
    # Handle ranges like 1-5
    if '-' in dow_field:
        start, end = dow_field.split('-')
        new_start = (int(start) + shift) % 7
        new_end = (int(end) + shift) % 7
        return f"{new_start}-{new_end}"
    
    # Single day
    try:
        day_int = int(dow_field)
        new_day = (day_int + shift) % 7
        return str(new_day)
    except ValueError:
        return dow_field


def migrate_table(session, table_name: str, cron_column: str = 'cron_expression'):
    """Migrate cron expressions in a specific table."""
    print(f"\n{'='*60}")
    print(f"Migrating {table_name}")
    print('='*60)
    
    # Fetch all records with cron expressions
    result = session.execute(text(f"SELECT id, {cron_column} FROM {table_name}"))
    rows = result.fetchall()
    
    if not rows:
        print(f"  No records found in {table_name}")
        return 0
    
    updated = 0
    for row in rows:
        record_id, old_cron = row
        if not old_cron:
            continue
            
        new_cron = convert_cron_to_utc(old_cron)
        
        if new_cron != old_cron:
            print(f"  ID {record_id}: {old_cron} -> {new_cron}")
            session.execute(
                text(f"UPDATE {table_name} SET {cron_column} = :new_cron WHERE id = :id"),
                {"new_cron": new_cron, "id": record_id}
            )
            updated += 1
        else:
            print(f"  ID {record_id}: {old_cron} (no change)")
    
    return updated


def main():
    # Get database URL from environment or use default
    database_url = os.environ.get('DATABASE_URL', 'postgresql://admin:admin123@localhost:5432/shh_device')
    
    print("="*60)
    print("CRON EXPRESSION MIGRATION: EST -> UTC")
    print("="*60)
    print(f"Database: {database_url.split('@')[1] if '@' in database_url else database_url}")
    print(f"EST Offset: +{EST_OFFSET_HOURS} hours")
    print()
    
    # Confirm before proceeding
    response = input("This will modify cron expressions in the database. Continue? (yes/no): ")
    if response.lower() != 'yes':
        print("Aborted.")
        return
    
    engine = create_engine(database_url)
    Session = sessionmaker(bind=engine)
    session = Session()
    
    try:
        total_updated = 0
        
        # Migrate each table
        total_updated += migrate_table(session, 'medication_schedule')
        total_updated += migrate_table(session, 'care_task_schedule')
        total_updated += migrate_table(session, 'nutrition_schedules')
        
        # Commit all changes
        session.commit()
        
        print(f"\n{'='*60}")
        print(f"MIGRATION COMPLETE: {total_updated} records updated")
        print('='*60)
        
    except Exception as e:
        session.rollback()
        print(f"\nERROR: {e}")
        print("Changes rolled back.")
        raise
    finally:
        session.close()


if __name__ == '__main__':
    main()
