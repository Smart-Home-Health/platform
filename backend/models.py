from sqlalchemy import Column, Integer, String, Float, Text, ForeignKey, Boolean, DateTime
from sqlalchemy import TIMESTAMP
from sqlalchemy.orm import declarative_base, relationship

Base = declarative_base()

class Patient(Base):
    __tablename__ = 'patients'
    id = Column(Integer, primary_key=True, autoincrement=True)
    first_name = Column(String, nullable=False)
    last_name = Column(String, nullable=False)
    date_of_birth = Column(DateTime, nullable=True)
    medical_record_number = Column(String, nullable=True, unique=True)
    is_active = Column(Boolean, default=True, nullable=False)
    notes = Column(Text, nullable=True)
    created_at = Column(TIMESTAMP(timezone=True), nullable=False)
    updated_at = Column(TIMESTAMP(timezone=True), nullable=False)
    
    # Relationships
    vitals = relationship('Vital', back_populates='patient')
    pulse_ox_data = relationship('PulseOxData', back_populates='patient')
    blood_pressure = relationship('BloodPressure', back_populates='patient')
    temperature = relationship('Temperature', back_populates='patient')
    monitoring_alerts = relationship('MonitoringAlert', back_populates='patient')
    ventilator_alerts = relationship('VentilatorAlert', back_populates='patient')
    medication_logs = relationship('MedicationLog', back_populates='patient')
    care_task_logs = relationship('CareTaskLog', back_populates='patient')
    equipment = relationship('Equipment', back_populates='patient')
    nutrition_intake = relationship('NutritionIntake', back_populates='patient')

class BloodPressure(Base):
    __tablename__ = 'blood_pressure'
    id = Column(Integer, primary_key=True, autoincrement=True)
    patient_id = Column(Integer, ForeignKey('patients.id'), nullable=False)
    timestamp = Column(TIMESTAMP(timezone=True), nullable=False)
    systolic = Column(Integer, nullable=False)
    diastolic = Column(Integer, nullable=False)
    map = Column(Integer, nullable=False)
    raw_data = Column(Text, nullable=False)
    created_at = Column(TIMESTAMP(timezone=True), nullable=False)
    
    # Relationships
    patient = relationship('Patient', back_populates='blood_pressure')

class Temperature(Base):
    __tablename__ = 'temperature'
    id = Column(Integer, primary_key=True, autoincrement=True)
    patient_id = Column(Integer, ForeignKey('patients.id'), nullable=False)
    timestamp = Column(TIMESTAMP(timezone=True), nullable=False)
    skin_temp = Column(Float)
    body_temp = Column(Float)
    raw_data = Column(Text, nullable=False)
    created_at = Column(TIMESTAMP(timezone=True), nullable=False)
    
    # Relationships
    patient = relationship('Patient', back_populates='temperature')

class Vital(Base):
    __tablename__ = 'vitals'
    id = Column(Integer, primary_key=True, autoincrement=True)
    patient_id = Column(Integer, ForeignKey('patients.id'), nullable=False)
    timestamp = Column(TIMESTAMP(timezone=True), nullable=False)
    vital_type = Column(String, nullable=False)
    vital_group = Column(String, nullable=True)  # Sub-type or grouping (e.g., 'systolic', 'diastolic', 'map' for BP)
    value = Column(Float, nullable=False)
    notes = Column(Text)
    created_at = Column(TIMESTAMP(timezone=True), nullable=False)
    
    # Relationships
    patient = relationship('Patient', back_populates='vitals')

class Setting(Base):
    __tablename__ = 'settings'
    key = Column(String, primary_key=True)
    value = Column(Text, nullable=False)
    data_type = Column(String, nullable=False)
    description = Column(Text)
    updated_at = Column(TIMESTAMP(timezone=True), nullable=False)

