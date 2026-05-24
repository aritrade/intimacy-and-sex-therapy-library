/**
 * Pure role types and predicates with NO next-auth or DB dependencies.
 * Importable from unit tests, edge runtime, and any other context that
 * doesn't have a session yet.
 */

export type Role = "user" | "clinician" | "editor" | "admin";

export function hasRole(
  roles: string[] | undefined | null,
  required: Role,
): boolean {
  if (!roles) return false;
  return roles.includes(required);
}

/**
 * Admin-tolerant role check: returns true for the exact role OR for `admin`.
 * Use this in handlers where admins should be able to act as any role.
 */
export function hasRoleOrAdmin(
  roles: string[] | undefined | null,
  required: Role,
): boolean {
  if (!roles) return false;
  return roles.includes(required) || roles.includes("admin");
}
