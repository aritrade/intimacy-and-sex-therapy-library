import { describe, expect, it } from "vitest";
import { hasRole, hasRoleOrAdmin } from "@/lib/auth/role-types";
import { isBasicAuthEnabled } from "@/lib/admin/auth";

describe("hasRole", () => {
  it("returns true only for an exact match", () => {
    expect(hasRole(["clinician"], "clinician")).toBe(true);
    expect(hasRole(["editor"], "clinician")).toBe(false);
    expect(hasRole(["admin"], "clinician")).toBe(false); // admin is NOT auto-elevated here
    expect(hasRole(["admin", "editor"], "editor")).toBe(true);
  });

  it("treats null/undefined/empty as no role", () => {
    expect(hasRole(null, "user")).toBe(false);
    expect(hasRole(undefined, "user")).toBe(false);
    expect(hasRole([], "user")).toBe(false);
  });
});

describe("hasRoleOrAdmin", () => {
  it("treats admin as a superuser for any required role", () => {
    expect(hasRoleOrAdmin(["admin"], "clinician")).toBe(true);
    expect(hasRoleOrAdmin(["admin"], "editor")).toBe(true);
    expect(hasRoleOrAdmin(["admin"], "admin")).toBe(true);
  });
  it("falls through to exact match when admin is not present", () => {
    expect(hasRoleOrAdmin(["clinician"], "clinician")).toBe(true);
    expect(hasRoleOrAdmin(["clinician"], "editor")).toBe(false);
  });
  it("treats null/undefined as not authorised", () => {
    expect(hasRoleOrAdmin(null, "clinician")).toBe(false);
    expect(hasRoleOrAdmin(undefined, "admin")).toBe(false);
  });
});

describe("isBasicAuthEnabled", () => {
  const orig = { ...process.env };
  function restore() {
    delete process.env.ADMIN_BASIC_AUTH_ENABLED;
    delete process.env.ADMIN_BASIC_USER;
    delete process.env.ADMIN_BASIC_PASS;
    if (orig.ADMIN_BASIC_AUTH_ENABLED) process.env.ADMIN_BASIC_AUTH_ENABLED = orig.ADMIN_BASIC_AUTH_ENABLED;
    if (orig.ADMIN_BASIC_USER) process.env.ADMIN_BASIC_USER = orig.ADMIN_BASIC_USER;
    if (orig.ADMIN_BASIC_PASS) process.env.ADMIN_BASIC_PASS = orig.ADMIN_BASIC_PASS;
  }

  it("disabled when no creds are set", () => {
    delete process.env.ADMIN_BASIC_USER;
    delete process.env.ADMIN_BASIC_PASS;
    delete process.env.ADMIN_BASIC_AUTH_ENABLED;
    expect(isBasicAuthEnabled()).toBe(false);
    restore();
  });

  it("enabled when both creds are set", () => {
    process.env.ADMIN_BASIC_USER = "u";
    process.env.ADMIN_BASIC_PASS = "p";
    delete process.env.ADMIN_BASIC_AUTH_ENABLED;
    expect(isBasicAuthEnabled()).toBe(true);
    restore();
  });

  it("force-disabled by ADMIN_BASIC_AUTH_ENABLED=0 even with creds", () => {
    process.env.ADMIN_BASIC_USER = "u";
    process.env.ADMIN_BASIC_PASS = "p";
    process.env.ADMIN_BASIC_AUTH_ENABLED = "0";
    expect(isBasicAuthEnabled()).toBe(false);
    restore();
  });
});