class PulseOxData(Base):
    __tablename__ = 'pulse_ox_data'
    id = Column(Integer, primary_key=True, autoincrement=True)
    patient_id = Column(Integer, ForeignKey('patients.id'), nullable=False)
    timestamp = Column(TIMESTAMP(timezone=True), nullable=False)
    spo2 = Column(Integer)
    bpm = Column(Integer)
    pa = Column(Float)
    status = Column(String)
    motion = Column(String)
    spo2_alarm = Column(String)
    hr_alarm = Column(String)
    raw_data = Column(Text)
    created_at = Column(TIMESTAMP(timezone=True), nullable=False)
    
    # Relationships
    patient = relationship('Patient', back_populates='pulse_ox_data')

class MonitoringAlert(Base):
    __tablename__ = 'monitoring_alerts'
    id = Column(Integer, primary_key=True, autoincrement=True)
    patient_id = Column(Integer, ForeignKey('patients.id'), nullable=False)
    start_time = Column(TIMESTAMP(timezone=True), nullable=False)
    end_time = Column(TIMESTAMP(timezone=True))
    start_data_id = Column(Integer)
    end_data_id = Column(Integer)
    acknowledged = Column(Boolean, default=False)
    spo2_min = Column(Integer)
    bpm_min = Column(Integer)
    spo2_max = Column(Integer)
    bpm_max = Column(Integer)
    spo2_alarm_triggered = Column(Boolean, default=False)
    hr_alarm_triggered = Column(Boolean, default=False)
    external_alarm_triggered = Column(Boolean, default=False)
    oxygen_used = Column(Boolean, default=False)
    oxygen_highest = Column(Float)
    oxygen_unit = Column(String)
    created_at = Column(TIMESTAMP(timezone=True), nullable=False)
    
    # Relationships
    patient = relationship('Patient', back_populates='monitoring_alerts')

class VentilatorAlert(Base):
    __tablename__ = 'ventilator_alerts'
    id = Column(Integer, primary_key=True, autoincrement=True)
    patient_id = Column(Integer, ForeignKey('patients.id'), nullable=False)
    device_id = Column(String, nullable=False)
    pin = Column(Integer, nullable=False)
    start_time = Column(TIMESTAMP(timezone=True), nullable=False)
    end_time = Column(TIMESTAMP(timezone=True))
    last_activity = Column(TIMESTAMP(timezone=True), nullable=False)
    acknowledged = Column(Boolean, default=False)
    notes = Column(Text)
    created_at = Column(TIMESTAMP(timezone=True), nullable=False)
    
    # Relationships
    patient = relationship('Patient', back_populates='ventilator_alerts')

class ExternalAlarm(Base):
    __tablename__ = 'external_alarms'
    id = Column(Integer, primary_key=True, autoincrement=True)
    alert_id = Column(Integer, ForeignKey('monitoring_alerts.id'))
    device_id = Column(String, nullable=False)
    pin = Column(Integer, nullable=False)
    start_time = Column(TIMESTAMP(timezone=True), nullable=False)
    end_time = Column(TIMESTAMP(timezone=True))
    last_activity = Column(TIMESTAMP(timezone=True), nullable=False)
    acknowledged = Column(Boolean, default=False)
    created_at = Column(TIMESTAMP(timezone=True), nullable=False)
    monitoring_alert = relationship('MonitoringAlert', backref='external_alarms')

class Equipment(Base):
    __tablename__ = 'equipment'
    id = Column(Integer, primary_key=True, autoincrement=True)
    patient_id = Column(Integer, ForeignKey('patients.id'), nullable=True)  # NULL = shared equipment
    name = Column(String, nullable=False)
    quantity = Column(Integer, nullable=False, default=1)
    scheduled_replacement = Column(Boolean, nullable=False, default=True)
    last_changed = Column(TIMESTAMP(timezone=True), nullable=True)  # Nullable when scheduled_replacement is False
    useful_days = Column(Integer, nullable=True)  # Nullable when scheduled_replacement is False
    created_at = Column(TIMESTAMP(timezone=True), nullable=False)
    updated_at = Column(TIMESTAMP(timezone=True), nullable=False)
    
    # Relationships
    patient = relationship('Patient', foreign_keys=[patient_id])
    change_logs = relationship('EquipmentChangeLog', back_populates='equipment')

