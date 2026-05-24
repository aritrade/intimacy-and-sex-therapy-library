/**
 * Local KMS fallback.
 *
 * Wraps data keys with a single master key sourced from KMS_LOCAL_MASTER_KEY
 * (base64, 32 bytes). Useful in dev and CI; explicitly NOT recommended in
 * production — there's nothing here that a stolen filesystem can't decrypt.
 *
 * Algorithm: AES-256-GCM, IV per wrap, no associated data.
 */

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import type { KmsClient, WrappedKey } from "./types";

function loadMasterKey(): Uint8Array {
  const b64 = process.env.KMS_LOCAL_MASTER_KEY;
  if (!b64) {
    throw new Error(
      "KMS_LOCAL_MASTER_KEY is not set. Generate a 32-byte base64 key with " +
        "`node -e \"console.log(require('crypto').randomBytes(32).toString('base64'))\"`",
    );
  }
  const buf = Buffer.from(b64, "base64");
  if (buf.length !== 32) {
    throw new Error(`KMS_LOCAL_MASTER_KEY must decode to 32 bytes, got ${buf.length}`);
  }
  return buf;
}

export class LocalKmsClient implements KmsClient {
  readonly provider = "local" as const;

  async generateDataKey(): Promise<{ rawKey: Uint8Array; wrapped: WrappedKey }> {
    const raw = randomBytes(32);
    const wrapped = await this.wrap(raw);
    return { rawKey: raw, wrapped };
  }

  async unwrapDataKey(wrapped: WrappedKey): Promise<Uint8Array> {
    if (wrapped.provider !== "local") {
      throw new Error(`LocalKmsClient cannot unwrap a key from provider=${wrapped.provider}`);
    }
    const blob = Buffer.from(wrapped.ciphertext, "base64");
    // Layout: [12 IV][16 TAG][N CIPHERTEXT]
    if (blob.length < 12 + 16 + 1) throw new Error("local kms: blob too short");
    const iv = blob.subarray(0, 12);
    const tag = blob.subarray(12, 28);
    const ct = blob.subarray(28);
    const decipher = createDecipheriv("aes-256-gcm", loadMasterKey(), iv);
    decipher.setAuthTag(tag);
    const plain = Buffer.concat([decipher.update(ct), decipher.final()]);
    if (plain.length !== 32) throw new Error("local kms: unexpected key length");
    return new Uint8Array(plain);
  }

  private async wrap(raw: Uint8Array): Promise<WrappedKey> {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", loadMasterKey(), iv);
    const ct = Buffer.concat([cipher.update(raw), cipher.final()]);
    const tag = cipher.getAuthTag();
    const blob = Buffer.concat([iv, tag, ct]);
    return {
      ciphertext: blob.toString("base64"),
      provider: "local",
    };
  }
}
