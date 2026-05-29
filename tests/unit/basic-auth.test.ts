import { afterEach, describe, expect, it } from "vitest";
import { basicAuthHeaderValid } from "@/lib/admin/auth";

/**
 * Guards the Basic-auth fallback that the edge middleware, page guard,
 * requireApiAdmin, and requireRole all rely on. A regression here is what
 * locked Basic-auth operators out of /api/admin/* (the post-metrics e2e
 * failure), so the credential comparison is pinned with explicit cases.
 */

const ORIG = { ...process.env };

function setCreds(user?: string, pass?: string, enabledFlag?: string) {
  delete process.env.ADMIN_BASIC_USER;
  delete process.env.ADMIN_BASIC_PASS;
  delete process.env.ADMIN_BASIC_AUTH_ENABLED;
  if (user !== undefined) process.env.ADMIN_BASIC_USER = user;
  if (pass !== undefined) process.env.ADMIN_BASIC_PASS = pass;
  if (enabledFlag !== undefined) process.env.ADMIN_BASIC_AUTH_ENABLED = enabledFlag;
}

function basic(user: string, pass: string): string {
  return "Basic " + Buffer.from(`${user}:${pass}`).toString("base64");
}

afterEach(() => {
  delete process.env.ADMIN_BASIC_USER;
  delete process.env.ADMIN_BASIC_PASS;
  delete process.env.ADMIN_BASIC_AUTH_ENABLED;
  if (ORIG.ADMIN_BASIC_USER) process.env.ADMIN_BASIC_USER = ORIG.ADMIN_BASIC_USER;
  if (ORIG.ADMIN_BASIC_PASS) process.env.ADMIN_BASIC_PASS = ORIG.ADMIN_BASIC_PASS;
  if (ORIG.ADMIN_BASIC_AUTH_ENABLED)
    process.env.ADMIN_BASIC_AUTH_ENABLED = ORIG.ADMIN_BASIC_AUTH_ENABLED;
});

describe("basicAuthHeaderValid", () => {
  it("accepts the exact configured credentials", () => {
    setCreds("ops", "s3cret");
    expect(basicAuthHeaderValid(basic("ops", "s3cret"))).toBe(true);
  });

  it("rejects a wrong username", () => {
    setCreds("ops", "s3cret");
    expect(basicAuthHeaderValid(basic("nope", "s3cret"))).toBe(false);
  });

  it("rejects a wrong password", () => {
    setCreds("ops", "s3cret");
    expect(basicAuthHeaderValid(basic("ops", "wrong"))).toBe(false);
  });

  it("rejects when Basic-auth is force-disabled even with matching creds", () => {
    setCreds("ops", "s3cret", "0");
    expect(basicAuthHeaderValid(basic("ops", "s3cret"))).toBe(false);
  });

  it("rejects when creds are not configured", () => {
    setCreds(undefined, undefined);
    expect(basicAuthHeaderValid(basic("ops", "s3cret"))).toBe(false);
  });

  it("rejects a null / missing / non-Basic header", () => {
    setCreds("ops", "s3cret");
    expect(basicAuthHeaderValid(null)).toBe(false);
    expect(basicAuthHeaderValid(undefined)).toBe(false);
    expect(basicAuthHeaderValid("Bearer abc")).toBe(false);
  });

  it("rejects a header with no colon separator", () => {
    setCreds("ops", "s3cret");
    const noColon = "Basic " + Buffer.from("opss3cret").toString("base64");
    expect(basicAuthHeaderValid(noColon)).toBe(false);
  });

  it("treats a password that itself contains a colon correctly", () => {
    setCreds("ops", "pa:ss:word");
    expect(basicAuthHeaderValid(basic("ops", "pa:ss:word"))).toBe(true);
  });
});
