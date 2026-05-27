/**
 * Pure role types and predicates with NO next-auth or DB dependencies.
 * Importable from unit tests, edge runtime, and any other context that
 * doesn't have a session yet.
 */

export type Role = "user" | "viewer" | "clinician" | "editor" | "admin";

/**
 * Roles that grant read access to the /admin area. `viewer` is a strictly
 * read-only role used for stakeholders who should see the analytics,
 * feedback, and subscriber dashboards but cannot mutate anything.
 */
export const ADMIN_AREA_ROLES: readonly Role[] = [
  "viewer",
  "clinician",
  "editor",
  "admin",
];

export function hasAnyAdminAreaRole(
  roles: string[] | undefined | null,
): boolean {
  if (!roles) return false;
  return ADMIN_AREA_ROLES.some((r) => roles.includes(r));
}

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
