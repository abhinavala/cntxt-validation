/**
 * Registered Values Index
 *
 * Maintains an in-memory Set<string> of every registered credential's raw
 * plaintext value. The sanitizer reads this set (via getRegisteredValues())
 * to redact raw secrets from agent-visible output.
 *
 * Handles (cred_*, cap_*) are NOT indexed — they are inert outside the
 * trust boundary and may appear in code and events.
 */

import { getDb } from "../db/index.js";
import { decrypt } from "../crypto/sodium.js";

interface CredentialRow {
  id: string;
  encrypted_blob: string;
}

interface EncryptedPayload {
  value: string;
  scope_ceiling: Record<string, unknown>;
}

const registeredValues: Set<string> = new Set();

/**
 * Returns true if the value is non-empty and not whitespace-only.
 */
function isIndexable(value: string): boolean {
  return value.trim().length > 0;
}

/**
 * Decrypts a credential row's blob and returns the raw value.
 */
function extractRawValue(row: CredentialRow): string {
  const payload: EncryptedPayload = JSON.parse(decrypt(row.encrypted_blob));
  return payload.value;
}

/**
 * Rebuilds the index from scratch by reading all credentials from the DB
 * and decrypting each one. Call on startup and after credential deletion.
 */
export function rebuildIndex(): void {
  registeredValues.clear();

  const db = getDb();
  const rows = db
    .prepare("SELECT id, encrypted_blob FROM credentials")
    .all() as CredentialRow[];

  for (const row of rows) {
    const value = extractRawValue(row);
    if (isIndexable(value)) {
      registeredValues.add(value);
    }
  }
}

/**
 * Adds a single raw value to the index. Call after a successful
 * storeCredential to avoid a full rebuild.
 */
export function addToIndex(value: string): void {
  if (isIndexable(value)) {
    registeredValues.add(value);
  }
}

/**
 * Returns a read-only view of the current registered values.
 * The sanitizer uses this to know which strings to redact.
 */
export function getRegisteredValues(): ReadonlySet<string> {
  return registeredValues;
}

export type rebuildIndex = typeof rebuildIndex;
export type addToIndex = typeof addToIndex;
export type getRegisteredValues = typeof getRegisteredValues;
