/**
 * AWS KMS adapter (envelope encryption).
 *
 * Uses AWS KMS GenerateDataKey + Decrypt. The AWS SDK is an OPTIONAL peer
 * dependency — install it before flipping KMS_PROVIDER=aws:
 *
 *     npm install @aws-sdk/client-kms
 *
 * Required env:
 *   - AWS_KMS_KEY_ID   ARN or key alias of a symmetric KMS key
 *   - AWS_REGION       (or rely on Lambda/Vercel default)
 *   - AWS_ACCESS_KEY_ID + AWS_SECRET_ACCESS_KEY (or IAM role / OIDC)
 *
 * The adapter does NOT keep a long-lived AWS client at module scope — that
 * would leak env into bundles. We construct on first use and cache for the
 * process lifetime.
 */

import type { KmsClient, WrappedKey } from "./types";

type GenerateDataKeyResp = {
  CiphertextBlob: Uint8Array;
  Plaintext: Uint8Array;
  KeyId: string;
};

type DecryptResp = { Plaintext: Uint8Array };

let cached: { generateDataKey: (i: unknown) => Promise<unknown>; decrypt: (i: unknown) => Promise<unknown> } | null = null;

// `import(name)` through `new Function` defeats TypeScript's static module
// resolution, which lets us treat @aws-sdk/client-kms as an optional dep
// without a build-time type dependency.
const importByName = new Function("n", "return import(n)") as (n: string) => Promise<unknown>;

async function getKmsClient() {
  if (cached) return cached;
  let mod: unknown;
  try {
    mod = await importByName("@aws-sdk/client-kms");
  } catch {
    throw new Error(
      "AWS KMS provider selected but `@aws-sdk/client-kms` is not installed. " +
        "Run: npm install @aws-sdk/client-kms",
    );
  }
  const sdk = mod as {
    KMSClient: new (cfg: { region?: string }) => unknown;
    GenerateDataKeyCommand: new (i: unknown) => unknown;
    DecryptCommand: new (i: unknown) => unknown;
  };
  const client = new sdk.KMSClient({ region: process.env.AWS_REGION });

  cached = {
    generateDataKey: (input: unknown) =>
      (client as { send: (c: unknown) => Promise<unknown> }).send(
        new sdk.GenerateDataKeyCommand(input),
      ),
    decrypt: (input: unknown) =>
      (client as { send: (c: unknown) => Promise<unknown> }).send(new sdk.DecryptCommand(input)),
  };
  return cached;
}

export class AwsKmsClient implements KmsClient {
  readonly provider = "aws" as const;

  async generateDataKey() {
    const keyId = process.env.AWS_KMS_KEY_ID;
    if (!keyId) throw new Error("AWS_KMS_KEY_ID is not set");
    const sdk = await getKmsClient();
    const resp = (await sdk.generateDataKey({
      KeyId: keyId,
      KeySpec: "AES_256",
    })) as GenerateDataKeyResp;
    return {
      rawKey: resp.Plaintext,
      wrapped: {
        ciphertext: Buffer.from(resp.CiphertextBlob).toString("base64"),
        provider: "aws" as const,
        keyId: resp.KeyId,
      },
    };
  }

  async unwrapDataKey(wrapped: WrappedKey) {
    if (wrapped.provider !== "aws") {
      throw new Error(`AwsKmsClient cannot unwrap a key from provider=${wrapped.provider}`);
    }
    const sdk = await getKmsClient();
    const resp = (await sdk.decrypt({
      CiphertextBlob: Buffer.from(wrapped.ciphertext, "base64"),
    })) as DecryptResp;
    return resp.Plaintext;
  }
}
