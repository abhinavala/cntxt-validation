import Database from 'better-sqlite3';
import { runMigrations } from '../../db/migrate.js';
import { EventsRepo } from '../../db/repos/events.js';
import { RunsRepo } from '../../db/repos/runs.js';
import { emitEvent } from '../emitter.js';
import { register, unregister } from '../../ws/broadcaster.js';
import { EventType } from '../../../../shared/src/types/events.js';
import type { WsClient } from '../../ws/broadcaster.js';
import { unlinkSync } from 'node:fs';

const TEST_DB = './test_emitter.db';
function cleanup() {
  try { unlinkSync(TEST_DB); } catch { /* ignore */ }
}

let passed = 0;
let failed = 0;
function assert(condition: boolean, msg: string) {
  if (condition) { console.log(`  PASS: ${msg}`); passed++; }
  else { console.error(`  FAIL: ${msg}`); failed++; }
}

function mockClient(): WsClient & { messages: string[] } {
  return { readyState: 1, messages: [], send(data: string) { this.messages.push(data); } };
}

cleanup();
const db = new Database(TEST_DB);
db.pragma('foreign_keys = ON');
runMigrations(db);

// Seed a run for FK
const runsRepo = new RunsRepo(db);
runsRepo.insert({ id: 'run-e1', agent_id: 'agent-e', status: 'active', started_at: new Date().toISOString(), ended_at: null });

const eventsRepo = new EventsRepo(db);

// --- Test 1: Register 3 mock WS clients, emit an event ---
console.log('Test 1: 3 clients receive broadcast, DB row created');
{
  const c1 = mockClient();
  const c2 = mockClient();
  const c3 = mockClient();
  register(c1);
  register(c2);
  register(c3);

  const event = emitEvent({
    id: 'evt-e1',
    run_id: 'run-e1',
    event_type: EventType.run_started,
    detail: 'test run started',
  }, eventsRepo);

  assert(c1.messages.length === 1, 'client 1 received 1 message');
  assert(c2.messages.length === 1, 'client 2 received 1 message');
  assert(c3.messages.length === 1, 'client 3 received 1 message');

  const parsed = JSON.parse(c1.messages[0]);
  assert(parsed.id === 'evt-e1', 'broadcast contains correct event id');
  assert(parsed.event_type === 'run_started', 'broadcast contains correct event_type');

  const row = eventsRepo.findById('evt-e1');
  assert(row !== undefined, 'event row exists in DB');
  assert(row!.event_type === 'run_started', 'DB row has correct event_type');
  assert(row!.detail === 'test run started', 'DB row has correct detail');

  // Clean up clients for next test
  unregister(c1);
  unregister(c2);
  unregister(c3);
}

// --- Test 2: Close one WS client, emit another event ---
console.log('\nTest 2: disconnected client removed, remaining 2 receive broadcast');
{
  const c1 = mockClient();
  const c2 = mockClient();
  const c3 = mockClient();
  register(c1);
  register(c2);
  register(c3);

  // Simulate c3 disconnecting
  c3.readyState = 3; // CLOSED

  const event = emitEvent({
    id: 'evt-e2',
    run_id: 'run-e1',
    event_type: EventType.tool_called,
    detail: 'called some tool',
  }, eventsRepo);

  assert(c1.messages.length === 1, 'client 1 received message');
  assert(c2.messages.length === 1, 'client 2 received message');
  assert(c3.messages.length === 0, 'closed client 3 received nothing');

  const row = eventsRepo.findById('evt-e2');
  assert(row !== undefined, 'second event row exists in DB');

  unregister(c1);
  unregister(c2);
}

db.close();
cleanup();

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
