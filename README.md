# Sex Therapy Library

A clinician-reviewed, India-aware learning platform on sex therapy + Sahay,
an end-to-end-encrypted AI companion. Built with Next.js 14, Postgres +
pgvector, Anthropic Claude, OpenAI embeddings, Auth.js v5, and Remotion.

> **Educational. Not medical advice. Not a licensed therapist.** This site
> discusses sexuality and intimate relationships in clinical detail and is
> for adults (18+).

---

## Non-negotiables (still true after every phase)

- **Allowlist-only ingestion.** Every resource comes from a vetted source
  (AASECT, WPATH, WHO, NIH/PMC, peer-reviewed journals, accredited
  universities). No influencers, no anonymous blogs. See
  [`lib/ingest/allowlist.ts`](lib/ingest/allowlist.ts).
- **No rehosting of copyrighted material.** Open-access full text where
  licensed (PMC OA, CC-BY-*); for everything else: metadata, curator notes,
  short fair-use quotes, deep links to authorised publishers / library
  lending. License gates enforced in the ingestion pipeline.
- **Content-free observability.** No log line, audit row, crisis event, or
  metric ever contains a user prompt, model reply, vault transcript,
  assessment answer, or PII. The single chokepoint is
  [`lib/observability/scrub.ts`](lib/observability/scrub.ts).
- **Sahay is a companion, not a therapist.** Every session opens with the
  disclosure; crisis routing is mandatory; the model card explains what it
  refuses and why.
- **Nothing auto-publishes.** Short-form video drafts require both
  clinician AND editor approval AND a human clicking publish.
- **DPDP Act 2023 + GDPR baked in.** Right-to-erasure cascades across
  every per-user table; consent is granular and revocable.

---

## What's in here today

### Public surfaces

| Route                     | What it is                                                                       |
|---------------------------|----------------------------------------------------------------------------------|
| `/`                       | Landing + age gate (cookie-persisted)                                            |
| `/catalog`                | Faceted catalog with topic + level + license filters                             |
| `/library`                | PDF library with `react-pdf` viewer + ask-the-doc                                |
| `/paths`                  | Learning paths (couples-reset, sexless-marriage, anxiety-ed, lgbtq-affirming)    |
| `/glossary`, `/myths`     | Plain-language glossary + myths-vs-facts hub                                     |
| `/assessments`            | PHQ-9, GAD-7, NSSS-S — score-only, content-free                                  |
| `/decide`, `/worksheets`  | Decision aid + clinician-friendly worksheets                                     |
| `/clinicians`             | Directory of vetted Indian sex therapists with regional filters                  |
| `/chat`                   | Library citation chatbot (RAG with hybrid BM25 + pgvector)                       |
| `/companion`              | Sahay AI companion (3 confidentiality modes, hi/en/hinglish)                     |
| `/about/privacy`          | Privacy notice (DPDP + GDPR)                                                     |
| `/about/model`            | Model card with refusal categories + eval results                                |
| `/about/clinical-board`   | Clinical advisory board members                                                  |
| `/sign-in`, `/account`    | Auth.js sign-in + per-user dashboard                                             |
| `/status`                 | Public ops status — DB, KMS, LLM, embeddings                                     |

### Admin surfaces (gated)

| Route                          | Role          | What it is                                                |
|--------------------------------|---------------|-----------------------------------------------------------|
| `/admin`                       | admin         | Operations dashboard with metrics + takedown alerts       |
| `/admin/drafts`                | admin         | Draft queue with status filter chips                      |
| `/admin/drafts/[id]`           | clin/edit/adm | Parsed-section review console + structured request-changes |
| `/admin/users`                 | admin         | User-role management (promote/demote, last-admin rail)    |

### API surfaces

