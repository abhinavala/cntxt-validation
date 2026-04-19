import Database from 'better-sqlite3';
import { runMigrations } from '../migrate.js';
import { CredentialsRepo } from '../repos/credentials.js';
import { RunsRepo } from '../repos/runs.js';
import { CapabilitiesRepo } from '../repos/capabilities.js';
import { EventsRepo } from '../repos/events.js';
import { PoliciesRepo } from '../repos/policies.js';
import { unlinkSync } from 'node:fs';

const TEST_DB = './test_repos.db';
const now = () => new Date().toISOString();

function cleanup() {
  try { unlinkSync(TEST_DB); } catch { /* ignore */ }
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

cleanup();
const db = new Database(TEST_DB);
db.pragma('foreign_keys = ON');
runMigrations(db);

// --- CredentialsRepo ---
console.log('CredentialsRepo');
{
  const repo = new CredentialsRepo(db);
  const ts = now();
  const cred = { id: 'cred-1', service: 'github', label: 'My GH', encrypted_blob: 'enc1', created_at: ts, updated_at: ts };
  repo.insert(cred);

  const found = repo.findById('cred-1');
  assert(found !== undefined, 'findById returns inserted row');
  assert(found!.id === cred.id && found!.service === cred.service && found!.label === cred.label, 'round-trip: insert + findById returns equal object');

  const byService = repo.findByService('github');
  assert(byService.length === 1, 'findByService returns correct results');

  const all = repo.findAll();
  assert(all.length === 1, 'findAll returns all rows');

  const updated = { ...cred, label: 'Updated GH', updated_at: now() };
  const changes = repo.update(updated);
  assert(changes === 1, 'update returns 1');
  assert(repo.findById('cred-1')!.label === 'Updated GH', 'update persists changes');

  const delCount = repo.deleteById('cred-1');
  assert(delCount === 1, 'deleteById returns 1');
  assert(repo.findById('cred-1') === undefined, 'deleted row is gone');
}

// --- RunsRepo ---
console.log('\nRunsRepo');
{
  const repo = new RunsRepo(db);
  const ts = now();
  const run = { id: 'run-1', agent_id: 'agent-a', status: 'active', started_at: ts, ended_at: null };
  repo.insert(run);

  const found = repo.findById('run-1');
  assert(found !== undefined, 'findById returns inserted row');
  assert(found!.id === run.id && found!.agent_id === run.agent_id && found!.status === 'active', 'round-trip: insert + findById returns equal object');

  const byAgent = repo.findByAgentId('agent-a');
  assert(byAgent.length === 1, 'findByAgentId returns correct results');

  const endTs = now();
  const changes = repo.updateStatus('run-1', 'ended', endTs);
  assert(changes === 1, 'updateStatus returns 1');
  const ended = repo.findById('run-1')!;
  assert(ended.status === 'ended' && ended.ended_at === endTs, 'updateStatus persists changes');

  repo.deleteById('run-1');
  assert(repo.findById('run-1') === undefined, 'deleted row is gone');
}

// --- CapabilitiesRepo ---
console.log('\nCapabilitiesRepo');
{
  // Set up prerequisite runs
  const runsRepo = new RunsRepo(db);
  const ts = now();
  runsRepo.insert({ id: 'run-x', agent_id: 'agent-x', status: 'active', started_at: ts, ended_at: null });
  runsRepo.insert({ id: 'run-y', agent_id: 'agent-y', status: 'active', started_at: ts, ended_at: null });

  // Insert a credential for FK
  const credRepo = new CredentialsRepo(db);
  credRepo.insert({ id: 'cred-cap', service: 'github', label: 'cap test', encrypted_blob: 'enc', created_at: ts, updated_at: ts });

  const repo = new CapabilitiesRepo(db);

  // Insert 3 capabilities for run X
  repo.insert({ id: 'cap-x1', run_id: 'run-x', credential_id: 'cred-cap', scope: 'read', expires_at: null, granted_at: ts, revoked_at: null });
  repo.insert({ id: 'cap-x2', run_id: 'run-x', credential_id: 'cred-cap', scope: 'write', expires_at: null, granted_at: ts, revoked_at: null });
  repo.insert({ id: 'cap-x3', run_id: 'run-x', credential_id: 'cred-cap', scope: 'admin', expires_at: null, granted_at: ts, revoked_at: null });

  // Insert 2 capabilities for run Y
  repo.insert({ id: 'cap-y1', run_id: 'run-y', credential_id: 'cred-cap', scope: 'read', expires_at: null, granted_at: ts, revoked_at: null });
  repo.insert({ id: 'cap-y2', run_id: 'run-y', credential_id: 'cred-cap', scope: 'write', expires_at: null, granted_at: ts, revoked_at: null });

  // Round-trip test
  const found = repo.findById('cap-x1');
  assert(found !== undefined, 'findById returns inserted row');
  assert(found!.id === 'cap-x1' && found!.run_id === 'run-x' && found!.scope === 'read', 'round-trip: insert + findById returns equal object');

  const byRunX = repo.findByRunId('run-x');
  assert(byRunX.length === 3, 'findByRunId returns 3 for run-x');

  // revokeAllByRun(X) — the load-bearing test
  const revokedCount = repo.revokeAllByRun('run-x', 'run ended');
  assert(revokedCount === 3, `revokeAllByRun returns 3, got ${revokedCount}`);

  // Verify revoked rows have non-null revoked_at
  const revokedCaps = repo.findByRunId('run-x');
  const allRevoked = revokedCaps.every(c => c.revoked_at !== null);
  assert(allRevoked, 'all revoked rows have non-null revoked_at');

  // Verify run Y capabilities remain active
  const activeY = repo.findByRunId('run-y');
  const yStillActive = activeY.every(c => c.revoked_at === null);
  assert(activeY.length === 2 && yStillActive, 'capabilities for run Y remain active');

  // Revoking again should return 0 (already revoked)
  const secondRevoke = repo.revokeAllByRun('run-x', 'duplicate');
  assert(secondRevoke === 0, 'revoking already-revoked returns 0');
}

// --- EventsRepo ---
console.log('\nEventsRepo');
{
  const repo = new EventsRepo(db);
  const ts = now();

  // run-x still exists from capabilities test
  repo.insert({ id: 'evt-1', run_id: 'run-x', capability_id: 'cap-x1', event_type: 'access', detail: 'accessed repo', created_at: ts });
  repo.insert({ id: 'evt-2', run_id: 'run-x', capability_id: null, event_type: 'start', detail: null, created_at: ts });

  const found = repo.findById('evt-1');
  assert(found !== undefined, 'findById returns inserted row');
  assert(found!.id === 'evt-1' && found!.event_type === 'access', 'round-trip: insert + findById returns equal object');

  const byRun = repo.findByRunId('run-x');
  assert(byRun.length === 2, 'findByRunId returns correct count');

  const byCap = repo.findByCapabilityId('cap-x1');
  assert(byCap.length === 1, 'findByCapabilityId returns correct count');

  const byType = repo.findByEventType('access');
  assert(byType.length === 1, 'findByEventType returns correct count');

  repo.deleteById('evt-1');
  assert(repo.findById('evt-1') === undefined, 'deleted row is gone');
}

// --- PoliciesRepo ---
console.log('\nPoliciesRepo');
{
  const repo = new PoliciesRepo(db);
  const ts = now();
  const policy = { id: 'pol-1', name: 'default', rules: '{"allow":"*"}', created_at: ts, updated_at: ts };
  repo.insert(policy);

  const found = repo.findById('pol-1');
  assert(found !== undefined, 'findById returns inserted row');
  assert(found!.id === policy.id && found!.name === policy.name && found!.rules === policy.rules, 'round-trip: insert + findById returns equal object');

  const byName = repo.findByName('default');
  assert(byName !== undefined && byName.name === 'default', 'findByName returns correct result');

  const updated = { ...policy, rules: '{"allow":"read"}', updated_at: now() };
  const changes = repo.update(updated);
  assert(changes === 1, 'update returns 1');
  assert(repo.findById('pol-1')!.rules === '{"allow":"read"}', 'update persists changes');

  repo.deleteById('pol-1');
  assert(repo.findById('pol-1') === undefined, 'deleted row is gone');
}

// --- ISO 8601 timestamp check ---
console.log('\nTimestamp format');
{
  const credRepo = new CredentialsRepo(db);
  const ts = '2026-04-18T12:00:00.000Z';
  credRepo.insert({ id: 'ts-check', service: 'test', label: 'ts', encrypted_blob: 'x', created_at: ts, updated_at: ts });
  const row = credRepo.findById('ts-check')!;
  const iso8601 = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;
  assert(iso8601.test(row.created_at), 'timestamps are ISO 8601 strings');
}

db.close();
cleanup();

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
