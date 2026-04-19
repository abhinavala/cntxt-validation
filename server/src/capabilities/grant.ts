/**
 * Capability Grant Module
 *
 * mintCapability validates the run, loads the credential, checks scope ceiling,
 * generates a capability handle, persists the grant, and emits an event.
 */

import { randomUUID } from "node:crypto";
import { getDb } from "../db/index.js";
import { addEvent } from "../api/routes/events.js";
import { getRuns } from "../api/routes/runs.js";
import { resolveHandle } from "../vault/index.js";
import { WardenError, ErrorCode } from "../../../shared/src/errors.js";
import type {
  MintCapabilityInput,
  Capability,
  CapabilityGrantedEvent,
} from "../../../shared/src/types/capabilities.js";
import type { CredentialType } from "../../../shared/src/types/credentials.js";

const DEFAULT_TTL_SECONDS = 3600;
const MAX_TTL_SECONDS = 14400;

interface CredentialRow {
  id: string;
  service: string;
  label: string;
  encrypted_blob: string;
  created_at: string;
  updated_at: string;
}

/**
 * Mints a capability grant for an active run.
 *
 * 1. Validates runId exists and is active
 * 2. Loads credential of the requested type (MVP: one credential per type)
 * 3. Calls ceilingValidator(scopeRequested, credential.scope_ceiling)
 * 4. Generates handle cap_<uuidv4>
 * 5. Writes capabilities_granted row with ttl_expires_at
 * 6. Emits capability_granted event
 */
export function mintCapability(input: MintCapabilityInput): Capability {
  const {
    runId,
    type,
    scopeRequested,
    justification,
    ceilingValidator,
  } = input;

  // Resolve TTL with default and max ceiling
  let ttlSeconds = input.ttlSeconds ?? DEFAULT_TTL_SECONDS;
  if (ttlSeconds <= 0 || ttlSeconds > MAX_TTL_SECONDS) {
    throw new WardenError(
      ErrorCode.INVALID_TTL,
      `ttlSeconds must be between 1 and ${MAX_TTL_SECONDS}, got ${ttlSeconds}`
    );
  }

  // Step 1: Validate run exists and is active
  const runs = getRuns();
  const run = runs.find((r) => r.id === runId);
  if (!run || run.status !== "active") {
    throw new WardenError(
      ErrorCode.NO_ACTIVE_RUN,
      `No active run found for runId: ${runId}`
    );
  }

  // Step 2: Load credential of the requested type (MVP: one per type)
  const db = getDb();
  const credentialRow = db
    .prepare(`SELECT * FROM credentials WHERE service = ? LIMIT 1`)
    .get(type) as CredentialRow | undefined;

  if (!credentialRow) {
    throw new WardenError(
      ErrorCode.NO_CREDENTIAL,
      `No credential registered for type: ${type}`
    );
  }

  // Resolve the credential to get scope_ceiling
  const resolved = resolveHandle(`cred_${credentialRow.id}`);
  if (!resolved) {
    throw new WardenError(
      ErrorCode.NO_CREDENTIAL,
      `Failed to resolve credential for type: ${type}`
    );
  }

  // Step 3: Check scope ceiling
  const withinCeiling = ceilingValidator(scopeRequested, resolved.scope_ceiling);
  if (!withinCeiling) {
    throw new WardenError(
      ErrorCode.SCOPE_EXCEEDS_CEILING,
      `Requested scope exceeds ceiling for credential type: ${type}`
    );
  }

  // Step 4: Generate capability handle
  const capabilityId = randomUUID();
  const handle = `cap_${capabilityId}`;

  // Step 5: Write capabilities_granted row
  const now = new Date();
  const ttlExpiresAt = new Date(now.getTime() + ttlSeconds * 1000);
  const createdAt = now.toISOString();

  db.prepare(
    `INSERT INTO capabilities_granted (id, handle, run_id, credential_id, type, scope_granted, justification, ttl_expires_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    capabilityId,
    handle,
    runId,
    credentialRow.id,
    type,
    JSON.stringify(scopeRequested),
    justification,
    ttlExpiresAt.toISOString(),
    createdAt
  );

  // Step 6: Emit capability_granted event
  const event: CapabilityGrantedEvent = {
    id: randomUUID(),
    runId,
    type: "capability_granted",
    toolCalled: null,
    outcome: "success",
    durationMs: null,
    capabilityHandle: handle,
    redactedArgs: null,
    reasoningExcerpt: null,
    timestamp: createdAt,
  };
  addEvent(event);

  return {
    id: capabilityId,
    handle,
    runId,
    credentialId: credentialRow.id,
    type: type as CredentialType,
    scopeGranted: scopeRequested,
    justification,
    ttlExpiresAt: ttlExpiresAt.toISOString(),
    createdAt,
  };
}

export type mintCapability = typeof mintCapability;