| Route                                          | Public? | Notes                                              |
|------------------------------------------------|---------|----------------------------------------------------|
| `/api/chat`, `/api/companion/chat`             | yes     | Stream + crisis check + content-free logging      |
| `/api/search`                                  | yes     | Hybrid retriever (BM25 + cosine via RRF)           |
| `/api/health`, `/api/ready`                    | yes     | Probes — same logic as `/status`                  |
| `/api/account/{forget,assessment-results,...}` | session | Per-user persistence + right-to-erasure            |
| `/api/admin/*`                                 | admin   | Drafts CRUD, approve, publish, request-changes    |
| `/api/admin/roles`                             | admin   | Promote / demote, last-admin rail                  |
| `/api/admin/post-metrics/poll`                 | admin   | Manual trigger of the engagement poller           |
| `/api/cron/post-metrics-poll`                  | cron    | Vercel cron entry, gated by `CRON_SECRET`         |

### Background jobs

- **Weekly post-metrics poll** (`vercel.json` cron, Mondays 06:00 UTC) — pulls
  Instagram + YouTube engagement, persists to `post_metrics`, detects
  takedowns and surfaces them on the admin dashboard. Local: `npm run
  social:pull-metrics`.
- **Nightly adversarial eval** (`.github/workflows/eval-nightly.yml`) — runs
  the eval harness against the prompt set; opens an issue if any required
  threshold regresses.
- **Lighthouse CI** (`.github/workflows/lighthouse.yml`) — performance +
  accessibility + best-practices + SEO assertions on every PR.

---

## Architecture

```
                     ┌────────────────────────┐
   Public users ───▶ │  Next.js (Vercel/bom1) │ ◀── Vercel Cron
                     │  - middleware role gate│
                     │  - server components   │
                     └─────────┬──────────────┘
                               │
            ┌──────────────────┼──────────────────┐
            ▼                  ▼                  ▼
      Anthropic Claude    OpenAI Embeddings   Postgres+pgvector
      (gen + Sahay)       (text-embedding-3)  (Neon, bom1)
                                                  │
                               ┌──────────────────┴───────┐
                               ▼                          ▼
                          KMS (AWS|local)         Upstash Redis (rate)
```

Code is grouped by capability, not by HTTP layer:

```
app/                     route handlers + server components
  api/{chat,companion,admin,account,cron,health,ready}/
  admin/{page,drafts,users}/
  about/, catalog/, library/, paths/, ...
components/              shared UI primitives + admin/* + safety/*
lib/
  ai/                    Anthropic + embeddings + RAG retrievers
  admin/                 stats queries, actor resolver, basic-auth fallback
  auth/                  Auth.js config, role helpers, page guards
  compliance/            DPDP / GDPR purposes, consent state
  crypto/                AES-GCM vault, envelope encryption helpers
  db/                    Drizzle schema (one file, every table)
  i18n/                  en / hi / hinglish (parity-tested)
  ingest/                allowlist, license gate, semantic chunker
  kms/                   pluggable provider (local fallback + AWS)
  observability/         scrubber, logger, audit + crisis event writers
  safety/                guardrails, crisis resources, refusal templates
  search/                hybrid BM25 + pgvector with RRF
  social/                script gen, parser, publishers, metrics poller
drizzle/                 generated migrations + hand-written SQL
tests/
  unit/                  fast vitest suite (parsers, scrubber, guards, …)
  integration/           ephemeral Dockerised Postgres in CI
  e2e/                   Playwright against the production bundle
.github/workflows/       ci, eval-nightly, lighthouse, post-metrics
scripts/                 seed-*, ingest, eval, render-draft, preflight, …
```

---

## Quickstart

```sh
npm install
cp .env.example .env
# Fill: DATABASE_URL, ANTHROPIC_API_KEY, OPENAI_API_KEY, KMS_LOCAL_MASTER_KEY,
#       AUTH_SECRET, optionally Google/Resend, BOOTSTRAP_ADMIN_EMAILS, …
npm run db:migrate        # drizzle + 0001_indexes + 0002_reviewer_notes
npm run db:seed-all       # allowlist + tags + board + clinicians + 35 resources
npm run dev               # http://localhost:3000
```

Local Postgres with pgvector:

