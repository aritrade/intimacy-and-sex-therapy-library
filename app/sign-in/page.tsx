import Link from "next/link";
import { isAuthAvailable } from "@/lib/auth/edge-config";
import { signIn } from "@/lib/auth/auth";

export const metadata = { title: "Sign in · Intimacy & Sex Therapy Library" };
export const dynamic = "force-dynamic";

const hasGoogle = !!(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET);
const hasEmail = !!(process.env.AUTH_RESEND_KEY && process.env.AUTH_RESEND_FROM);

export default function SignInPage() {
  if (!isAuthAvailable) {
    return (
      <div className="container-page py-10 max-w-md">
        <div className="card p-6">
          <h1 className="font-serif text-2xl text-ink-900">Sign-in is disabled</h1>
          <p className="mt-2 text-sm text-ink-600">
            The site works fully without an account. To unlock saved
            assessments, learning-path progress, and the encrypted vault,
            an operator needs to configure either Google OAuth (
            <code>AUTH_GOOGLE_ID</code> + <code>AUTH_GOOGLE_SECRET</code>) or Resend
            magic links (<code>AUTH_RESEND_KEY</code> + <code>AUTH_RESEND_FROM</code>), plus
            <code> AUTH_SECRET</code>.
          </p>
          <Link href="/" className="mt-4 inline-block btn-secondary">
            Back to home
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="container-page py-10 max-w-md">
      <header className="mb-6">
        <p className="pill-accent w-fit">Optional</p>
        <h1 className="mt-3 font-serif text-3xl text-ink-900">Sign in</h1>
        <p className="mt-2 text-ink-600">
          Sign in to save assessment scores, track path progress, and back up
          your encrypted vault. The chatbot, Sahay companion, library, and
          worksheets work without an account.
        </p>
      </header>

      <div className="card p-6 space-y-4">
        {hasGoogle && (
          <form
            action={async () => {
              "use server";
              await signIn("google", { redirectTo: "/account" });
            }}
          >
            <button type="submit" className="btn-secondary w-full justify-center">
              Continue with Google
            </button>
          </form>
        )}

        {hasGoogle && hasEmail && (
          <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-ink-400">
            <span className="h-px flex-1 bg-border" />
            <span>or</span>
            <span className="h-px flex-1 bg-border" />
          </div>
        )}

        {hasEmail && (
          <form
            action={async (formData: FormData) => {
              "use server";
              const email = String(formData.get("email") ?? "");
              if (!email) return;
              await signIn("resend", { email, redirectTo: "/account" });
            }}
            className="space-y-3"
          >
            <label className="block text-sm">
              <span className="block text-ink-900 mb-1">Email magic link</span>
              <input
                name="email"
                type="email"
                required
                placeholder="you@example.com"
                className="w-full rounded-xl border border-border bg-surface p-3 text-sm focus:border-accent focus:outline-none"
              />
            </label>
            <button type="submit" className="btn-primary w-full justify-center">
              Send sign-in link
            </button>
          </form>
        )}
      </div>

      <p className="mt-6 text-xs text-ink-400">
        We log only your email and the sign-in event. We do not log your search
        queries, chatbot prompts, or assessment answers. See the{" "}
        <Link href="/about/privacy" className="underline">
          privacy notice
        </Link>{" "}
        for the full picture.
      </p>
    </div>
  );
}
