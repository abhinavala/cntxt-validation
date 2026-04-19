/**
 * Credential Vault Module
 *
 * Manages credential storage, handle resolution, and raw value access.
 *
 * IMPORTANT: getRawValue() is the ONLY function in the codebase that returns
 * raw credential values. It must ONLY be imported by capability broker modules:
 *   - server/src/capabilities/github.ts (F4)
 *   - server/src/capabilities/openai.ts (F5)
 * No other module may import getRawValue.
 */

import { randomUUID } from "node:crypto";
import { encrypt, decrypt } from "../crypto/sodium.js";
import { getDb } from "../db/index.js";
import type {
  StoreCredentialInput,
  StoreCredentialResult,
  ResolvedCredential,
  CredentialType,
} from "../../../shared/src/types/credentials.js";

interface CredentialRow {
  id: string;
  service: string;
  label: string;
  encrypted_blob: string;
  created_at: string;
  updated_at: string;
}

interface EncryptedPayload {
  value: string;
  scope_ceiling: Record<string, unknown>;
}

function toHandle(id: string): string {
  return `cred_${id}`;
}

function fromHandle(handle: string): string | null {
  if (!handle.startsWith("cred_")) return null;
  return handle.slice(5);
}

/**
 * Stores a credential in the vault.
 *
 * Generates a handle (cred_<uuid>), encrypts the value, writes the row
 * to the credentials table, and returns { handle, id }.
 *
 * Requires scope_ceiling to be set on the input.
 */
export function storeCredential(
  input: StoreCredentialInput
): StoreCredentialResult {
  if (!input.scope_ceiling || typeof input.scope_ceiling !== "object") {
    throw new Error("scope_ceiling is required and must be an object");
  }

  const id = randomUUID();
  const handle = toHandle(id);

  const payload: EncryptedPayload = {
    value: input.value,
    scope_ceiling: input.scope_ceiling,
  };
  const encryptedBlob = encrypt(JSON.stringify(payload));

  const db = getDb();
  db.prepare(
    `INSERT INTO credentials (id, service, label, encrypted_blob) VALUES (?, ?, ?, ?)`
  ).run(id, input.service, input.label, encryptedBlob);

  return { handle, id };
}

/**
 * Resolves a handle to a Credential row WITHOUT the raw value.
 *
 * The encrypted_blob field is redacted to '[ENCRYPTED]'.
 * Returns null if the handle is not found.
 */
export function resolveHandle(handle: string): ResolvedCredential | null {
  const id = fromHandle(handle);
  if (!id) return null;

  const db = getDb();
  const row = db
    .prepare(`SELECT * FROM credentials WHERE id = ?`)
    .get(id) as CredentialRow | undefined;

  if (!row) return null;

  const decryptedPayload: EncryptedPayload = JSON.parse(
    decrypt(row.encrypted_blob)
  );

  return {
    id: row.id,
    handle,
    service: row.service as CredentialType,
    label: row.label,
    scope_ceiling: decryptedPayload.scope_ceiling,
    encrypted_blob: "[ENCRYPTED]",
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

/**
 * Decrypts and returns the raw plaintext value for a credential handle.
 *
 * THIS IS THE ONLY FUNCTION IN THE CODEBASE THAT RETURNS RAW CREDENTIAL VALUES.
 *
 * Allowed importers (enforced by code review):
 *   - server/src/capabilities/github.ts (F4 - GitHub capability broker)
 *   - server/src/capabilities/openai.ts (F5 - OpenAI capability broker)
 *
 * Throws if the handle is unknown or invalid.
 */
export function getRawValue(handle: string): string {
  const id = fromHandle(handle);
  if (!id) {
    throw new Error(`Invalid credential handle: ${handle}`);
  }

  const db = getDb();
  const row = db
    .prepare(`SELECT encrypted_blob FROM credentials WHERE id = ?`)
    .get(id) as Pick<CredentialRow, "encrypted_blob"> | undefined;

  if (!row) {
    throw new Error(`Unknown credential handle: ${handle}`);
  }

  const payload: EncryptedPayload = JSON.parse(decrypt(row.encrypted_blob));
  return payload.value;
}

export type storeCredential = typeof storeCredential;
export type resolveHandle = typeof resolveHandle;
export type getRawValue = typeof getRawValue;
