import { describe, expect, it } from "vitest";
import { LocalKmsClient } from "@/lib/kms/local";
import { KmsHelper, getKms, isKmsConfigured } from "@/lib/kms";

describe("LocalKmsClient", () => {
  it("generates 32-byte data keys and unwraps round-trip", async () => {
    const kms = new LocalKmsClient();
    const { rawKey, wrapped } = await kms.generateDataKey();
    expect(rawKey.length).toBe(32);
    expect(wrapped.provider).toBe("local");
    const unwrapped = await kms.unwrapDataKey(wrapped);
    expect(Buffer.from(unwrapped)).toEqual(Buffer.from(rawKey));
  });

  it("refuses to unwrap a key from a different provider", async () => {
    const kms = new LocalKmsClient();
    await expect(
      kms.unwrapDataKey({ provider: "aws", ciphertext: "ZmFrZQ==" }),
    ).rejects.toThrow(/cannot unwrap/i);
  });
});

describe("KmsHelper.seal/open", () => {
  it("round-trips arbitrary plaintext", async () => {
    const kms = new KmsHelper(new LocalKmsClient());
    const sealed = await kms.seal("hello, world");
    expect(sealed.alg).toBe("AES-256-GCM");
    expect(sealed.iv.length).toBeGreaterThan(0);
    expect(sealed.ciphertext.length).toBeGreaterThan(0);
    expect(sealed.wrappedKey.provider).toBe("local");
    const out = await kms.open(sealed);
    expect(out).toBe("hello, world");
  });

  it("fails to open if the ciphertext is tampered with", async () => {
    const kms = new KmsHelper(new LocalKmsClient());
    const sealed = await kms.seal("secret");
    const tampered = { ...sealed, ciphertext: flipMiddleByte(sealed.ciphertext) };
    await expect(kms.open(tampered)).rejects.toThrow();
  });

  it("fails to open if the wrapped key is tampered with", async () => {
    const kms = new KmsHelper(new LocalKmsClient());
    const sealed = await kms.seal("secret");
    const tampered = {
      ...sealed,
      wrappedKey: { ...sealed.wrappedKey, ciphertext: flipMiddleByte(sealed.wrappedKey.ciphertext) },
    };
    await expect(kms.open(tampered)).rejects.toThrow();
  });

  it("rejects unsupported algorithms", async () => {
    const kms = new KmsHelper(new LocalKmsClient());
    await expect(
      kms.open({
        alg: "AES-128-CBC" as unknown as "AES-256-GCM",
        iv: "AAAA",
        ciphertext: "BBBB",
        wrappedKey: { provider: "local", ciphertext: "AA==" },
      }),
    ).rejects.toThrow(/unsupported alg/i);
  });

  it("healthcheck reports ok=true for local provider", async () => {
    const kms = new KmsHelper(new LocalKmsClient());
    const r = await kms.healthcheck();
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.provider).toBe("local");
  });
});

describe("getKms / isKmsConfigured", () => {
  it("isKmsConfigured returns true for the local provider with the test key", () => {
    expect(isKmsConfigured()).toBe(true);
  });

  it("getKms returns the same instance across calls", () => {
    expect(getKms()).toBe(getKms());
  });
});

function flipMiddleByte(b64: string): string {
  const buf = Buffer.from(b64, "base64");
  const idx = Math.floor(buf.length / 2);
  buf[idx] = buf[idx] ^ 0xff;
  return buf.toString("base64");
}
