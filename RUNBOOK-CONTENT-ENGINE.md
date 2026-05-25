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

The path below uses the in-browser **OAuth 2.0 Playground** to mint
the refresh token. No CLI install needed; takes ~12 minutes end-to-end.

**Prerequisite**: 2-Step Verification must be enabled on the Google
account (Google enforces this on all Cloud projects as of
Sept 12, 2025). Use a passkey or authenticator app, NOT SMS — see
"YouTube account hardening" below.

1. **Brand channel.** Create a YouTube Brand Channel (not your personal
   channel) at <https://www.youtube.com/account_advanced>. Country = India.
   Note the channel ID (`UC…`) — save it in your password manager as a
   sanity-check value (you'll confirm OAuth grants this ID in step 6).
2. **Google Cloud project.** <https://console.cloud.google.com/projectcreate>
   → name it `intimacy-library` → switch into it.
3. **Enable YouTube Data API v3.** Open
   <https://console.cloud.google.com/apis/library/youtube.googleapis.com>
   in the same project → **Enable**.
4. **OAuth consent screen.** Open
   <https://console.cloud.google.com/apis/credentials/consent>:
   - User type: **External**
   - App name: `Intimacy & Sex Therapy Library`
   - Scopes: add `youtube.upload` + `youtube.readonly` (both sensitive)
   - Test users: add the gmail that owns the brand channel
   - Publishing status: **leave as Testing** (do NOT publish)
5. **OAuth client ID.** <https://console.cloud.google.com/apis/credentials>
   → Create Credentials → OAuth client ID:
   - Application type: **Web application** (NOT Desktop)
   - Name: `oauth-playground-bootstrap`
   - Authorized redirect URI: `https://developers.google.com/oauthplayground`
   - Copy the `Client ID` and `Client secret` from the modal.
6. **Mint the refresh token** at <https://developers.google.com/oauthplayground>:
   - Gear icon (top-right) → tick **Use your own OAuth credentials** →
     paste the Client ID + Secret. Also tick **Force prompt: consent**
     (this is what guarantees a `refresh_token` is returned).
   - Left panel → **YouTube Data API v3** → tick both scopes →
     **Authorize APIs**.
   - On Google's consent screen: **Advanced → Go to … (unsafe)** past
     the "unverified app" warning. When asked which channel to grant
     to, pick the **Brand Channel**, not personal.
   - Back in the Playground → **Exchange authorization code for tokens**.
   - Copy the `refresh_token` (starts with `1//0g…`) → `YOUTUBE_REFRESH_TOKEN`.
     The `access_token` is short-lived and not stored anywhere.
7. **(Optional) API key for metrics poller.** Same Credentials page →
   Create Credentials → API key → restrict to "YouTube Data API v3"
   only → `YOUTUBE_API_KEY`. The metrics cron can also use the OAuth
   token for reads, so this is skippable.

> **Refresh-token lifetime trade-off.** Testing-mode refresh tokens
> for sensitive scopes (`youtube.upload`) expire after **7 days**.
> This is a Google policy, not a bug. The fix is either:
>   1. Run the **Sunday refresh ritual** (see "Weekly ops" below) —
>      90 seconds, no code changes.
>   2. Push the OAuth app to "In production" via Google's verification
>      flow (1–4 week review). Requires privacy policy + ToS pages on a
>      verified domain plus an app demo video.

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
# Edge defaults to en-US-AvaNeural for English (the narrator persona).
TTS_PROVIDER=edge

# Avatar narrator (Replicate.com) — optional but recommended.
# Signup: replicate.com -> "Sign in with GitHub" -> /account/api-tokens
# Free tier: ~$5 credit = ~50 short renders before any billing.
# When unset, the render pipeline silently falls back to the existing
# stock-footage composition so videos still ship.
REPLICATE_API_TOKEN=<r8_... from replicate.com/account/api-tokens>
REPLICATE_MAX_USD_PER_DAY=2.00

# Instagram
INSTAGRAM_BUSINESS_ACCOUNT_ID=<from step 2>
META_GRAPH_ACCESS_TOKEN=<long-lived page token>

# YouTube
YOUTUBE_CLIENT_ID=<from step 3>
YOUTUBE_CLIENT_SECRET=<from step 3>
YOUTUBE_REFRESH_TOKEN=<from step 3 — refreshed weekly while in Testing mode>
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

## Weekly ops — Sunday YouTube refresh ritual (90 seconds)

While the OAuth app is in **Testing** mode, Google revokes refresh
tokens for sensitive scopes (`youtube.upload`) every 7 days. The cron
will start returning `youtube: auth_failed` until you mint a fresh
token. Do this every Sunday morning until you've completed Google
verification:

1. Open <https://developers.google.com/oauthplayground>.
2. Gear icon → confirm **Use your own OAuth credentials** is still
   ticked and the Client ID / Secret are present (the Playground
   remembers them in your browser's localStorage). Confirm **Force
   prompt: consent** is also ticked.
3. Left panel → **YouTube Data API v3** → both scopes ticked →
   **Authorize APIs**.
4. Pick the brand-channel Gmail → past the "unverified" warning →
   pick the **Brand Channel** → Continue → Continue.
5. **Exchange authorization code for tokens** → copy the new
   `refresh_token`.
6. Vercel → Project → Settings → Environment Variables →
   `YOUTUBE_REFRESH_TOKEN` → **Edit** → paste new value → **Save**.
7. **Redeploy** (Deployments tab → latest deployment → ⋮ → Redeploy)
   so the new env var reaches the running cron functions. Quick check:

   ```bash
   curl -X POST "$DEPLOY_URL/api/cron/publish-due" \
     -H "Authorization: Bearer $CRON_SECRET" | jq '.youtube'
   # expected: no "auth_failed" anywhere
   ```

When this becomes a chore you don't want to keep doing, file a 1-hour
block to push the OAuth app to "In production" (privacy policy URL,
ToS URL, app demo video, scope justification — see Google's
[verification docs](https://support.google.com/cloud/answer/9110914)).

---

## YouTube account hardening (do this before going live)

The Google account behind the YouTube channel is now a single point
of failure for the whole stack — it owns the channel, holds the OAuth
client, and is the recovery email for several other services. Lose it
and you lose IG recovery, the cron's auth, and the brand channel.
Protections (do all four, once):

- **2-Step Verification on**, with **passkey + authenticator app**
  enrolled. SMS only as last-resort fallback (SIM-swap risk).
- **Backup codes** downloaded and stored in your password manager
  under the `Intimacy Library — Google Account` entry.
- **Recovery email + recovery phone** set to values you control and
  that aren't easy to guess from public info.
- **Test the recovery**: sign out, then sign in using a backup code,
  once, so you know the flow works. Then re-enable normal 2SV. Most
  people never test their backup codes until the day they need them
  and discover they don't work.

---

## Narrator persona — what the AI face on your videos actually is

The content engine ships every video through the **AvatarReel**
composition by default. That composition shows a single static persona
("a trusted late-night radio host who happens to be beautiful") with
her mouth animated to the synthesised voiceover, kinetic typography in
the upper third, and stock B-roll cutaways during specific scenes.

**Locked artefacts (do not change without a rebrand discussion):**

- `public/brand/narrator.png` — the static portrait. 768×768 PNG.
- `public/brand/narrator.prompt.txt` — exact generation prompt + seed,
  so the look can be reproduced on demand.
- `lib/brand/persona.ts` — every voice/tone/look default in one file.
  If you need to A/B the voice or experiment with a different ElevenLabs
  voice id, override via env (`ELEVENLABS_VOICE_ID_NARRATOR`,
  `EDGE_TTS_VOICE_EN_NARRATOR`) rather than editing the module.

**Voice direction (what scripts should be written for):**

- Unhurried pace, ~150 wpm.
- Bold and confident; states things plainly, never hedges.
- Warm tone but clinical content. **Not** seductive (that's a brand +
  platform-safety decision — see the Meta/YouTube moderation notes).
- Uses "you" generously, "we" occasionally, "I" rarely.

**Cost guardrail:** `REPLICATE_MAX_USD_PER_DAY` (default $2.00) caps the
talking-head spend per UTC day across all renders. When the projected
spend for the next call would exceed the cap, the pipeline logs a
refusal and falls back to the existing stock-footage composition so a
video is still produced. Today's running total lives in
`.replicate-usage.json` at the repo root (gitignored).

**Re-renders:** to re-render an existing draft with the new pipeline:

```bash
npm run render -- <draftId>              # default: --style avatar
npm run render -- <draftId> --style stock # force the old typography+stock look
```

The script preserves `editor_reviewed` / `scheduled` / `published`
statuses, so re-rendering doesn't silently undo your approvals.

---

## Failure modes & fixes

| Symptom                                              | Likely cause                                                | Fix                                                                                          |
| ---------------------------------------------------- | ----------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Publish returns `missing_https_video_url`            | `BLOB_READ_WRITE_TOKEN` missing or render fell back to local | Set blob token in Vercel env, redeploy, re-render the draft.                                 |
| Publish returns `instagram: missing_env`             | IG creds not set or wrong names                             | Verify `INSTAGRAM_BUSINESS_ACCOUNT_ID` and `META_GRAPH_ACCESS_TOKEN` (NOT the older `IG_*`). |
| Publish returns `youtube: auth_failed`               | Refresh token expired (Testing-mode 7-day window)           | Run the **Sunday refresh ritual** above. Most common cause when posting was working yesterday. |
| Publish returns `youtube: auth_failed` (consistently) | OAuth client deleted, secret rotated, or scopes changed     | Re-do Hop 5 (new client + redirect URI) and Hop 6 of YouTube setup, redeploy.                  |
| `daily-generate` returns `skipped: queue_full`       | >12 drafts stuck in `script_draft`                          | Triage `/admin/queue`. Approve, reject, or delete to free the queue.                         |
| Many `transient` errors from link-health             | Network blip                                                | Re-run the cron in 30 minutes; the agent dedupes.                                            |
| LinkedIn / Twitter fail silently in audit            | Cross-posters are best-effort                               | Check creds + scopes. Failures don't flip the draft to `failed`.                             |
| Render log shows `avatar refused (cap_exceeded)`     | Today's projected Replicate spend > `REPLICATE_MAX_USD_PER_DAY` | Either raise the cap in `.env`/Vercel, wait until UTC midnight, or accept the stock fallback. |
| Render log shows `avatar refused (missing_token)`    | `REPLICATE_API_TOKEN` not set                               | Add it from replicate.com/account/api-tokens; pipeline falls back to stock automatically.    |
| Render log shows `avatar refused (prediction_failed)` | Replicate model errored (rare — usually audio length cap)  | Check the embedded `logs=` tail in the log line. For SadTalker, scripts >90s sometimes fail; trim. |

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
