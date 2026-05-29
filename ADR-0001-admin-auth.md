# ADR-0001: Admin authentication model

Status: **Accepted** — 2026-05-29

## Context

The admin surface (`/admin/*` and `/api/admin/*`) can be reached two ways:

1. **Auth.js session** — a signed-in user whose JWT carries `roles: ["admin", …]`,
   or whose verified email is in `BOOTSTRAP_ADMIN_EMAILS`.
2. **Basic-auth fallback** — `ADMIN_BASIC_USER` / `ADMIN_BASIC_PASS` (disable with
   `ADMIN_BASIC_AUTH_ENABLED=0`).

Two facts forced a decision:

- **Edge sessions are unreliable in production.** The edge middleware's `auth()`
  wrapper consistently returns a null session even when the same cookie decodes
  correctly in the Node runtime. Root cause never isolated (see `middleware.ts`).
  As a result, the authoritative gate was moved into Node-runtime guards, and the
  Basic-auth fallback became the *de-facto* working admin path in production.
- **The guards had drifted out of sync.** The middleware and the page guard
  (`requireRolePage`) honoured the Basic-auth fallback, but the API guards
  (`requireApiAdmin`, `requireRole`) were session-only. A Basic-auth operator
  could therefore view admin pages but got `401` on every `/api/admin/*` action
  whose handler ran the guard before its `DATABASE_URL` check. This surfaced as a
  CI failure in `tests/e2e/post-metrics.spec.ts` and is a latent production bug.

## Decision

**Basic-auth is the supported, first-class admin access path. Auth.js sessions
are an enhancement, not a requirement.** Every admin gate MUST honour the
Basic-auth fallback consistently:

| Layer        | Guard                                   | Honours Basic-auth |
| ------------ | --------------------------------------- | ------------------ |
| Edge sieve   | `middleware.ts` → `adminAuthCheck`      | yes                |
| Page         | `requireRolePage` / `requireAdminPage`  | yes                |
| API (admin)  | `requireApiAdmin`                       | yes (as of this ADR) |
| API (role)   | `requireRole`                           | yes (as of this ADR) |

The single source of truth for the credential check is
`basicAuthHeaderValid()` in `lib/admin/auth.ts` (constant-time compare). The API
guards re-validate the header in the Node runtime rather than trusting the edge
matcher, so they stay correct even if the matcher drifts. A Basic-auth request is
treated as the **admin superuser** (`roles: ["admin"]`, `userId: "basic-admin"`),
which is why it satisfies any `requireRole(…)`.

`requireAuth` (the *user*-area gate, e.g. `/api/account/*`) is deliberately **not**
extended with the Basic-auth fallback — that credential is an ops identity, not an
end-user, and account routes act on a real user's own data.

## Consequences

- The auth posture is consistent across all four layers; the post-metrics e2e
  tests pass and the production parity bug is closed.
- Audit rows for Basic-auth actions are attributed to `basic:<username>` (see
  `lib/admin/actor.ts`). This is intentionally coarse — Basic-auth is a single
  shared ops credential, so it carries **no per-user attribution**. Operators who
  need per-human audit trails must sign in with a session.
- Regression coverage: `tests/unit/basic-auth.test.ts` pins the credential check;
  `tests/e2e/post-metrics.spec.ts` covers the API route path.

## Known limitations / future work

- The shared Basic-auth credential has no per-user attribution and no rotation
  automation. If the team moves to multi-operator admin, invest in fixing the
  edge session decode (or drop edge admin checks entirely and rely on the
  Node-runtime guards + sign-in) and then set `ADMIN_BASIC_AUTH_ENABLED=0`.
- The edge `auth()` null-session root cause remains unisolated. It is tolerated,
  not fixed, by this decision.
