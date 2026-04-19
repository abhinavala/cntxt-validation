import { getRegisteredValues } from './credentialIndex.js';
import { sanitize } from './sanitize.js';
import { emitEvent } from '../events/emitter.js';
import { WardenError } from '../../../shared/src/types/mcp.js';
import type { EventsRepo } from '../db/repos/events.js';
import type { WardenEvent } from '../../../shared/src/types/events.js';

/** Numeric error code for an internal credential leak in an emitted event. */
export const INTERNAL_LEAK = -32001;

/**
 * Deep-scans an event payload for any registered raw credential value.
 * Throws WardenError with code INTERNAL_LEAK if any secret is found.
 */
export function assertNoLeak(event: WardenEvent): void {
  const registeredValues = getRegisteredValues().filter(
    (v) => typeof v === 'string' && v.trim().length > 0,
  );

  if (registeredValues.length === 0) {
    return;
  }

  if (containsLeak(event, registeredValues, new WeakSet())) {
    throw new WardenError(
      'Internal leak detected: emitted event contains a registered credential value',
      INTERNAL_LEAK,
    );
  }
}

/**
 * Wraps the emitEvent function with an honesty check that asserts no registered
 * credential value is derivable from the event payload before broadcasting.
 *
 * In development: throws (fails the process loudly).
 * In production: logs, sanitizes the event detail, and emits a degraded event.
 */
export function wrapEmitterWithHonestyCheck(
  repo: EventsRepo,
): typeof emitEvent {
  return (input, eventRepo) => {
    const event = emitEvent(input, eventRepo);

    try {
      assertNoLeak(event);
    } catch (err) {
      if (err instanceof WardenError && err.code === INTERNAL_LEAK) {
        if (process.env.NODE_ENV === 'production') {
          console.error(
            `[honesty] ${err.message} — emitting degraded event`,
          );

          const sanitized = sanitize(event);
          return sanitized;
        }
        throw err;
      }
      throw err;
    }

    return event;
  };
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
