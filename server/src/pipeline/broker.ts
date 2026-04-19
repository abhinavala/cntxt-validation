import { randomUUID } from 'node:crypto';
import { WardenError } from '../../../shared/src/types/mcp.js';
import { sanitize } from './sanitize.js';
import { getRawValue } from '../vault/index.js';
import type { CapabilitiesRepo } from '../db/repos/capabilities.js';
import type { RunsRepo } from '../db/repos/runs.js';
import type { EventsRepo } from '../db/repos/events.js';

/** Error codes for broker pipeline validation failures. */
export const UNKNOWN_CAPABILITY = -32003;
export const REVOKED = -32004;
export const EXPIRED = -32005;
export const NO_ACTIVE_RUN = -32006;

export interface BrokerContext {
  capabilityId: string;
  toolName: string;
  args: Record<string, unknown>;
  capabilitiesRepo: CapabilitiesRepo;
  runsRepo: RunsRepo;
  eventsRepo: EventsRepo;
}

/** @deprecated Use BrokerContext instead. */
export type BrokerCtx = BrokerContext;

/**
 * Single wrapper every brokered operation calls.
 *
 * Pipeline:
 *  1. Resolve capability by handle — unknown → UNKNOWN_CAPABILITY
 *  2. Check revoked_at — if set → REVOKED
 *  3. Check expires_at — if past → mark revoked, emit ttl_expired, throw EXPIRED
 *  4. Check Run is still active — if ended → NO_ACTIVE_RUN
 *  5. Load raw credential value via getRawValue
 *  6. Invoke fn(rawValue)
 *  7. Sanitize the response
 *  8. Emit tool_called event with redactedArgs, outcome, duration_ms
 *  9. Return sanitized response
 *
 * Errors during fn are caught, emitted as tool_called with outcome=error, and rethrown.
 */
export async function brokerCall<T>(
  ctx: BrokerContext,
  fn: (rawValue: string) => T | Promise<T>,
): Promise<T> {
  // 1. Resolve capability
  const cap = ctx.capabilitiesRepo.findById(ctx.capabilityId);
  if (!cap) {
    throw new WardenError(
      `Unknown capability: ${ctx.capabilityId}`,
      UNKNOWN_CAPABILITY,
    );
  }

  // 2. Check revocation
  if (cap.revoked_at !== null) {
    throw new WardenError(
      `Capability ${ctx.capabilityId} has been revoked`,
      REVOKED,
    );
  }

  // 3. Check TTL expiry
  if (cap.expires_at !== null && new Date(cap.expires_at) < new Date()) {
    const now = new Date().toISOString();
    ctx.capabilitiesRepo.revokeById(ctx.capabilityId, now);

    ctx.eventsRepo.insert({
      id: randomUUID(),
      run_id: cap.run_id,
      capability_id: ctx.capabilityId,
      event_type: 'ttl_expired',
      detail: JSON.stringify({ toolName: ctx.toolName }),
      created_at: now,
    });

    throw new WardenError(
      `Capability ${ctx.capabilityId} has expired`,
      EXPIRED,
    );
  }

  // 4. Check run is active
  const run = ctx.runsRepo.findById(cap.run_id);
  if (!run || run.ended_at !== null || run.status !== 'active') {
    throw new WardenError(
      `No active run for capability ${ctx.capabilityId}`,
      NO_ACTIVE_RUN,
    );
  }

  // 5. Load raw credential value
  const credentialHandle = `cred_${cap.credential_id}`;
  const rawValue = getRawValue(credentialHandle);

  // 6–9. Invoke fn, sanitize, emit, return
  const redactedArgs = sanitize(ctx.args);
  const start = Date.now();

  let result: T;
  try {
    result = await fn(rawValue);
  } catch (err) {
    const duration_ms = Date.now() - start;

    ctx.eventsRepo.insert({
      id: randomUUID(),
      run_id: cap.run_id,
      capability_id: ctx.capabilityId,
      event_type: 'tool_called',
      detail: JSON.stringify({
        toolName: ctx.toolName,
        redactedArgs,
        outcome: 'error',
        duration_ms,
      }),
      created_at: new Date().toISOString(),
    });

    throw err;
  }

  const duration_ms = Date.now() - start;
  const sanitizedResult = sanitize(result);

  ctx.eventsRepo.insert({
    id: randomUUID(),
    run_id: cap.run_id,
    capability_id: ctx.capabilityId,
    event_type: 'tool_called',
    detail: JSON.stringify({
      toolName: ctx.toolName,
      redactedArgs,
      outcome: 'success',
      duration_ms,
    }),
    created_at: new Date().toISOString(),
  });

  return sanitizedResult;
}
