"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type UserView = {
  id: string;
  name: string | null;
  email: string | null;
  image: string | null;
  roles: string[];
  isBootstrapAdmin: boolean;
  createdAt: string;
};

const GRANTABLE = ["clinician", "editor", "admin"] as const;
type Grantable = (typeof GRANTABLE)[number];

export function UserRoleRow({
  user,
  isLastAdmin,
}: {
  user: UserView;
  isLastAdmin: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function mutate(method: "POST" | "DELETE", role: Grantable) {
    if (busy) return;
    setBusy(`${method}:${role}`);
    setError(null);
    try {
      const res = await fetch("/api/admin/roles", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.id, role }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok) {
        setError(j?.detail ?? j?.error ?? `Request failed (${res.status}).`);
      } else {
        router.refresh();
      }
    } finally {
      setBusy(null);
    }
  }

  return (
    <li className="card p-4">
      <div className="flex items-start gap-3">
        <Avatar name={user.name} email={user.email} image={user.image} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-ink-900 truncate">
              {user.name ?? user.email ?? user.id.slice(0, 8)}
            </span>
            {user.isBootstrapAdmin && (
              <span className="pill-teal" title="Email is in BOOTSTRAP_ADMIN_EMAILS">
                bootstrap
              </span>
            )}
            {user.roles.length === 0 ? (
              <span className="pill">user</span>
            ) : (
              user.roles.map((r) => (
                <span key={r} className={r === "admin" ? "pill-coral" : "pill-accent"}>
                  {r}
                </span>
              ))
            )}
          </div>
          <p className="mt-1 text-xs text-ink-400 truncate">
            {user.email ?? "no email"} · joined {new Date(user.createdAt).toLocaleDateString()}
          </p>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {GRANTABLE.map((role) => {
          const has = user.roles.includes(role);
          const blocked = role === "admin" && has && isLastAdmin;
          const label = has ? `Revoke ${role}` : `Grant ${role}`;
          const method: "POST" | "DELETE" = has ? "DELETE" : "POST";
          return (
            <button
              key={role}
              type="button"
              onClick={() => mutate(method, role)}
              disabled={!!busy || blocked}
              className={has ? "btn-secondary text-xs" : "btn-secondary text-xs"}
              title={blocked ? "Cannot demote the last admin" : undefined}
            >
              {busy === `${method}:${role}` ? "…" : label}
            </button>
          );
        })}
      </div>

      {error && (
        <div role="alert" className="mt-2 text-xs text-coral">
          {error}
        </div>
      )}
    </li>
  );
}

function Avatar({
  name,
  email,
  image,
}: {
  name: string | null;
  email: string | null;
  image: string | null;
}) {
  if (image) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={image}
        alt=""
        className="h-10 w-10 rounded-full border border-border object-cover"
      />
    );
  }
  const seed = (name ?? email ?? "?").trim();
  const initial = seed.charAt(0).toUpperCase();
  return (
    <div
      aria-hidden
      className="h-10 w-10 rounded-full bg-accent/15 text-ink-900 font-medium grid place-items-center"
    >
      {initial || "?"}
    </div>
  );
}
