import { randomUUID } from 'node:crypto';
import type { RunRow, EventRow } from '../../../shared/src/types/db.js';
import type { RunsRepo } from '../db/repos/runs.js';
import type { CapabilitiesRepo } from '../db/repos/capabilities.js';
import type { EventsRepo } from '../db/repos/events.js';

export interface StartRunResult {
  run_id: string;
  agent_identity: string;
}

export interface EndRunResult {
  run_id: string;
  status: string;
  revoked_count: number;
}

export interface LifecycleDeps {
  runsRepo: RunsRepo;
  capabilitiesRepo: CapabilitiesRepo;
  eventsRepo: EventsRepo;
}

/**
 * Creates a new Run row, emits a run_started event, and returns the run_id
 * and a freshly-minted agent_identity UUID.
 */
export function startRun(
  deps: LifecycleDeps,
  taskDescription: string
): StartRunResult {
  const runId = randomUUID();
  const agentIdentity = randomUUID();
  const now = new Date().toISOString();

  const row: RunRow = {
    id: runId,
    agent_id: agentIdentity,
    status: 'active',
    started_at: now,
    ended_at: null,
  };
  deps.runsRepo.insert(row);

  const event: EventRow = {
    id: randomUUID(),
    run_id: runId,
    capability_id: null,
    event_type: 'run_started',
    detail: JSON.stringify({ task_description: taskDescription }),
    created_at: now,
  };
  deps.eventsRepo.insert(event);

  return { run_id: runId, agent_identity: agentIdentity };
}

/**
 * Revokes all capabilities for the run, marks it ended, and emits a
 * run_ended event. Idempotent — calling on an already-ended run returns 0 revoked.
 */
export function endRun(
  deps: LifecycleDeps,
  runId: string,
  status: string = 'completed'
): EndRunResult {
  const revokedCount = deps.capabilitiesRepo.revokeAllByRun(runId, status);

  const now = new Date().toISOString();
  deps.runsRepo.updateStatus(runId, status, now);

  const event: EventRow = {
    id: randomUUID(),
    run_id: runId,
    capability_id: null,
    event_type: 'run_ended',
    detail: JSON.stringify({ status, revoked_count: revokedCount }),
    created_at: now,
  };
  deps.eventsRepo.insert(event);

  return { run_id: runId, status, revoked_count: revokedCount };
}
