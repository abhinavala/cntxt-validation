/**
 * Row types matching the 5 core Warden SQLite tables.
 * All timestamps are ISO 8601 strings.
 */

export interface CredentialRow {
  id: string;
  service: string;
  label: string;
  encrypted_blob: string;
  created_at: string;
  updated_at: string;
}

export interface RunRow {
  id: string;
  agent_id: string;
  status: string;
  started_at: string;
  ended_at: string | null;
}

export interface CapabilityGrantedRow {
  id: string;
  run_id: string;
  credential_id: string;
  scope: string;
  expires_at: string | null;
  granted_at: string;
  revoked_at: string | null;
}

export interface EventRow {
  id: string;
  run_id: string;
  capability_id: string | null;
  event_type: string;
  detail: string | null;
  created_at: string;
}

export interface PolicyRow {
  id: string;
  name: string;
  rules: string;
  created_at: string;
  updated_at: string;
}
