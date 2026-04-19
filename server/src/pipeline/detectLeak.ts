import { randomUUID } from 'node:crypto';
import { getRegisteredValues } from './credentialIndex';
import { sanitize } from './sanitize';
import { WardenError } from '../../../shared/src/types/mcp.js';
import type { EventsRepo } from '../db/repos/events.js';

/** Numeric error code for a credential leak detected in inbound tool-call args. */
export const LEAK_DETECTED = -32002;

export interface LeakDetectCtx {
  toolName: string;
  runId: string;
  eventsRepo: EventsRepo;
}

/**
 * Scans inbound tool-call arguments for any registered raw credential value.
 * If a leak is found, emits a leak_detected event (with redacted args) and
 * throws a WardenError. Passes through silently when no leak is detected.
 */
export function detectLeak(
  args: Record<string, unknown>,
  ctx: LeakDetectCtx,
): void {
  const registeredValues = getRegisteredValues().filter(
    (v) => typeof v === 'string' && v.trim().length > 0,
  );

  if (registeredValues.length === 0) {
    return;
  }

  if (!containsLeak(args, registeredValues, new WeakSet())) {
    return;
  }

  const redactedArgs = sanitize(args);

  ctx.eventsRepo.insert({
    id: randomUUID(),
    run_id: ctx.runId,
    capability_id: null,
    event_type: 'leak_detected',
    detail: JSON.stringify({ toolName: ctx.toolName, redactedArgs }),
    created_at: new Date().toISOString(),
  });

  throw new WardenError(
    `Credential leak detected in arguments for tool: ${ctx.toolName}`,
    LEAK_DETECTED,
  );
}

function containsLeak(
  value: unknown,
  secrets: string[],
  visited: WeakSet<object>,
): boolean {
  if (value === null || value === undefined) {
    return false;
  }

  if (typeof value === 'string') {
    return secrets.some((secret) => value.includes(secret));
  }

  if (typeof value !== 'object') {
    return false;
  }

  const obj = value as object;

  if (visited.has(obj)) {
    return false;
  }
  visited.add(obj);

  if (Array.isArray(value)) {
    return value.some((item) => containsLeak(item, secrets, visited));
  }

  return Object.values(obj as Record<string, unknown>).some((v) =>
    containsLeak(v, secrets, visited),
  );
}
