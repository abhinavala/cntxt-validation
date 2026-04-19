import type { EventsRepo } from '../db/repos/events.js';
import type { EventInput, WardenEvent } from '../../../shared/src/types/events.js';
import { broadcast } from '../ws/broadcaster.js';

export function emitEvent(input: EventInput, repo: EventsRepo): WardenEvent {
  const created_at = new Date().toISOString();

  const row = {
    id: input.id,
    run_id: input.run_id,
    capability_id: input.capability_id ?? null,
    event_type: input.event_type,
    detail: input.detail ?? null,
    created_at,
  };

  repo.insert(row);

  const event: WardenEvent = { ...row, event_type: input.event_type };
  const json = JSON.stringify(event);
  broadcast(json);

  return event;
}

export type { emitEvent };
