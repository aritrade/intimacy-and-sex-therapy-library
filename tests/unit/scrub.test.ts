import { describe, expect, it } from "vitest";
import { scrubObject, scrubString, hashForCorrelation } from "@/lib/observability/scrub";

describe("scrubString", () => {
  it("redacts emails", () => {
    expect(scrubString("contact me at jane.doe@example.com please")).toBe(
      "contact me at [email] please",
    );
  });

  it("redacts Indian phone numbers", () => {
    expect(scrubString("call +91 98765 43210")).toBe("call [phone]");
  });

  it("redacts Aadhaar numbers (grouped or contiguous)", () => {
    expect(scrubString("aadhaar 1234 5678 9012")).toBe("aadhaar [aadhaar]");
    expect(scrubString("aadhaar 123456789012")).toContain("[aadhaar]");
  });

  it("redacts PAN numbers", () => {
    expect(scrubString("pan ABCDE1234F")).toBe("pan [pan]");
  });

  it("redacts JWT-shaped tokens", () => {
    const fake = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.payload.signaturepart";
    expect(scrubString(`Bearer ${fake}`)).toContain("[jwt]");
  });

  it("redacts API keys", () => {
    expect(scrubString("sk-abcDEF1234567890abcdefghij")).toContain("[api-key]");
    expect(scrubString("ant-abcDEF1234567890abcdefghij")).toContain("[api-key]");
  });

  it("truncates very long strings to a sha256 prefix", () => {
    const long = "a".repeat(500);
    const out = scrubString(long);
    expect(out).toMatch(/^\[truncated len=500 sha256=[0-9a-f]{16}\]$/);
  });

  it("handles non-strings gracefully", () => {
    // @ts-expect-error: deliberately wrong type
    expect(scrubString(null)).toBe("null");
  });
});

describe("scrubObject", () => {
  it("drops dangerous keys at any depth", () => {
    const input = {
      route: "/api/companion/chat",
      messages: [{ role: "user", content: "private content" }],
      meta: {
        prompt: "system prompt",
        ok: true,
        nested: { transcript: "more content", clean: "fine" },
      },
    };
    const out = scrubObject(input) as Record<string, unknown>;
    expect(out.route).toBe("/api/companion/chat");
    expect(out.messages).toBe("[redacted]");
    const meta = out.meta as Record<string, unknown>;
    expect(meta.prompt).toBe("[redacted]");
    expect(meta.ok).toBe(true);
    const nested = meta.nested as Record<string, unknown>;
    expect(nested.transcript).toBe("[redacted]");
    expect(nested.clean).toBe("fine");
  });

  it("hashes correlation keys instead of dropping them", () => {
    const out = scrubObject({ userId: "abc123", email: "x@y.co", ok: 1 }) as Record<
      string,
      unknown
    >;
    expect(out.userId).toMatch(/^sha256:[0-9a-f]{16}$/);
    expect(out.email).toMatch(/^sha256:[0-9a-f]{16}$/);
    expect(out.ok).toBe(1);
  });

  it("scrubs PII inside string values", () => {
    const out = scrubObject({ note: "reach me at u@v.co" }) as Record<string, unknown>;
    expect(out.note).toBe("reach me at [email]");
  });

  it("handles cyclic references without crashing", () => {
    const obj: Record<string, unknown> = { a: 1 };
    obj.self = obj;
    const out = scrubObject(obj) as Record<string, unknown>;
    expect(out.a).toBe(1);
    expect(out.self).toBe("[cycle]");
  });

  it("serialises Errors with scrubbed message + stack", () => {
    const err = new Error("contact me at admin@example.com");
    const out = scrubObject({ err }) as { err: { message: string; stack?: string } };
    expect(out.err.message).toContain("[email]");
    expect(out.err.message).not.toContain("admin@example.com");
  });

  it("converts dates and bigints to safe primitives", () => {
    const out = scrubObject({ d: new Date(0), big: 10n }) as Record<string, unknown>;
    expect(out.d).toBe("1970-01-01T00:00:00.000Z");
    expect(out.big).toBe("10");
  });
});

describe("hashForCorrelation", () => {
  it("is deterministic and 16 hex chars", () => {
    const a = hashForCorrelation("user:abc");
    const b = hashForCorrelation("user:abc");
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{16}$/);
  });

  it("differs across inputs", () => {
    expect(hashForCorrelation("a")).not.toBe(hashForCorrelation("b"));
  });
});
