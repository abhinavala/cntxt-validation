import Database from 'better-sqlite3';
import { runMigrations } from '../migrate.js';
import { unlinkSync } from 'node:fs';

const TEST_DB = './test_warden.db';

function cleanup() {
  try { unlinkSync(TEST_DB); } catch { /* ignore */ }
}

function getTableNames(db: Database.Database): string[] {
  return db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name != '_migrations' ORDER BY name")
    .all()
    .map((row) => (row as { name: string }).name);
}

function getColumns(db: Database.Database, table: string): string[] {
  return db
    .prepare(`PRAGMA table_info(${table})`)
    .all()
    .map((row) => (row as { name: string }).name);
}

let passed = 0;
let failed = 0;

function assert(condition: boolean, msg: string) {
  if (condition) {
    console.log(`  PASS: ${msg}`);
    passed++;
  } else {
    console.error(`  FAIL: ${msg}`);
    failed++;
  }
}

// Test 1: Fresh DB creates all 5 tables
console.log('Test 1: Fresh DB -> run migrations -> all 5 tables present');
cleanup();
{
  const db = new Database(TEST_DB);
  db.pragma('foreign_keys = ON');
  runMigrations(db);

  const tables = getTableNames(db);
  assert(tables.length === 5, `Expected 5 tables, got ${tables.length}: ${tables.join(', ')}`);
  assert(tables.includes('credentials'), 'credentials table exists');
  assert(tables.includes('runs'), 'runs table exists');
  assert(tables.includes('capabilities_granted'), 'capabilities_granted table exists');
  assert(tables.includes('events'), 'events table exists');
  assert(tables.includes('policies'), 'policies table exists');

  // Verify key columns
  const credCols = getColumns(db, 'credentials');
  assert(credCols.includes('id') && credCols.includes('service') && credCols.includes('encrypted_blob'), 'credentials has expected columns');

  const capCols = getColumns(db, 'capabilities_granted');
  assert(capCols.includes('run_id') && capCols.includes('credential_id') && capCols.includes('scope'), 'capabilities_granted has expected columns');

  const eventCols = getColumns(db, 'events');
  assert(eventCols.includes('capability_id') && eventCols.includes('event_type'), 'events has expected columns');

  // Verify _migrations table recorded the migration
  const migrations = db.prepare('SELECT filename FROM _migrations').all() as { filename: string }[];
  assert(migrations.length === 1, `1 migration recorded, got ${migrations.length}`);
  assert(migrations[0].filename === '001_initial.sql', 'Migration filename is 001_initial.sql');

  db.close();
}

// Test 2: Running migrations twice is idempotent
console.log('\nTest 2: Run migrations twice -> no errors, no duplicates');
{
  const db = new Database(TEST_DB);
  db.pragma('foreign_keys = ON');
  runMigrations(db);

  const tables = getTableNames(db);
  assert(tables.length === 5, `Still 5 tables after second run, got ${tables.length}`);

  const migrations = db.prepare('SELECT filename FROM _migrations').all() as { filename: string }[];
  assert(migrations.length === 1, `Still 1 migration record after second run, got ${migrations.length}`);

  db.close();
}

// Test 3: Foreign key constraint on capabilities_granted.run_id
console.log('\nTest 3: FK constraint on capabilities_granted.run_id');
{
  const db = new Database(TEST_DB);
  db.pragma('foreign_keys = ON');

  let fkError = false;
  try {
    db.prepare("INSERT INTO capabilities_granted (id, run_id, credential_id, scope) VALUES ('cap1', 'nonexistent', 'cred1', 'read')").run();
  } catch {
    fkError = true;
  }
  assert(fkError, 'FK constraint prevents insert with unknown run_id');

  db.close();
}

cleanup();

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
