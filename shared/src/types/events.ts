export const WardenEventType = {
  capability_granted: 'capability_granted',
  capability_revoked: 'capability_revoked',
  tool_called: 'tool_called',
  leak_detected: 'leak_detected',
  run_started: 'run_started',
  run_ended: 'run_ended',
  policy_denied: 'policy_denied',
  ttl_expired: 'ttl_expired',
} as const;

export type WardenEventType = (typeof WardenEventType)[keyof typeof WardenEventType];

export interface EmitEventInput {
  id: string;
  run_id: string;
  capability_id?: string | null;
  event_type: WardenEventType;
  detail?: string | null;
}

export interface WardenEvent {
  id: string;
  run_id: string;
  capability_id: string | null;
  event_type: WardenEventType;
  detail: string | null;
  created_at: string;
}