class EquipmentChangeLog(Base):
    __tablename__ = 'equipment_change_log'
    id = Column(Integer, primary_key=True, autoincrement=True)
    equipment_id = Column(Integer, ForeignKey('equipment.id'), nullable=False)
    patient_id = Column(Integer, ForeignKey('patients.id'), nullable=True)  # Track which patient the change was for
    changed_at = Column(TIMESTAMP(timezone=True), nullable=False)
    notes = Column(Text, nullable=True)
    changed_by = Column(String, nullable=True)
    created_at = Column(TIMESTAMP(timezone=True), nullable=False)
    
    # Relationships
    equipment = relationship('Equipment', back_populates='change_logs')
    patient = relationship('Patient', foreign_keys=[patient_id])

class Medication(Base):
    __tablename__ = 'medication'
    id = Column(Integer, primary_key=True, autoincrement=True)
    patient_id = Column(Integer, ForeignKey('patients.id'), nullable=True)  # NULL = global medication
    name = Column(String, nullable=False)
    concentration = Column(String)
    quantity = Column(Float, nullable=False)
    quantity_unit = Column(String, nullable=False, default='tablets')
    instructions = Column(Text)
    start_date = Column(TIMESTAMP(timezone=True), nullable=True)
    end_date = Column(TIMESTAMP(timezone=True), nullable=True)
    as_needed = Column(Boolean, default=False)
    notes = Column(Text)
    active = Column(Boolean, default=True)
    created_at = Column(TIMESTAMP(timezone=True), nullable=False)
    updated_at = Column(TIMESTAMP(timezone=True), nullable=False)
    
    # Relationships
    patient = relationship('Patient', foreign_keys=[patient_id])
    schedules = relationship('MedicationSchedule', back_populates='medication', cascade='all, delete-orphan')
    administration_logs = relationship('MedicationLog', back_populates='medication', cascade='all, delete-orphan')

class MedicationSchedule(Base):
    __tablename__ = 'medication_schedule'
    id = Column(Integer, primary_key=True, autoincrement=True)
    medication_id = Column(Integer, ForeignKey('medication.id'), nullable=False)
    patient_id = Column(Integer, ForeignKey('patients.id'), nullable=True)  # Can be NULL for global meds
    
    # Cron expression for scheduling (e.g., "30 8 * * 1,3,5" for Mon/Wed/Fri at 8:30 AM)
    cron_expression = Column(String, nullable=False)
    
    # Human-readable description of the schedule (optional, for display purposes)
    description = Column(String, nullable=True)
    
    # Dose information for this specific schedule
    dose_amount = Column(Float, nullable=True)  # Amount per dose (e.g., 1, 0.5, 2) - unit inherited from medication
    
    # Active indicator - allows users to temporarily disable schedules
    active = Column(Boolean, default=True, nullable=False)
    
    # Optional notes for this specific schedule
    notes = Column(Text, nullable=True)
    
    # Timestamps
    created_at = Column(TIMESTAMP(timezone=True), nullable=False)
    updated_at = Column(TIMESTAMP(timezone=True), nullable=False)
    
    # Relationships
    medication = relationship('Medication', back_populates='schedules')
    patient = relationship('Patient', foreign_keys=[patient_id])
    administration_logs = relationship('MedicationLog', back_populates='schedule')

