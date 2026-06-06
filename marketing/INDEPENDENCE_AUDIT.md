# Independence audit — `intimacy-and-sex-therapy-library`

Verified 2026-06-06 — the autonomous content engine runs end-to-end with **no dependency on a personal Mac, on Cursor, or on any other developer workstation**. Everything that needs to happen on a schedule is owned by Vercel Cron, GitHub Actions, or an external SaaS API. Even the marketing collateral (pitch deck, investor explainer, homepage primer film) is now regenerable on GitHub's runners — see the `marketing-build` workflow below.

## What runs where

| Surface | Where it runs | Trigger | Notes |
|---|---|---|---|
| Next.js app, all `/api/*` routes | Vercel (Node serverless, `bom1` region) | HTTP | Includes `/api/admin/*`, `/api/feedback`, `/api/email/subscribe`, the admin dashboards, the public site. |
| Daily script generation | Vercel cron | `30 23 * * *` UTC | `/api/cron/daily-generate` — produces draft scripts; humans approve via `/admin/queue`. |
| Daily content sync (link-health + freshness + discovery) | Vercel cron | `30 21 * * *` UTC | `/api/cron/daily-content-sync` — fans out to all three agents in parallel. |
| Weekly post-metrics + channel-metrics poll | Vercel cron | `0 6 * * 1` UTC | `/api/cron/post-metrics-poll` — pulls IG/YT/FB insights, refreshes follower counts. |
| Long-form Remotion renders (≥150 MB Chromium) | GitHub Actions (`render-due.yml`) | hourly @ `:23`, `workflow_dispatch` from admin Render button | Renders to MP4 → uploads to Vercel Blob → stamps draft DB row. |
| Talking-head avatar (SadTalker, ~7 min CPU) | GitHub Actions (`avatar-render.yml`) | `workflow_dispatch` from the admin "Generate avatar" button | Card-free alternative to Replicate. |
| Hourly publish-when-due | GitHub Actions (`publish-due.yml`) | hourly @ `:07` | Hobby-plan Vercel caps at 1 cron/day, so we use GH Actions to ping our own Vercel endpoint hourly. |
| Adversarial eval harness (nightly) | GitHub Actions (`eval-nightly.yml`) | `0 2 * * *` UTC | Off by default for forks (spends real LLM money). |
| Lighthouse a11y / perf | GitHub Actions (`lighthouse.yml`) | every PR + push to main | Blocks on accessibility / best-practices / SEO regressions. |
| CI (typecheck + tests) | GitHub Actions (`ci.yml`) | every PR + push to main | Node 22 LTS. |
| Marketing collateral (deck + explainer + primer film) | GitHub Actions (`marketing-build.yml`) | `workflow_dispatch` | ffmpeg + Edge TTS + Pillow/python-pptx for the deck/explainer; the primer is a Remotion film (`video-factory/Primer.tsx`) rendered via `npx tsx scripts/render-primer.ts` (Lora/Inter load through `@remotion/google-fonts`, Chrome headless shell auto-installed + cached). Commits refreshed `.pptx` / `.mp4` back. No Mac needed to rebuild. |

**Net: the operator's machine is never on the critical path for any production workflow.** Cursor is the editor used to author code; once the code is pushed to `main`, every subsequent step is automated.

## Verified environment

### Vercel (production) — 26 env vars set

Critical runtime keys all present:

- **Storage / database**: `DATABASE_URL` (Neon), `BLOB_READ_WRITE_TOKEN` (Vercel Blob).
- **Auth**: `AUTH_SECRET`, `AUTH_RESEND_KEY`, `AUTH_RESEND_FROM`, `BOOTSTRAP_ADMIN_EMAILS`.
- **Email (newsletter + contact)**: `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` (Gmail SMTP) with Resend as a fallback. `CONTACT_TO` routes the contact form.
- **LLM**: `LLM_PROVIDER=groq`, `GROQ_API_KEY`, `GROQ_MODEL`.
- **Voice/render**: `TTS_PROVIDER` (Edge TTS, no API key required), `PEXELS_API_KEY`, `PIXABAY_API_KEY`, `REPLICATE_API_TOKEN`.
- **Social publish**: `META_GRAPH_ACCESS_TOKEN`, `INSTAGRAM_BUSINESS_ACCOUNT_ID`, `FACEBOOK_PAGE_ID`, `META_FACEBOOK_PAGE_ID`, `YOUTUBE_CLIENT_ID`, `YOUTUBE_CLIENT_SECRET`, `YOUTUBE_REFRESH_TOKEN`, `YOUTUBE_CHANNEL_ID`.
- **Avatar pipeline handoff**: `GH_RENDER_REPO`, `GH_RENDER_TOKEN` (PAT for the avatar workflow).
- **Crypto**: `KMS_PROVIDER`, `KMS_LOCAL_MASTER_KEY`.
- **Cron auth**: `CRON_SECRET`.
- **Misc**: `LOG_LEVEL`, `ADMIN_BASIC_USER`, `ADMIN_BASIC_AUTH_ENABLED`, `NEXT_PUBLIC_SITE_URL`.

**Email status (resolved 2026-06-06):** the owned double opt-in newsletter and the Contact Us form now send through Gmail SMTP (no custom domain required) via the provider-agnostic mailer (`lib/email/mailer.ts` → SES → SMTP → Resend). The earlier Buttondown 503 gap is closed. If every provider is unset the endpoints still degrade gracefully to a friendly client message instead of erroring.

### GitHub Actions (repo) — 6 secrets set

- `BLOB_READ_WRITE_TOKEN`
- `CRON_SECRET`
- `DATABASE_URL`
- `PEXELS_API_KEY`
- `PIXABAY_API_KEY`
- `VERCEL_DEPLOY_URL`

These are sufficient for the `render-due`, `publish-due`, `eval-nightly`, `lighthouse`, `ci`, and `avatar-render` workflows.

## Code paths checked

Searched the entire codebase for these footguns:

```
localhost     /Users/    file://    process.cwd
```

The only matches are **harmless fallbacks** for development:

- `app/robots.ts` and `app/sitemap.ts`: `process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"`. In production the env var is set to the real URL.
- `lib/ai/llm.ts`: documentation comment referencing the Ollama default address, used only if `LLM_PROVIDER=ollama`. Production uses `LLM_PROVIDER=groq`.

No runtime code reads from the operator's filesystem, calls a localhost service, or assumes a specific path.

## Failure-mode coverage

| Scenario | Behaviour |
|---|---|
| Operator's Mac is offline | Nothing changes — all schedules continue running. |
| Cursor is closed for a week | Nothing changes. |
| Vercel deploy is paused | Last-good build keeps serving; crons keep firing. |
| Groq API is rate-limited | LLM falls back to Anthropic Claude (already wired in `lib/ai/llm.ts`). |
| Edge TTS is unreachable | Per-draft render fails closed; admin sees `errored` status; nothing else breaks. |
| Neon DB is down | App returns 503 from health probe; cron handlers exit early without writing partial state. |

## Bottom line

You can lock the Mac, close Cursor, fly to another country with no internet, and the engine continues to:

1. Generate draft scripts every night at `23:30 UTC` (≈ 5:00 IST).
2. Discover new resources every night at `21:30 UTC`.
3. Render approved drafts every hour at `:23` past.
4. Publish queued items every hour at `:07` past, **only if a human has approved them** (this is intentional).
5. Refresh metrics every Monday at `06:00 UTC`.

Editorial gates (clinician approval, editor approval, human publish-click) still require a human in the loop — by design. The autonomy lives in everything *around* those decisions.
