/**
 * Capability type definitions for the Warden grant system.
 */

import type { CredentialType } from "./credentials.js";

export interface MintCapabilityInput {
  runId: string;
  type: CredentialType;
  scopeRequested: Record<string, unknown>;
  justification: string;
  ttlSeconds?: number;
  ceilingValidator: (
    scopeRequested: Record<string, unknown>,
    scopeCeiling: Record<string, unknown>
  ) => boolean;
}

export interface Capability {
  id: string;
  handle: string;
  runId: string;
  credentialId: string;
  type: CredentialType;
  scopeGranted: Record<string, unknown>;
  justification: string;
  ttlExpiresAt: string;
  createdAt: string;
}

export interface CapabilityGrantedEvent {
  id: string;
  runId: string;
  type: string;
  toolCalled: null;
  outcome: "success";
  durationMs: null;
  capabilityHandle: string;
  redactedArgs: null;
  reasoningExcerpt: null;
  timestamp: string;
}
