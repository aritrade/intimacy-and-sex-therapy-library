import { desc } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { users, userRoles } from "@/lib/db/schema";
import { requireAdminPage } from "@/lib/auth/admin-page-guard";
import { UserRoleRow } from "@/components/admin/UserRoleRow";
import { InviteUserCard } from "@/components/admin/InviteUserCard";

export const metadata = { title: "Users · Admin" };
export const dynamic = "force-dynamic";

const BOOTSTRAP_ADMIN_EMAILS = (process.env.BOOTSTRAP_ADMIN_EMAILS ?? "")
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

export default async function AdminUsersPage() {
  // Defence-in-depth on top of the middleware.
  const guard = await requireAdminPage();
  if (guard) return guard;

  if (!process.env.DATABASE_URL) {
    return (
      <div className="container-page py-10 max-w-3xl">
        <div className="card p-8 text-sm text-ink-600">
          <h1 className="font-serif text-xl text-ink-900 mb-2">DATABASE_URL not configured</h1>
          <p>Configure the DB then run <code>npm run db:migrate</code>.</p>
        </div>
      </div>
    );
  }

  // One query: users + their granted roles. We hand-write the join because
  // Drizzle's relational query builder isn't yet aware of userRoles for this
  // schema.
  const userRows = await db.select().from(users).orderBy(desc(users.createdAt)).limit(200);
  const roleRows = await db
    .select({ userId: userRoles.userId, role: userRoles.role })
    .from(userRoles);

  const rolesByUser = new Map<string, string[]>();
  for (const r of roleRows) {
    if (!rolesByUser.has(r.userId)) rolesByUser.set(r.userId, []);
    rolesByUser.get(r.userId)!.push(r.role);
  }

  const usersWithRoles = userRows.map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    image: u.image,
    createdAt: u.createdAt,
    roles: rolesByUser.get(u.id) ?? [],
    isBootstrapAdmin:
      !!u.email && BOOTSTRAP_ADMIN_EMAILS.includes(u.email.toLowerCase()),
  }));

  const adminCount = usersWithRoles.filter((u) => u.roles.includes("admin")).length;

  return (
    <div className="container-page py-10 max-w-4xl">
      <header className="mb-6">
        <p className="pill-coral w-fit">Admin · Users</p>
        <h1 className="mt-3 font-serif text-3xl text-ink-900">Users &amp; roles</h1>
        <p className="mt-2 text-ink-600">
          Grant <code>clinician</code>, <code>editor</code>, or <code>admin</code> to
          trusted users. Every change is recorded in the audit log.
        </p>
        <p className="mt-2 text-xs text-ink-400">
          {usersWithRoles.length} users · {adminCount} admins ·{" "}
          {BOOTSTRAP_ADMIN_EMAILS.length > 0
            ? `${BOOTSTRAP_ADMIN_EMAILS.length} bootstrap email(s) configured`
            : "no BOOTSTRAP_ADMIN_EMAILS configured"}
        </p>
        {adminCount === 0 && (
          <div className="mt-4 card p-4 text-sm text-ink-600 border border-coral/40 bg-coral/5">
            <strong className="text-ink-900">No admins exist yet.</strong> Set{" "}
            <code>BOOTSTRAP_ADMIN_EMAILS</code> to your email and sign in once
            via /sign-in to bootstrap the first admin.
          </div>
        )}
      </header>

      <InviteUserCard />

      {usersWithRoles.length === 0 ? (
        <div className="card p-6 text-sm text-ink-600">
          No users have signed in or been invited yet. Use the invite card
          above to pre-grant roles by email.
        </div>
      ) : (
        <ul className="space-y-2">
          {usersWithRoles.map((u) => (
            <UserRoleRow
              key={u.id}
              user={{
                id: u.id,
                name: u.name,
                email: u.email,
                image: u.image,
                roles: u.roles,
                isBootstrapAdmin: u.isBootstrapAdmin,
                createdAt: u.createdAt.toISOString(),
              }}
              isLastAdmin={u.roles.includes("admin") && adminCount <= 1}
            />
          ))}
        </ul>
      )}

      <section className="mt-10 card p-5 text-sm text-ink-600">
        <h2 className="font-serif text-xl text-ink-900 mb-2">Role guide</h2>
        <ul className="list-disc pl-5 space-y-1">
          <li>
            <strong>user</strong> — implicit on every signed-in account; cannot be
            granted or revoked.
          </li>
          <li>
            <strong>viewer</strong> — read-only access to <code>/admin/analytics</code>,{" "}
            <code>/admin/feedback</code>, and <code>/admin/subscribers</code>.
            Cannot approve, publish, edit, or change roles. Good for
            stakeholders who need the numbers but no editorial control.
          </li>
          <li>
            <strong>clinician</strong> — required to approve a draft script
            clinically. The clinician's profile in <code>clinical_advisors</code>{" "}
            should be linked separately.
          </li>
          <li>
            <strong>editor</strong> — required for the second-stage approval and
            to click publish.
          </li>
          <li>
            <strong>admin</strong> — full access including this page (invites,
            grants, revokes). The system refuses to demote the last admin.
          </li>
        </ul>
        <p className="mt-3 text-xs text-ink-500">
          Permission model: granting "viewer" gives access to the read-only
          dashboards. Granting "editor" implicitly gives view access too —
          roles are additive. Mutation endpoints always check the specific
          role they need, so a viewer can never publish or grant.
        </p>
      </section>
    </div>
  );
}
