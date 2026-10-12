# Patient backup and restore

Patient backups move one care profile into an existing account. Every restore
creates a new patient and remaps record identifiers; it does not replace or merge
an existing profile. Use a full database and file-store backup for recovery of
the entire installation.

The system-admin export and import endpoints are available under Configuration
→ Backup. New exports use format 4, with an explicit schema contract, record
counts, and checksummed attachment payloads. Use the same application build for
export and restore. Older applications cannot read format 4. This importer also
accepts formats 1–3, but reports omissions that those older archives cannot
recover.

| Included | Handling |
| --- | --- |
| Medications, care tasks, schedules, completed and voided history | Preserve records and remap caregiver, schedule and task references. |
| Nutrition library, presets, schedule components, intake/output, goals and flush followups | Copy shared library entries into the restored patient's scope without replacing the destination's shared library. Preserve grouped events with fresh group identifiers. |
| Vitals, pulse-ox samples, alerts and ventilator history | Preserve timestamps and remap relationships. Large sample tables use batched NDJSON import/export. |
| Equipment, stock counts, supplier aliases and shipment/template history | Preserve patient records and internal relationships; shared business links need reconciliation. |
| Diagnoses, notes, allergies, implants, providers, clinical results | Preserve the patient record graph, including referenced clinical documents. |
| Patient ranges, ventilator display choices and profile photo | Preserve patient configuration; clear HA identity links for deliberate relinking. |
| Stored documents, packing slips and original ventilator uploads | Copy payloads into fresh destination paths, verify checksums, and clean newly created files if the database restore fails. |

Account credentials, users, roles, patient access grants, reader registrations,
pairing keys, integration credentials, MQTT settings and HA entity mappings are
configured separately. Shared environmental history, operational messages,
acknowledgements, parser dictionaries and ingest deduplication ledgers are also
excluded. The archive manifest and restore response describe the exclusions.
Review integration deduplication before enabling live importers.

Supplier/pharmacy/provider-business and care-task-category references are
cleared because their shared directory records are not in the patient archive.
Create the intended destination caregiver profiles before importing: historical
attribution matches by username within the destination account. Unmatched
caregivers map to an inactive Imported user and produce a restore warning.
Confirm that matching usernames identify the same people.

Missing source attachments, unsupported tables/fields, incomplete record
graphs, and cross-account or cross-patient dependencies fail explicitly. A
missing stored file must be recovered or deliberately reconciled on the source
before exporting; a successful archive should not silently omit it. Format 4
requires every declared record member, exact schema fields and matching counts.
Archives cannot select arbitrary destination paths or overwrite existing files.

The obsolete `external_alarms` GPIO table was never created by the migration
chain. An installation without it exports an empty legacy-alarm member; an
older installation that has it exports its patient-linked rows. A destination
without that table explicitly rejects an archive containing those rows before
writing anything. Reconcile that legacy schema before importing such history;
restore does not create tables or discard the records. Other missing database
tables remain errors.

For a migration, pause source writers or export from a consistent isolated
database/files snapshot. The exporter reads multiple tables and does not itself
freeze ingestion. Although sensor rows stream in batches, the compressed
archive is held in memory, so measure memory, disk usage and transfer duration
with the actual dataset before scheduling the handoff.

Rehearse in a separate instance with live device and integration connections
blocked. Compare database counts, timestamps, relationships, caregiver
attribution and attachment checksums independently of the HTTP success response.
Keep a full recovery backup of both installations. If an import request loses
its connection, check whether the new patient was created before retrying; an
import is not idempotent.

The portable table registry and intentional exclusions are maintained in
[backup_records.py](crud/backup_records.py). Its coverage guard fails export if a
new patient/child table has not been accounted for. New fields or relationships
also need roundtrip coverage. Run `test_backup.py`, `test_backup_migration.py`,
`test_backup_attachments.py`, `test_backup_blob_roundtrip.py`, and
`test_backup_concurrency.py` through the isolated TimescaleDB test stack described
in `docker-compose.test.yml` at the repository root.