class MedicationLog(Base):
    __tablename__ = 'medication_log'
    id = Column(Integer, primary_key=True, autoincrement=True)
    medication_id = Column(Integer, ForeignKey('medication.id'), nullable=False)
    patient_id = Column(Integer, ForeignKey('patients.id'), nullable=False)  # Always required for logs
    schedule_id = Column(Integer, ForeignKey('medication_schedule.id'), nullable=True)  # Null if administered without schedule
    
    # Administration details
    administered_at = Column(TIMESTAMP(timezone=True), nullable=False)
    dose_amount = Column(Float, nullable=False)  # Amount actually given - unit inherited from medication
    
    # Schedule tracking (only relevant if schedule_id is not null)
    is_scheduled = Column(Boolean, default=False, nullable=False)  # True if this was a scheduled dose
    scheduled_time = Column(TIMESTAMP(timezone=True), nullable=True)  # The originally scheduled time for this dose
    administered_early = Column(Boolean, default=False, nullable=False)  # True if given before scheduled time
    administered_late = Column(Boolean, default=False, nullable=False)   # True if given after scheduled time
    
    # Optional details
    notes = Column(Text, nullable=True)  # Any notes about this administration
    administered_by = Column(String, nullable=True)  # Who administered it (optional)
    
    # Timestamps
    created_at = Column(TIMESTAMP(timezone=True), nullable=False)
    
    # Relationships
    medication = relationship('Medication', back_populates='administration_logs')
    patient = relationship('Patient', back_populates='medication_logs')
    schedule = relationship('MedicationSchedule', back_populates='administration_logs')

class CareTaskCategory(Base):
    __tablename__ = 'care_task_category'
    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String, nullable=False, unique=True)
    description = Column(Text, nullable=True)
    color = Column(String, nullable=True)  # Hex color code for category display
    is_default = Column(Boolean, default=False, nullable=False)  # True for non-deletable default categories
    active = Column(Boolean, default=True, nullable=False)
    created_at = Column(TIMESTAMP(timezone=True), nullable=False)
    updated_at = Column(TIMESTAMP(timezone=True), nullable=False)
    
    # Relationships
    care_tasks = relationship('CareTask', back_populates='category')

class CareTask(Base):
    __tablename__ = 'care_task'
    id = Column(Integer, primary_key=True, autoincrement=True)
    patient_id = Column(Integer, ForeignKey('patients.id'), nullable=True)  # NULL = global task template
    name = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    category_id = Column(Integer, ForeignKey('care_task_category.id'), nullable=True)  # Reference to category
    active = Column(Boolean, default=True)
    created_at = Column(TIMESTAMP(timezone=True), nullable=False)
    updated_at = Column(TIMESTAMP(timezone=True), nullable=False)
    
    # Relationships
    patient = relationship('Patient', foreign_keys=[patient_id])
    category = relationship('CareTaskCategory', back_populates='care_tasks')
    schedules = relationship('CareTaskSchedule', back_populates='care_task', cascade='all, delete-orphan')
    completion_logs = relationship('CareTaskLog', back_populates='care_task', cascade='all, delete-orphan')

class CareTaskSchedule(Base):
    __tablename__ = 'care_task_schedule'
    id = Column(Integer, primary_key=True, autoincrement=True)
    care_task_id = Column(Integer, ForeignKey('care_task.id'), nullable=False)
    patient_id = Column(Integer, ForeignKey('patients.id'), nullable=True)  # Can be NULL for global tasks
    
    # Cron expression for scheduling (e.g., "30 8 * * 1,3,5" for Mon/Wed/Fri at 8:30 AM)
    cron_expression = Column(String, nullable=False)
    
    # Human-readable description of the schedule (optional, for display purposes)
    description = Column(String, nullable=True)
    
    # Active indicator - allows users to temporarily disable schedules
    active = Column(Boolean, default=True, nullable=False)
    
    # Optional notes for this specific schedule
    notes = Column(Text, nullable=True)
    
    # Timestamps
    created_at = Column(TIMESTAMP(timezone=True), nullable=False)
    updated_at = Column(TIMESTAMP(timezone=True), nullable=False)
    
    # Relationships
    care_task = relationship('CareTask', back_populates='schedules')
    patient = relationship('Patient', foreign_keys=[patient_id])
    completion_logs = relationship('CareTaskLog', back_populates='schedule')

