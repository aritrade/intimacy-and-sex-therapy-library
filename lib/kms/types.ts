/**
 * KMS provider interface.
 *
 * The platform uses envelope encryption: a per-record data key is
 * generated locally, used to encrypt the record's plaintext with AES-256-GCM,
 * and then the data key itself is encrypted ("wrapped") by the KMS. The
 * wrapped key + ciphertext + IV travel together as a `Sealed` record.
 *
 * This split keeps the KMS off the hot path for reads (we only ask it to
 * unwrap the data key on demand) and means a compromised app server cannot
 * decrypt historical data — only the KMS can unwrap.
 *
 * Adapters live in this folder:
 *   - local.ts  — AES-256-GCM with a master key from env. Dev only.
 *   - aws.ts    — AWS KMS via @aws-sdk/client-kms (optional dep).
 *
 * Pick one with KMS_PROVIDER=local|aws (default: local).
 */

export type WrappedKey = {
  /** Base64 ciphertext of the data key, as returned by the KMS. */
  ciphertext: string;
  /** KMS provider name (helps audits identify the wrapper). */
  provider: "local" | "aws" | "gcp" | "vault";
  /** Optional ARN / key id for prod tracing. */
  keyId?: string;
};

export type Sealed = {
  /** Base64 AES-256-GCM ciphertext of the user's plaintext. */
  ciphertext: string;
  /** Base64 12-byte IV used by AES-GCM. */
  iv: string;
  /** The wrapped data key. Only the KMS can unwrap it. */
  wrappedKey: WrappedKey;
  /** Algorithm marker so we can rotate later without breaking existing data. */
  alg: "AES-256-GCM";
};

export interface KmsClient {
  /** Generate a fresh 32-byte data key, locally and wrapped by the KMS. */
  generateDataKey(): Promise<{ rawKey: Uint8Array; wrapped: WrappedKey }>;
  /** Unwrap a previously-wrapped data key. */
  unwrapDataKey(wrapped: WrappedKey): Promise<Uint8Array>;
  /** Provider id, used in logs and Sealed records. */
  readonly provider: WrappedKey["provider"];
}
