# Operator Runbook — Daily Content Engine

This is the step-by-step guide for the **operator** (you) to wire up the
Meta + YouTube + Vercel + GitHub plumbing so the autonomous content
engine can actually post.

The code in this repo runs the engine end-to-end **once secrets are
in place**. Until then, every cron step gracefully no-ops with a 503
"not configured".

> **Hard rule:** nothing publishes without (1) clinician approval,
> (2) editor approval, and (3) a human clicking publish OR setting
> `scheduled_at` on the draft. The cron jobs only generate drafts
> and propose catalog edits.

---

## Day 0 — One-time platform setup

### 1. Create the brand accounts (45 minutes)

| Platform        | Account type                            | Notes                                                                                                                     |
| --------------- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Instagram       | **Business** (not Creator)              | Required for the Graph API. Connect to a Facebook Page.                                                                   |
| Facebook Page   | **Page**, category "Health & Wellness"  | Owns the IG Business account.                                                                                             |
| YouTube         | **Brand account**, not your personal    | Set country = India for monetisation later.                                                                               |
| LinkedIn Page   | Organisation (not personal)             | Owner of the page becomes the API actor.                                                                                  |
| Twitter / X     | Standard                                | Free tier supports text-only posts.                                                                                       |
| Buttondown      | Free tier (1,000 subs)                  | Skip if you'd rather not run an email list.                                                                               |
| Vercel Blob     | Storage on the Vercel project           | Free tier ≈ 1 GB; we use ~750 MB/month at the daily cadence.                                                              |

Recommended handle: `intimacysextherapylibrary` everywhere. Bio:
"Evidence-grounded sex therapy. Clinician-reviewed. 18+. India-aware."

### 2. Provision Instagram Graph API

1. Go to <https://developers.facebook.com> → Create App → "Business".
2. Add the **Instagram Graph API** product.
3. App Review → submit for `instagram_basic`, `pages_show_list`,
   `instagram_content_publish` (takes 3–14 days; in dev mode you can
   post to test accounts immediately).
4. From Graph API Explorer, generate a **long-lived page access
   token** for your Facebook Page. This becomes `META_GRAPH_ACCESS_TOKEN`.
5. Find the Instagram Business account ID:
   `GET /{page-id}?fields=instagram_business_account`. Copy the
   `id` value into `INSTAGRAM_BUSINESS_ACCOUNT_ID`.

### 3. Provision YouTube OAuth refresh token

1. Google Cloud Console → Create Project → Enable YouTube Data API v3.
2. OAuth consent screen → Internal (or External + add yourself as a
   test user).
