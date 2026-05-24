# Production Deploy Guide

This guide takes the app from a fresh Vercel + Neon setup through a soft launch.
It assumes you already have working credentials for Anthropic, OpenAI, and
(optionally) Sarvam, ElevenLabs, Resend, Google Cloud, and Meta/YouTube.

> **Hard rule.** Do not soft-launch without the **clinical board approving the
> first 10 published resources** and the **adversarial eval (`npm run eval`)
> passing all required gates** (see [`scripts/eval.ts`](scripts/eval.ts)).

---

## 1. Database — Neon Postgres

1. Create a project in [Neon](https://neon.tech). Pick a region close to your
   users (Mumbai/Singapore for India-first traffic).

2. Inside the SQL editor, enable the two required extensions on the primary
   branch:

   ```sql
   CREATE EXTENSION IF NOT EXISTS vector;
   CREATE EXTENSION IF NOT EXISTS pg_trgm;
   ```

3. Copy the pooled connection string into `DATABASE_URL`. Use the **pooled**
   endpoint for serverless functions; reserve the direct endpoint for
   migrations and cron jobs.

4. From your laptop, run migrations + indexes against the new database:

   ```sh
   DATABASE_URL='...'  npm run db:migrate
   DATABASE_URL='...'  psql "$DATABASE_URL" -f drizzle/0001_indexes.sql
   ```

5. Seed in this order (the convenience target chains them all):

   ```sh
   DATABASE_URL='...' \
   ANTHROPIC_API_KEY='...' \
   OPENAI_API_KEY='...' \
     npm run db:seed-all
   ```

   This populates: source allowlist → tag taxonomy → clinical advisors →
   clinician directory → 35 curated resources.

6. Sanity check from `psql`:

   ```sql
   SELECT count(*) FROM resources WHERE is_published = false;   -- expect ≥ 35
   SELECT count(*) FROM resource_tags;                          -- expect > 100
   SELECT count(*) FROM clinical_advisors;                      -- expect 5
   ```

---

## 2. KMS — pick one

The platform uses envelope encryption for Sahay's `encrypted` mode. Pick **one**
provider and set it in production. The local fallback is fine for staging but
must not be the only line of defence in prod.

### AWS KMS (recommended)

```sh
npm install @aws-sdk/client-kms        # in this repo, will be persisted
aws kms create-key --description "stl-prod" \
  --key-spec SYMMETRIC_DEFAULT --key-usage ENCRYPT_DECRYPT
aws kms create-alias --alias-name alias/stl-prod \
  --target-key-id <id from previous command>
```

Set in Vercel:

```
KMS_PROVIDER=aws
AWS_REGION=ap-south-1
AWS_KMS_KEY_ID=alias/stl-prod
```

For credentials, prefer Vercel's [AWS OIDC integration](https://vercel.com/docs/security/secure-backend-access/oidc) over static keys.

### Local (staging only)

```sh
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
# paste into KMS_LOCAL_MASTER_KEY
KMS_PROVIDER=local
```

---

## 3. Vercel project

1. Import the repo into Vercel. Framework = Next.js (auto-detected).

2. Project Settings → Environment Variables. Paste from `.env.example`,
   filling in every section you intend to enable. **Critical**:

   - `DATABASE_URL` (Neon pooled)
   - `LLM_PROVIDER` plus the matching API key. For free hosted deploys the
     recommended path is **Groq** (`LLM_PROVIDER=groq`, `GROQ_API_KEY=…` from
     [console.groq.com](https://console.groq.com), default model
     `llama-3.3-70b-versatile`). For paid frontier-model quality use
     `LLM_PROVIDER=anthropic` with `ANTHROPIC_API_KEY`. The Ollama path is
     local-only and **does not work** on serverless hosts.
   - `OPENAI_API_KEY` (still required for embeddings + Whisper STT, even if
     chat/companion are routed through Groq or Anthropic)
   - `AUTH_SECRET`, plus at least one of (`AUTH_GOOGLE_*`, `AUTH_RESEND_*`)
   - `KMS_PROVIDER` and the matching key vars
   - `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_DPO_*`
   - `BOOTSTRAP_ADMIN_EMAILS` (comma-separated list of emails that auto-receive
     the `admin` role on first sign-in — set this BEFORE deploying so the first
     human into the admin panel is bootstrapped automatically)
   - `ADMIN_BASIC_USER`, `ADMIN_BASIC_PASS` are now the **fallback** path. In
     a fresh deploy you can leave them blank: the bootstrap admin email is
     enough. Set both if you want a curl-friendly break-glass path; once your
     team is fully on session-based access, set `ADMIN_BASIC_AUTH_ENABLED=0`
     to force-disable Basic-auth even if the creds remain set.

3. The committed `vercel.json` already pins:
   - Region `bom1` (Mumbai). Move to `iad1` etc. if your audience shifts.
   - 60-second `maxDuration` for the AI streaming routes.

4. Deploy. The first build will take ~3–4 minutes because of pgvector
   client compilation and Remotion's bundler.

5. **Bootstrap the first admin** — once Auth.js has at least one provider
   wired up:

   ```sh
   # In Vercel project settings, set:
   #   BOOTSTRAP_ADMIN_EMAILS="ops@your-org,founder@your-org"
   # Redeploy.
   # Then visit https://$DOMAIN/sign-in and sign in with one of those emails.
   # On first sign-in the JWT callback will:
   #   - upsert your user row (Drizzle adapter)
   #   - insert (userId, 'admin') into user_roles
   #   - write an audit_log row tagged role_bootstrap_admin
   # You should now see the dashboard at /admin and be able to grant
   # clinician/editor roles to others from /admin/users.
   ```

   Verify:

   ```sh
   psql "$DATABASE_URL" -c "select u.email, r.role
                              from user_roles r join users u on u.id = r.user_id
                              where r.role = 'admin';"
   psql "$DATABASE_URL" -c "select action, ts from audit_log
                              where action = 'role_bootstrap_admin'
                              order by ts desc limit 5;"
   ```

---

## 4. Post-deploy verification

After the first production build is live, run this checklist against the
`https://your-prod-domain` URL.

### Probes

```sh
curl -fsS https://$DOMAIN/api/ready          # 200 {"ok":true,...}
curl -fsS https://$DOMAIN/api/health         # 200 with all subsystems ok
```

If `/api/health` returns 503, the JSON body lists which subsystem failed:

| subsystem | meaning | usual fix                             |
|-----------|---------|----------------------------------------|
| db        | DATABASE_URL or pgvector | re-run step 1                |
| kms       | wrap/unwrap round-trip   | re-check step 2              |
| llm       | GROQ_API_KEY / ANTHROPIC_API_KEY | re-add the key for the active LLM_PROVIDER, redeploy |
| embed     | OPENAI_API_KEY           | re-add the key, redeploy     |

### Public pages

```sh
for p in / /catalog /library /paths /clinicians /assessments /worksheets \
         /glossary /myths /decide /about/privacy /about/model \
         /about/clinical-board /robots.txt /sitemap.xml; do
  printf "%-30s " "$p"
  curl -o /dev/null -s -w "%{http_code}\n" https://$DOMAIN$p
done
```

All should return 200.

### Authenticated surfaces

```sh
curl -o /dev/null -s -w "%{http_code}\n" https://$DOMAIN/account     # 307 → /sign-in
curl -o /dev/null -s -w "%{http_code}\n" https://$DOMAIN/admin       # 401 (basic auth) or 403
```

### Streaming

Open the production site in a browser and:

1. Visit `/chat`, ask a question. Confirm the model streams citations and the
   crisis banner is visible.
2. Visit `/companion`, accept the disclosure, send a check-in. Confirm
   - the response is grounded in the Sahay system prompt,
   - mode toggles (ephemeral/encrypted/vault) work,
   - rate-limit headers are present in the response.

---

## 5. Soft-launch checklist

| Gate | What to check | Owner |
|------|---------------|-------|
| Clinical | First 10 resources approved by clinical board (`is_published=true`) | Clinical lead |
| Safety   | `npm run eval` passes refusal-rate, accuracy, and bias gates | Eng + Clinical |
| Privacy  | DPDP/GDPR pages render with real DPO contact info | Legal |
| Content  | Crisis banner shows local hotlines for IN/US/UK | Eng |
| Auth     | Sign-in works for both Google and email magic link | Eng |
| Account  | "Forget me" deletes all rows in a transaction | Eng |
| KMS      | `/api/health` reports `kms.ok=true` with `provider=aws` | Eng |
| Logs     | Spot-check 50 random Vercel log lines — no PII, no prompts, no transcripts | Eng |
| Rate     | Upstash dashboard shows traffic; no 429 storms | Eng |
| Robots   | `/robots.txt` disallows `/companion`, `/chat`, `/account`, `/admin`, `/api/` | Eng |
| Sitemap  | `/sitemap.xml` lists only public pages | Eng |
| Backups  | Neon point-in-time recovery enabled with ≥ 7 days retention | Ops |
| Monitoring | A Vercel monitor pings `/api/health` every 5 min and alerts on 503 | Ops |

Only after every box is ticked, flip the public DNS / announce the soft launch.

---

## 6. Day-2 operations

- **Rotating secrets.** Use Vercel "Update Environment Variable" with the
  "Encrypt" option, redeploy, revoke the old value at the provider.
- **Adding a clinician.** Edit `scripts/seed-clinicians.ts`, redeploy, run
  `npm run db:seed-clinicians` against the prod DB from a one-off shell.
- **Ingesting a topic pack.** Drop a manifest into `manifests/`, run
  `tsx scripts/ingest.ts --from-file=manifests/your-pack.json`. Resources
  land as `is_published=false`; promote them through the admin UI.
- **Forgetting a user.** Triggered automatically by the user from
  `/account`; manual override is `DELETE FROM users WHERE id = ...` (cascade
  is configured on every dependent table).
- **Pausing the AI surface.** Unset `LLM_PROVIDER` (or unset whichever of
  `GROQ_API_KEY` / `ANTHROPIC_API_KEY` matches the active provider). Both
  `/api/chat` and `/api/companion/chat` refuse with 501 and a clear message;
  the rest of the site keeps working.
- **Switching LLM provider.** Flip `LLM_PROVIDER` between `groq` and
  `anthropic` in Vercel env vars and redeploy. The chat route auto-detects
  whether the active provider supports tool-calling (Anthropic and Groq's
  Llama 3.x/4.x families do) and routes through the inline-RAG path
  otherwise.
