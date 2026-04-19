export const EventType = {
  capability_granted: 'capability_granted',
  capability_revoked: 'capability_revoked',
  tool_called: 'tool_called',
  leak_detected: 'leak_detected',
  run_started: 'run_started',
  run_ended: 'run_ended',
  policy_denied: 'policy_denied',
  ttl_expired: 'ttl_expired',
} as const;

export type EventType = (typeof EventType)[keyof typeof EventType];

export interface EventInput {
  id: string;
  run_id: string;
  capability_id?: string | null;
  event_type: EventType;
  detail?: string | null;
}

export interface WardenEvent {
  id: string;
  run_id: string;
  capability_id: string | null;
  event_type: EventType;
  detail: string | null;
  created_at: string;
}