3. Credentials → Create OAuth client ID → "Desktop app".
4. Run [oauth2l](https://github.com/google/oauth2l) once with the
   downloaded `client_secret.json`:

   ```bash
   oauth2l fetch \
     --type refresh \
     --credentials client_secret.json \
     --scope https://www.googleapis.com/auth/youtube.upload
   ```

   Copy:
   - `client_id` → `YOUTUBE_CLIENT_ID`
   - `client_secret` → `YOUTUBE_CLIENT_SECRET`
   - the printed refresh token → `YOUTUBE_REFRESH_TOKEN`
5. Optional: also enable a separate API key (no scopes) for the
   metrics poller → `YOUTUBE_API_KEY`.

### 4. Provision Vercel Blob

1. In your Vercel project → **Storage** → **Create** → **Blob**.
2. Copy `BLOB_READ_WRITE_TOKEN` from the store's tokens tab.

### 5. Provision LinkedIn (cross-poster)

1. <https://www.linkedin.com/developers> → Create App → tie to your
   organisation Page.
2. Request the `w_organization_social` scope.
3. Generate an access token (use the OAuth tools or the LinkedIn
   Developer Portal "test" button).
4. Copy:
   - `urn:li:organization:<id>` → `LINKEDIN_ORG_URN`
   - access token → `LINKEDIN_ACCESS_TOKEN`

### 6. Provision Twitter / X (cross-poster)

1. <https://developer.twitter.com> → free tier → create a Project + App.
2. App settings → User authentication → "OAuth 1.0a, Read + Write".
3. Generate consumer keys + access tokens for the brand account.
4. Copy 4 secrets into `TWITTER_API_KEY`, `TWITTER_API_SECRET`,
   `TWITTER_ACCESS_TOKEN`, `TWITTER_ACCESS_SECRET`.

### 7. Provision Pexels + Pixabay (stock footage)

1. <https://www.pexels.com/api/> → free signup → copy API key →
   `PEXELS_API_KEY`.
2. <https://pixabay.com/api/docs/> → free signup → copy key →
   `PIXABAY_API_KEY`.

### 8. Provision Groq (free LLM)

1. <https://console.groq.com> → free signup → API keys → create.
2. `LLM_PROVIDER=groq`, `GROQ_API_KEY=<key>`,
   `GROQ_MODEL=llama-3.3-70b-versatile`.

---

## Day 0 — Set Vercel env vars

Paste this whole block into the Vercel project's **Environment
Variables** UI (Production scope), replacing each `<...>`:

```bash
# Database
DATABASE_URL=<neon postgres url>

# Auth
AUTH_SECRET=<openssl rand -hex 32>
AUTH_RESEND_KEY=<resend key>
AUTH_RESEND_FROM=Intimacy & Sex Therapy Library <onboarding@resend.dev>
BOOTSTRAP_ADMIN_EMAILS=<your email>

# LLM
LLM_PROVIDER=groq
GROQ_API_KEY=<groq key>
GROQ_MODEL=llama-3.3-70b-versatile

# Cron auth
CRON_SECRET=<openssl rand -hex 32>

# Render & blob
BLOB_READ_WRITE_TOKEN=<from vercel blob>
PEXELS_API_KEY=<from pexels>
PIXABAY_API_KEY=<from pixabay>

# TTS — leave Sarvam / ElevenLabs blank to use Edge TTS (free)
TTS_PROVIDER=edge

# Instagram
INSTAGRAM_BUSINESS_ACCOUNT_ID=<from step 2>
META_GRAPH_ACCESS_TOKEN=<long-lived page token>

# YouTube
YOUTUBE_CLIENT_ID=<from step 3>
YOUTUBE_CLIENT_SECRET=<from step 3>
YOUTUBE_REFRESH_TOKEN=<from step 3>
YOUTUBE_API_KEY=<optional, for metrics poller>

# LinkedIn (optional)
LINKEDIN_ORG_URN=urn:li:organization:<id>
LINKEDIN_ACCESS_TOKEN=<linkedin token>

# Twitter (optional)
TWITTER_API_KEY=<...>
TWITTER_API_SECRET=<...>
TWITTER_ACCESS_TOKEN=<...>
TWITTER_ACCESS_SECRET=<...>

# Email list (optional)
BUTTONDOWN_API_KEY=<...>

# Site
NEXT_PUBLIC_SITE_URL=https://intimacy-and-sex-therapy-library.vercel.app
KMS_PROVIDER=local
KMS_LOCAL_MASTER_KEY=<openssl rand -base64 32>
```

After saving, redeploy the Vercel project so the new env reaches the
running functions.

---

## Day 0 — Set GitHub Actions secrets

The hourly `publish-due` workflow lives in
`.github/workflows/publish-due.yml`. Add these repo secrets in
GitHub → Settings → Secrets and variables → Actions:

- `VERCEL_DEPLOY_URL` — `https://intimacy-and-sex-therapy-library.vercel.app`
- `CRON_SECRET` — the same value you put in Vercel env

Trigger it manually once from the **Actions** tab to verify it can
reach the endpoint.

---

## Day 1 — Smoke test the engine end-to-end

Run these in order. Stop at the first failure.

1. **DB migrate**

   ```bash
   DATABASE_URL='...' npm run db:migrate
   ```

2. **Seed catalog** (only if catalog is empty)

   ```bash
   DATABASE_URL='...' npm run seed
   ```

3. **Force-run the daily-generate cron** (creates 3 drafts):

   ```bash
   curl -X POST "$DEPLOY_URL/api/cron/daily-generate" \
     -H "Authorization: Bearer $CRON_SECRET"
   ```

   You should see a JSON summary with `created: 3`. Visit
   `/admin/queue` — the new drafts appear under "Awaiting clinician".

4. **Approve one as clinician**

   ```bash
   curl -X POST "$DEPLOY_URL/api/admin/drafts/<id>/approve" \
     -H "Content-Type: application/json" \
     -d '{"role":"clinician"}'
   ```

5. **Render the draft** locally (keeps render off the serverless
   container; copy the resulting `public/renders/<id>/video.mp4` to
   blob automatically):

   ```bash
   DATABASE_URL='...' npm run render -- <draftId>
   ```

   The render will:
   - Synthesise voiceover via Microsoft Edge TTS (no key needed).
   - Pull stock clips from Pexels (if PEXELS_API_KEY set).
   - Upload the MP4 to Vercel Blob and store the public HTTPS URL on
     the draft.
   - Generate captions from the script (no STT needed).

6. **Approve as editor**

   ```bash
   curl -X POST "$DEPLOY_URL/api/admin/drafts/<id>/approve" \
     -H "Content-Type: application/json" \
     -d '{"role":"editor"}'
   ```

7. **Publish from the queue** — open `/admin/queue` and click the
   "Publish to IG + YT" button. You'll get a confirmation prompt; tap
   confirm.

   On success the draft moves to `posted` and you'll see it on IG
   and YouTube within ~30 seconds.

8. **Run the sync agents**

   ```bash
   curl -X POST "$DEPLOY_URL/api/cron/daily-content-sync" \
     -H "Authorization: Bearer $CRON_SECRET"
   ```

   Visit `/admin/proposals` — link-health, freshness, and discovery
   should each have produced some proposals.

---

## Daily ops (after Day 1)

| Time (IST)   | What runs                                 | Where                        |
| ------------ | ----------------------------------------- | ---------------------------- |
| 03:00        | `daily-content-sync` cron                 | Vercel cron                  |
| 05:00        | `daily-generate` cron (3 drafts)          | Vercel cron                  |
| Every hour   | `publish-due` workflow                    | GitHub Actions               |
| Mondays 06:00| `post-metrics-poll` cron (weekly metrics) | Vercel cron                  |

Operator's daily ritual (5–10 minutes):

1. Open `/admin/queue`. Approve / reject the day's drafts.
2. Open `/admin/proposals`. Approve / reject the agents' suggestions.
3. (Optional) Schedule the approved drafts for evening posting:

   ```sql
   UPDATE content_drafts
      SET scheduled_at = now() + interval '8 hours'
    WHERE id = '<draft-id>';
   ```

4. The hourly publish-due workflow handles the rest.

---

## Failure modes & fixes

| Symptom                                              | Likely cause                                                | Fix                                                                                          |
| ---------------------------------------------------- | ----------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Publish returns `missing_https_video_url`            | `BLOB_READ_WRITE_TOKEN` missing or render fell back to local | Set blob token in Vercel env, redeploy, re-render the draft.                                 |
| Publish returns `instagram: missing_env`             | IG creds not set or wrong names                             | Verify `INSTAGRAM_BUSINESS_ACCOUNT_ID` and `META_GRAPH_ACCESS_TOKEN` (NOT the older `IG_*`). |
| Publish returns `youtube: auth_failed`               | OAuth refresh token expired or revoked                      | Re-run `oauth2l fetch` to get a new refresh token, redeploy.                                 |
| `daily-generate` returns `skipped: queue_full`       | >12 drafts stuck in `script_draft`                          | Triage `/admin/queue`. Approve, reject, or delete to free the queue.                         |
| Many `transient` errors from link-health             | Network blip                                                | Re-run the cron in 30 minutes; the agent dedupes.                                            |
| LinkedIn / Twitter fail silently in audit            | Cross-posters are best-effort                               | Check creds + scopes. Failures don't flip the draft to `failed`.                             |

---

## Monetisation gating — when to flip the switch

We deliberately don't monetise yet. Open monetisation only AFTER:

- [ ] 1,000 IG followers (eligibility for Reels Play and Branded
      Content).
- [ ] 1,000 YouTube subs + 4,000 Shorts views (YPP threshold).
- [ ] 50 Buttondown subscribers (signal of intent, not noise).
- [ ] 6 months of operator reviewing proposals without falling
      behind.

When all four are true, the suggested order is:

1. Add a single soft donation button (`/donate` → Razorpay or Stripe
   Climate-style "buy me a coffee").
2. Open YouTube monetisation; keep ads off short-form for the first
   3 months to protect the audience-trust premium.
3. Launch a paid clinician-directory listing (₹2,000/month, free for
   AASECT/RCI accredited).

Do **not** monetise the AI surfaces (Sahay, Companion). Those are
the trust anchors and must stay free + ad-free.