class CareTaskLog(Base):
    __tablename__ = 'care_task_log'
    id = Column(Integer, primary_key=True, autoincrement=True)
    care_task_id = Column(Integer, ForeignKey('care_task.id'), nullable=False)
    patient_id = Column(Integer, ForeignKey('patients.id'), nullable=False)  # Always required for logs
    schedule_id = Column(Integer, ForeignKey('care_task_schedule.id'), nullable=True)  # Null if completed without schedule
    
    # Completion details
    completed_at = Column(TIMESTAMP(timezone=True), nullable=False)
    
    # Schedule tracking (only relevant if schedule_id is not null)
    is_scheduled = Column(Boolean, default=False, nullable=False)  # True if this was a scheduled task
    scheduled_time = Column(TIMESTAMP(timezone=True), nullable=True)  # The originally scheduled time for this task
    completed_early = Column(Boolean, default=False, nullable=False)  # True if completed before scheduled time
    completed_late = Column(Boolean, default=False, nullable=False)   # True if completed after scheduled time
    
    # Task completion status
    status = Column(String, default='completed', nullable=False)  # completed, skipped, partial
    
    # Optional details
    notes = Column(Text, nullable=True)  # Any notes about this completion
    completed_by = Column(String, nullable=True)  # Who completed it (optional)
    
    # Timestamps
    created_at = Column(TIMESTAMP(timezone=True), nullable=False)
    
    # Relationships
    care_task = relationship('CareTask', back_populates='completion_logs')
    patient = relationship('Patient', back_populates='care_task_logs')
    schedule = relationship('CareTaskSchedule', back_populates='completion_logs')
    nutrition_intake = relationship('NutritionIntake', back_populates='care_task_log')

class NutritionIntake(Base):
    __tablename__ = 'nutrition_intake'
    id = Column(Integer, primary_key=True, autoincrement=True)
    patient_id = Column(Integer, ForeignKey('patients.id'), nullable=False)
    care_task_log_id = Column(Integer, ForeignKey('care_task_log.id'), nullable=True)  # Link to care task completion
    
    # Item details
    item_name = Column(String, nullable=False)  # e.g., "Peptamen", "Water", "Apple"
    item_type = Column(String, nullable=False)  # 'food', 'liquid', 'supplement'
    
    # Nutritional information
    amount = Column(Float, nullable=False)  # Quantity consumed
    amount_unit = Column(String, nullable=False)  # 'ml', 'oz', 'cups', 'grams', 'servings'
    
    # Optional nutritional data
    calories = Column(Float, nullable=True)  # Calories per serving/amount
    protein_grams = Column(Float, nullable=True)
    carbs_grams = Column(Float, nullable=True)
    fat_grams = Column(Float, nullable=True)
    fiber_grams = Column(Float, nullable=True)
    sodium_mg = Column(Float, nullable=True)
    
    # Timing and context
    consumed_at = Column(TIMESTAMP(timezone=True), nullable=False)  # When it was consumed
    meal_type = Column(String, nullable=True)  # 'breakfast', 'lunch', 'dinner', 'snack', 'supplement'
    
    # Additional tracking
    notes = Column(Text, nullable=True)  # Any notes about consumption
    recorded_by = Column(String, nullable=True)  # Who recorded this entry
    
    # Timestamps
    created_at = Column(TIMESTAMP(timezone=True), nullable=False)
    updated_at = Column(TIMESTAMP(timezone=True), nullable=False)
    
    # Relationships
    patient = relationship('Patient', foreign_keys=[patient_id])
    care_task_log = relationship('CareTaskLog', back_populates='nutrition_intake')
