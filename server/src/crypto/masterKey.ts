import sodium from "libsodium-wrappers";

let masterKey: Uint8Array | null = null;

/**
 * Loads and validates the master key from WARDEN_MASTER_KEY env var.
 * The key must be a hex-encoded 32-byte value (64 hex characters).
 * Throws if missing or wrong length.
 */
export function loadMasterKey(): Uint8Array {
  const hex = process.env.WARDEN_MASTER_KEY;

  if (!hex) {
    throw new Error(
      "WARDEN_MASTER_KEY environment variable is required but not set"
    );
  }

  let keyBytes: Uint8Array;
  try {
    keyBytes = sodium.from_hex(hex);
  } catch {
    throw new Error(
      "WARDEN_MASTER_KEY is not valid hex"
    );
  }

  if (keyBytes.length !== sodium.crypto_secretbox_KEYBYTES) {
    throw new Error(
      `WARDEN_MASTER_KEY must be exactly ${sodium.crypto_secretbox_KEYBYTES} bytes (${sodium.crypto_secretbox_KEYBYTES * 2} hex characters), got ${keyBytes.length} bytes`
    );
  }

  masterKey = keyBytes;
  return masterKey;
}

/**
 * Returns the loaded master key. Throws if loadMasterKey() has not been called.
 */
export function getMasterKey(): Uint8Array {
  if (!masterKey) {
    throw new Error("Master key not loaded. Call loadMasterKey() first.");
  }
  return masterKey;
}
