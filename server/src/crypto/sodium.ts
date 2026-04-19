import sodium from "libsodium-wrappers";
import { loadMasterKey, getMasterKey } from "./masterKey.js";

/**
 * Initializes libsodium and loads the master key.
 * Must be called (and awaited) before encrypt/decrypt.
 */
export async function initCrypto(): Promise<void> {
  await sodium.ready;
  loadMasterKey();
}

/**
 * Encrypts a plaintext string using XSalsa20-Poly1305 (secretbox).
 * Returns a base64 string with the random nonce prepended to the ciphertext.
 */
export function encrypt(plaintext: string): string {
  const key = getMasterKey();
  const nonce = sodium.randombytes_buf(sodium.crypto_secretbox_NONCEBYTES);
  const messageBytes = sodium.from_string(plaintext);
  const ciphertext = sodium.crypto_secretbox_easy(messageBytes, nonce, key);

  // Prepend nonce to ciphertext
  const combined = new Uint8Array(nonce.length + ciphertext.length);
  combined.set(nonce);
  combined.set(ciphertext, nonce.length);

  return sodium.to_base64(combined, sodium.base64_variants.ORIGINAL);
}

/**
 * Decrypts a base64 string (nonce + ciphertext) back to the original plaintext.
 * Throws if decryption fails (wrong key, tampered data, etc.).
 */
export function decrypt(ciphertext: string): string {
  const key = getMasterKey();
  const combined = sodium.from_base64(
    ciphertext,
    sodium.base64_variants.ORIGINAL
  );

  const nonceLength = sodium.crypto_secretbox_NONCEBYTES;
  if (combined.length < nonceLength + sodium.crypto_secretbox_MACBYTES) {
    throw new Error("Ciphertext is too short to contain a valid nonce and MAC");
  }

  const nonce = combined.slice(0, nonceLength);
  const encrypted = combined.slice(nonceLength);

  const decrypted = sodium.crypto_secretbox_open_easy(encrypted, nonce, key);
  return sodium.to_string(decrypted);
}
