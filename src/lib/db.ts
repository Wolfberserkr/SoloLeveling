import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';

const DB_FILE = process.env.DATABASE_FILE || path.join(process.cwd(), 'data', 'sololeveling.db');

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (_db) return _db;
  const dir = path.dirname(DB_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  _db = new Database(DB_FILE);
  _db.pragma('journal_mode = WAL');
  _db.pragma('foreign_keys = ON');
  initSchema(_db);
  return _db;
}

function initSchema(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      hunter_name TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      expires_at INTEGER NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS hunter_stats (
      user_id INTEGER PRIMARY KEY,
      level INTEGER NOT NULL DEFAULT 1,
      xp INTEGER NOT NULL DEFAULT 0,
      rank TEXT NOT NULL DEFAULT 'E',
      str INTEGER NOT NULL DEFAULT 10,
      agi INTEGER NOT NULL DEFAULT 10,
      vit INTEGER NOT NULL DEFAULT 10,
      int_ INTEGER NOT NULL DEFAULT 10,
      per INTEGER NOT NULL DEFAULT 10,
      stat_points INTEGER NOT NULL DEFAULT 0,
      streak INTEGER NOT NULL DEFAULT 0,
      last_quest_date TEXT,
      shadows_collected INTEGER NOT NULL DEFAULT 0,
      mana INTEGER NOT NULL DEFAULT 100,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS daily_quests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      quest_date TEXT NOT NULL,
      quest_key TEXT NOT NULL,
      label TEXT NOT NULL,
      target INTEGER NOT NULL,
      progress INTEGER NOT NULL DEFAULT 0,
      unit TEXT,
      completed INTEGER NOT NULL DEFAULT 0,
      UNIQUE(user_id, quest_date, quest_key),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS workout_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      session_date TEXT NOT NULL,
      session_key TEXT NOT NULL,
      exercise_key TEXT NOT NULL,
      set_index INTEGER NOT NULL,
      weight REAL,
      reps INTEGER,
      completed_at INTEGER NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_workout_user_date ON workout_logs(user_id, session_date);
    CREATE INDEX IF NOT EXISTS idx_workout_user_ex ON workout_logs(user_id, exercise_key);

    CREATE TABLE IF NOT EXISTS achievements (
      user_id INTEGER NOT NULL,
      achievement_key TEXT NOT NULL,
      unlocked_at INTEGER NOT NULL,
      PRIMARY KEY (user_id, achievement_key),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS power_ups (
      user_id INTEGER NOT NULL,
      power_up_key TEXT NOT NULL,
      quantity INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (user_id, power_up_key),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS active_buffs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      buff_key TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      kind TEXT NOT NULL,
      title TEXT NOT NULL,
      body TEXT,
      created_at INTEGER NOT NULL,
      read INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);
}
