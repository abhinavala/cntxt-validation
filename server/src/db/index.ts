import Database from 'better-sqlite3';
import { runMigrations } from './migrate.js';

export type getDb = () => Database.Database;
export type closeDb = () => void;

let db: Database.Database | null = null;

export const getDb: getDb = (): Database.Database => {
  if (db) return db;

  const dbPath = process.env.WARDEN_DB_PATH ?? './warden.db';
  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  runMigrations(db);

  return db;
};

export const closeDb: closeDb = (): void => {
  if (db) {
    db.close();
    db = null;
  }
};
