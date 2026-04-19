/**
 * Credential type definitions for the Warden vault system.
 */

export type CredentialType = "github" | "openai";

export interface Credential {
  id: string;
  handle: string;
  service: CredentialType;
  label: string;
  scope_ceiling: Record<string, unknown>;
  encrypted_blob: string;
  created_at: string;
  updated_at: string;
}

export interface StoreCredentialInput {
  value: string;
  service: CredentialType;
  label: string;
  scope_ceiling: Record<string, unknown>;
}

export interface StoreCredentialResult {
  handle: string;
  id: string;
}

export interface ResolvedCredential {
  id: string;
  handle: string;
  service: CredentialType;
  label: string;
  scope_ceiling: Record<string, unknown>;
  encrypted_blob: "[ENCRYPTED]";
  created_at: string;
  updated_at: string;
}