```sh
docker run --name stl-pg -e POSTGRES_PASSWORD=postgres \
  -p 5432:5432 -d pgvector/pgvector:pg16
psql postgresql://postgres:postgres@localhost:5432/postgres \
  -c 'CREATE DATABASE sextherapy;'
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/sextherapy \
  npm run db:migrate
```

---

## 60-second reviewer tour

Spin up the production bundle locally:

```sh
npm run build
PORT=3100 \
KMS_PROVIDER=local KMS_LOCAL_MASTER_KEY="$(node -e "console.log(require('crypto').randomBytes(32).toString('base64'))")" \
ADMIN_BASIC_USER=admin ADMIN_BASIC_PASS=letmein \
AUTH_SECRET="$(node -e "console.log(require('crypto').randomBytes(32).toString('base64'))")" \
  npx next start -p 3100
```

Then click through:

1. **Public posture** — `/` (age gate), `/catalog`, `/paths`, `/library`,
   `/glossary`, `/myths`, `/assessments` (PHQ-9 anchored).
2. **Trust** — `/about/privacy`, `/about/model`, `/about/clinical-board`,
   `/clinicians`, `/status`.
3. **AI surfaces** — `/chat` (refuses cleanly without `ANTHROPIC_API_KEY`),
   `/companion` (three confidentiality modes, hi/hinglish toggle).
4. **Admin** — sign in via `admin` / `letmein` Basic-auth (or via Auth.js
   if you set `BOOTSTRAP_ADMIN_EMAILS`):
    - `/admin` — dashboard with metric cards, drafts queue, eval trend,
      audit log, crisis events, recent posts, takedown alerts.
    - `/admin/drafts/[id]` (any draft) — parsed-section review with
      structured request-changes feedback.
    - `/admin/users` — promote / demote with last-admin safety rail.
5. **Probes** — `curl :3100/api/ready` and `curl :3100/api/health` return
   200 / 503 with subsystem detail.

---

## Verification

```sh
npm run typecheck         # 0 errors
npm run lint              # 0 errors
npm test                  # vitest unit + skipped integration suites
npm run test:integration  # set INTEGRATION_DATABASE_URL first
npm run test:e2e          # builds + serves + runs Playwright
npm run preflight         # env / DB / KMS / extension sanity check
```

CI in `.github/workflows/ci.yml` runs all of the above on every PR;
`lighthouse.yml` and `eval-nightly.yml` cover performance + adversarial
correctness on a schedule.

---

## Deployment

See [`DEPLOY.md`](DEPLOY.md) for the full runbook (Neon, Vercel, KMS,
Auth.js bootstrap, post-deploy verification).

Phases shipped:

- **Phase 1** scaffold + schema + allowlist + compliance.
- **Phase 2** ingestion pipeline (PMC, WPATH, WHO), tagger, faceted catalog,
  PDF library, plain-language variants, glossary, myths-vs-facts.
- **Phase 3** citation chatbot, hybrid RAG, eval harness.
- **Phase 4** clinical advisory board, validated assessments, learning
  paths, decision aid, worksheets.
- **Phase 5** Sahay companion + three confidentiality modes + India-first
  clinician handoff + Hindi/Hinglish.
- **Phase 6** content factory (Remotion + Sarvam/ElevenLabs/Whisper) +
  Instagram/YouTube publishers (human-in-the-loop only).
- **Phase 7** Auth.js v5 with Drizzle adapter + role schema.
- **Phase 8** observability, KMS, probes, SEO, preflight, security headers.
- **Phase 9** unit + integration + Playwright E2E + CI.
- **Phase 10** content-free crisis events + audit log writers.
- **Phase 11** integration tests on ephemeral Postgres + Lighthouse CI.
- **Phase 12** i18n parity + admin operations dashboard + public status page.
- **Phase 13** session-based admin gate, role bootstrap, clinician review
  console with parsed sections + structured request-changes.
- **Phase 14** post-metrics poller (IG + YouTube) + takedown alerts on the
  admin dashboard + weekly Vercel cron.
