/**
 * Client-side AES-256-GCM with PBKDF2 key derivation, for Sahay's
 * "Zero-knowledge Vault" mode.
 *
 * We use Web Crypto (available in modern browsers and Node 20+). PBKDF2 with
 * 200k iterations and SHA-256 is used for key derivation. Argon2id is more
 * memory-hard and would be ideal, but it requires shipping a WASM lib. PBKDF2
 * 200k is the conservative-still-deployable choice.
 *
 * Storage format for ciphertext (base64 strings, JSON-serialisable):
 *   { v: 1, kdf: "pbkdf2-sha256", iter: 200000, salt: <b64>, iv: <b64>, ct: <b64> }
 *
 * If the user forgets their passphrase, the data is gone. By design.
 */

export type Sealed = {
  v: 1;
  kdf: "pbkdf2-sha256";
  iter: number;
  salt: string;
  iv: string;
  ct: string;
};

const ITER = 200_000;
const KEY_LEN = 256;
const SALT_LEN = 16;
const IV_LEN = 12;

function getCrypto(): Crypto {
  if (typeof globalThis === "undefined" || !globalThis.crypto?.subtle) {
    throw new Error("Web Crypto API is not available in this environment.");
  }
  return globalThis.crypto;
}

/** Force an ArrayBuffer (not SharedArrayBuffer) view, the strict type Web Crypto wants. */
function asBuf(u8: Uint8Array): ArrayBuffer {
  return u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength) as ArrayBuffer;
}

function toB64(bytes: ArrayBuffer | Uint8Array): string {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let bin = "";
  for (let i = 0; i < u8.length; i++) bin += String.fromCharCode(u8[i]);
  return typeof btoa !== "undefined"
    ? btoa(bin)
    : Buffer.from(u8).toString("base64");
}

function fromB64(b64: string): Uint8Array {
  const bin = typeof atob !== "undefined" ? atob(b64) : Buffer.from(b64, "base64").toString("binary");
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function deriveKey(passphrase: string, salt: Uint8Array, iter = ITER): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const baseKey = await getCrypto().subtle.importKey(
    "raw",
    asBuf(enc.encode(passphrase)),
    { name: "PBKDF2" },
    false,
    ["deriveKey"],
  );
  return getCrypto().subtle.deriveKey(
    { name: "PBKDF2", salt: asBuf(salt), iterations: iter, hash: "SHA-256" },
    baseKey,
    { name: "AES-GCM", length: KEY_LEN },
    false,
    ["encrypt", "decrypt"],
  );
}

export async function seal(plaintext: string, passphrase: string): Promise<Sealed> {
  const salt = getCrypto().getRandomValues(new Uint8Array(SALT_LEN));
  const iv = getCrypto().getRandomValues(new Uint8Array(IV_LEN));
  const key = await deriveKey(passphrase, salt);
  const ct = await getCrypto().subtle.encrypt(
    { name: "AES-GCM", iv: asBuf(iv) },
    key,
    asBuf(new TextEncoder().encode(plaintext)),
  );
  return {
    v: 1,
    kdf: "pbkdf2-sha256",
    iter: ITER,
    salt: toB64(salt),
    iv: toB64(iv),
    ct: toB64(new Uint8Array(ct)),
  };
}

export async function open(sealed: Sealed, passphrase: string): Promise<string> {
  if (sealed.v !== 1 || sealed.kdf !== "pbkdf2-sha256") {
    throw new Error(`Unsupported sealed envelope: v=${sealed.v} kdf=${sealed.kdf}`);
  }
  const key = await deriveKey(passphrase, fromB64(sealed.salt), sealed.iter);
  try {
    const pt = await getCrypto().subtle.decrypt(
      { name: "AES-GCM", iv: asBuf(fromB64(sealed.iv)) },
      key,
      asBuf(fromB64(sealed.ct)),
    );
    return new TextDecoder().decode(pt);
  } catch {
    throw new Error("Could not decrypt — wrong passphrase or corrupt data.");
  }
}

/**
 * Wrap an entire chat transcript. Stored in localStorage by the Companion UI
 * under the key `sahay-vault:<conversationId>`.
 */
export type VaultTranscript = {
  conversationId: string;
  startedAt: string;
  messages: Array<{ role: "user" | "assistant"; content: string; ts: string }>;
};

export async function sealTranscript(
  transcript: VaultTranscript,
  passphrase: string,
): Promise<Sealed> {
  return seal(JSON.stringify(transcript), passphrase);
}

export async function openTranscript(
  sealed: Sealed,
  passphrase: string,
): Promise<VaultTranscript> {
  const json = await open(sealed, passphrase);
  return JSON.parse(json) as VaultTranscript;
}
