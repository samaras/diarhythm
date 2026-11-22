import Database from 'better-sqlite3'
import fs from 'node:fs'
import path from 'node:path'

export type SqliteDatabase = Database.Database

export function openDatabase(dbPath: string): SqliteDatabase {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true })
  const db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  ensureSchema(db)
  return db
}

export function ensureSchema(db: SqliteDatabase): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS glucose_entries (
      id INTEGER PRIMARY KEY, value REAL NOT NULL CHECK(value > 0), unit TEXT NOT NULL CHECK(unit IN ('mmol/L','mg/dL')),
      context TEXT NOT NULL, recorded_at TEXT NOT NULL, notes TEXT NOT NULL DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS medications (
      id INTEGER PRIMARY KEY, name TEXT NOT NULL, prescribed_schedule TEXT NOT NULL DEFAULT '', reminder_time TEXT NOT NULL DEFAULT '', active INTEGER NOT NULL DEFAULT 1
    );
    CREATE TABLE IF NOT EXISTS medication_events (
      id INTEGER PRIMARY KEY, medication_id INTEGER NOT NULL REFERENCES medications(id) ON DELETE CASCADE,
      scheduled_at TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('taken','skipped')), recorded_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS daily_logs (
      id INTEGER PRIMARY KEY, kind TEXT NOT NULL CHECK(kind IN ('meal','activity','note')),
      description TEXT NOT NULL, recorded_at TEXT NOT NULL, duration_minutes INTEGER, notes TEXT NOT NULL DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS app_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS consent_records (id INTEGER PRIMARY KEY, consent_type TEXT NOT NULL, policy_version TEXT NOT NULL, granted_at TEXT NOT NULL, withdrawn_at TEXT);
    CREATE INDEX IF NOT EXISTS idx_glucose_recorded ON glucose_entries(recorded_at);
    CREATE INDEX IF NOT EXISTS idx_events_scheduled ON medication_events(scheduled_at);
    CREATE INDEX IF NOT EXISTS idx_logs_recorded ON daily_logs(recorded_at);
  `)
}
