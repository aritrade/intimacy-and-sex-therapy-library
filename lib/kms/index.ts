/**
 * KMS facade. Picks the adapter based on KMS_PROVIDER, exposes a stable
 * API for the rest of the app:
 *
 *   const kms = getKms();
 *   const sealed = await kms.seal("plaintext");
 *   const plain  = await kms.open(sealed);
 *
 * Use this for server-side encryption of Sahay "encrypted" mode (where
 * the KMS holds the unwrap key) — NOT for "vault" mode, which is
 * client-side only and lives in lib/crypto/vault.ts.
 */

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { LocalKmsClient } from "./local";
import { AwsKmsClient } from "./aws";
import type { KmsClient, Sealed } from "./types";

export type { Sealed, WrappedKey, KmsClient } from "./types";

let cached: KmsHelper | null = null;

export function getKms(): KmsHelper {
  if (cached) return cached;
  const provider = (process.env.KMS_PROVIDER ?? "local").toLowerCase();
  let client: KmsClient;
  switch (provider) {
    case "aws":
      client = new AwsKmsClient();
      break;
    case "local":
    default:
      client = new LocalKmsClient();
      break;
  }
  cached = new KmsHelper(client);
  return cached;
}

export function isKmsConfigured(): boolean {
  const provider = (process.env.KMS_PROVIDER ?? "local").toLowerCase();
  if (provider === "aws") return !!process.env.AWS_KMS_KEY_ID;
  return !!process.env.KMS_LOCAL_MASTER_KEY;
}

export class KmsHelper {
  constructor(public readonly client: KmsClient) {}

  async seal(plaintext: string): Promise<Sealed> {
    const { rawKey, wrapped } = await this.client.generateDataKey();
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", rawKey, iv);
    const ct = Buffer.concat([
      cipher.update(Buffer.from(plaintext, "utf-8")),
      cipher.final(),
    ]);
    const tag = cipher.getAuthTag();
    return {
      alg: "AES-256-GCM",
      iv: iv.toString("base64"),
      ciphertext: Buffer.concat([ct, tag]).toString("base64"),
      wrappedKey: wrapped,
    };
  }

  async open(sealed: Sealed): Promise<string> {
    if (sealed.alg !== "AES-256-GCM") {
      throw new Error(`Unsupported alg: ${sealed.alg}`);
    }
    const dataKey = await this.client.unwrapDataKey(sealed.wrappedKey);
    const blob = Buffer.from(sealed.ciphertext, "base64");
    if (blob.length < 16) throw new Error("kms: blob too short");
    const ct = blob.subarray(0, blob.length - 16);
    const tag = blob.subarray(blob.length - 16);
    const iv = Buffer.from(sealed.iv, "base64");
    const decipher = createDecipheriv("aes-256-gcm", dataKey, iv);
    decipher.setAuthTag(tag);
    const plain = Buffer.concat([decipher.update(ct), decipher.final()]);
    return plain.toString("utf-8");
  }

  /** Round-trip self-check used by /api/health. */
  async healthcheck(): Promise<{ ok: true; provider: string } | { ok: false; error: string }> {
    try {
      const probe = "kms-health-check-" + Date.now();
      const sealed = await this.seal(probe);
      const plain = await this.open(sealed);
      if (plain !== probe) return { ok: false, error: "round-trip mismatch" };
      return { ok: true, provider: this.client.provider };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  }
}
