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
| Amazon SES      | AWS account, SES in one region          | Owns the newsletter delivery. Verify a From mailbox + request production access — see "Amazon SES (newsletter)" below. Replaces Buttondown. |
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
> for sensitive scopes (`youtube.upload`, `youtube`) expire after
> **7 days**. This is a Google policy, not a bug. The fix is either:
>   1. Run the **Sunday refresh ritual** (see "Weekly ops" below) —
>      90 seconds, no code changes.
>   2. Push the OAuth app to "In Production" via Google's verification
>      flow — see the dedicated **"Permanent fix — Push the YouTube
>      OAuth app to In Production"** section below for the full
>      checklist (privacy policy / ToS / demo video / scope
>      justifications / 1–4 week Google review).
>
> **Scope choice.** For posting only, the narrow `youtube.upload`
> scope is sufficient. To programmatically change a video's privacy,
> description, or monetization flags AFTER upload, you need the
> broader `youtube` scope. Verification is required either way for
> permanent tokens; pick the broader scope when you re-mint to avoid
> a second round-trip.

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

### 9. Provision Amazon SES (newsletter)

The owned newsletter list lives in our Neon DB (`email_subscribers`, double
opt-in) and is delivered via Amazon SES. This replaces Buttondown. Powers
`POST /api/email/subscribe` (confirmation email) and the weekly `send-digest`
cron.

1. **Pick a region** with SES (e.g. `us-east-1`) and set `AWS_REGION`.
2. **Verify a From identity.** Without a custom sending domain, verify a
   single mailbox: SES console → *Verified identities* → *Create identity* →
   *Email address* → enter your From address → click the link in the
   verification email. Set `SES_FROM` to a friendly form, e.g.
   `Intimacy & Sex Library <youraddress@gmail.com>` (the address part must be
   the verified identity).
3. **Request production access.** New SES accounts are sandboxed (can only
   send to verified addresses, 200/day). SES console → *Account dashboard* →
   *Request production access*. Describe it honestly: a **double opt-in,
   18+ educational** newsletter; confirm you honour one-click unsubscribe and
   handle bounces/complaints. Approval is usually < 24h.
4. **Create an IAM user** with a minimal policy allowing `ses:SendEmail`
   (and `ses:SendRawEmail`). Generate an access key →
   `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY`.
5. Until production access lands, signups to *unverified* addresses will fail
   the SES send (the route returns 502 and the pending row stays unconfirmed).
   The app itself degrades gracefully when `SES_FROM` / AWS creds are unset
   (signup shows "not available", 503).

**Deliverability note:** with no custom domain there's no DKIM/SPF/DMARC
alignment, so mail may land in spam. Mitigations already baked in: double
opt-in, a one-click `List-Unsubscribe` header, a recognizable From name, and
low volume. A cheap custom domain (then verify the *domain* identity in SES
and enable DKIM) is the durable fix.

### 10. Provision Find Help search (optional, recommended)

The **Find help** hub (`/clinicians` + `/communities`) layers an inclusive,
AI-ranked search of *public* listings on top of the verified clinician
directory. It uses official APIs only — never SERP scraping — and caches
results in `help_search_cache` (21d for clinicians, 7d for communities). Every
aggregated result carries a "not verified by us" disclaimer and a **Report**
button that feeds `/admin/help-flags`.

All keys are **optional**: with none set, the hub shows only the verified
directory and the aggregated sections render a friendly "not configured" note
(no errors).

1. **Google Places** (clinicians + local groups + locality autocomplete):
   Google Cloud Console → enable **Places API** → create an API key restricted
   to the Places API and your domains. Set `GOOGLE_MAPS_API_KEY`. Cost control:
   we cache aggressively and only fetch Place Details for the top ~8 results.
2. **Web search** (online communities — subreddits, FB groups, Discord,
   Meetup): provide ONE of `BRAVE_API_KEY` (preferred,
   <https://brave.com/search/api/>) or `TAVILY_API_KEY`
   (<https://tavily.com/>).
3. **LLM ranking** reuses the existing provider (`GROQ_API_KEY` etc.). With no
   LLM configured, results fall back to a deterministic rating-based ordering.

Inclusivity is enforced in code: the ranking prompt must surface affirming
results across every orientation, gender identity, relationship structure, and
disability, and must never exclude or down-rank on those grounds.

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

# Avatar narrator — talking-head lip sync of the persona portrait.
# Default provider is "github-actions" (free, no credit card).
# See the "Narrator persona" section below for how to set up the
# GH PAT and what the workflow does. When provider creds are missing
# or the workflow fails, the render pipeline silently falls back to
# the still-portrait Ken-Burns composition so videos still ship.
AVATAR_PROVIDER=github-actions
GH_AVATAR_TOKEN=<fine-grained PAT — Actions: read/write on this repo>
GH_AVATAR_REPO=productdecoded/intimacy-and-sex-therapy-library

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

# Newsletter — owned list (Neon) + Amazon SES (see "Provision Amazon SES")
# SES_FROM must be a verified SES identity; request production access first.
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=<iam access key id>
AWS_SECRET_ACCESS_KEY=<iam secret>
SES_FROM=Intimacy & Sex Library <youraddress@gmail.com>

# Find Help hub (all optional — see "Provision Find Help search").
# Without these, only the verified clinician directory shows.
GOOGLE_MAPS_API_KEY=<places api key>
BRAVE_API_KEY=<brave search key>   # or TAVILY_API_KEY

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

The weekly `send-digest` workflow (`.github/workflows/send-digest.yml`) needs
its own secrets — add these too:

- `DATABASE_URL` — same Neon URL as Vercel
- `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `SES_FROM` — the
  SES values from "Provision Amazon SES"
- `NEXT_PUBLIC_SITE_URL` — public base URL used to build resource/unsubscribe
  links in the email (optional; falls back to the brand URL)

Run `send-digest` once from the **Actions** tab with **dry_run = true** to
confirm it builds a digest and counts recipients before sending for real.

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

| Time (IST)          | What runs                                 | Where                        |
| ------------------- | ----------------------------------------- | ---------------------------- |
| 03:00               | `daily-content-sync` cron                 | Vercel cron                  |
| 05:00               | `daily-generate` cron (3 drafts)          | Vercel cron                  |
| Every hour at :23   | `render-due` workflow (renders unrendered drafts) | GitHub Actions       |
| Every hour at :07   | `publish-due` workflow                    | GitHub Actions               |
| Mondays 06:00       | `post-metrics-poll` cron (weekly metrics) | Vercel cron                  |

Operator's daily ritual (5–10 minutes, from ANY browser including phone):

1. Open `/admin/queue`. Each draft already has a rendered video preview
   (the hourly `render-due` workflow takes care of this within ~60 min
   of `daily-generate` firing — no CLI needed). Approve / reject the
   day's drafts.
2. Open `/admin/proposals`. Approve / reject the agents' suggestions.
3. (Optional) Schedule the approved drafts for evening posting:

   ```sql
   UPDATE content_drafts
      SET scheduled_at = now() + interval '8 hours'
    WHERE id = '<draft-id>';
   ```

   (Use Neon's web SQL editor at <https://console.neon.tech> or any
   browser-based DB client — no local psql required.)

4. The hourly publish-due workflow handles the rest.

### Manual render via the "Render" button (any browser)

If a draft has no video yet (you opened the queue right after
`daily-generate` fired and before `render-due` ran), or you want to
re-render after editing the script or persona, click the **Render** /
**Re-render** pill on the draft card. This dispatches the same
`render-due` GH Actions workflow with that specific `draft_id`. Watch
progress at the URL in the success toast (typical render: 2-3 min).

Requires `GH_RENDER_TOKEN` env var on Vercel — a fine-grained PAT with
`Actions: read/write` + `Contents: read` on this repo. If unset, the
button returns 503 with a clear message.

### Manual render via CLI (legacy, still works)

```bash
DATABASE_URL='...' BLOB_READ_WRITE_TOKEN='...' \
  PEXELS_API_KEY='...' PIXABAY_API_KEY='...' \
  npm run render -- <draftId> [--style photo|stock|typography|avatar|long_form_essay]
```

This flows through the same `lib/social/render-and-persist.ts`
helper the GH cron and admin button use, so behaviour is identical.

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

When this becomes a chore you don't want to keep doing, file the
block to push the OAuth app to "In Production" using the next
section.

---

## Permanent fix — Push the YouTube OAuth app to "In Production"

Once approved, refresh tokens last **indefinitely** (until manually
revoked) instead of 7 days, and you gain access to the broader
`youtube` scope which unlocks programmatic privacy edits,
description updates, monetization toggle (once the channel is in
YPP), comment management, and video deletion. Total elapsed time:
**3 hours of your work + 1–4 weeks of Google's review queue.**

### What Google requires (gather these first; ~2 hours)

1. **A privacy policy page** at a verified domain. Must explicitly
   mention:
   - what YouTube data you access (videos you upload + your own
     channel metadata)
   - that data is processed via Google's YouTube API Services
   - the YouTube API Services Terms of Service link
     (<https://developers.google.com/youtube/terms/api-services-terms-of-service>)
   - the Google Privacy Policy link
     (<https://policies.google.com/privacy>)
   - how a user revokes access (link to
     <https://security.google.com/settings/security/permissions>)

   Add it at `/legal/privacy` on the same domain you've verified
   in Search Console. Vercel deploys count.

2. **A terms-of-service page** at the same domain (`/legal/terms`).
   No YouTube-specific clauses required; just standard ToS.

3. **A "homepage"** at the same domain — must be the SAME domain
   listed as the authorized JavaScript origin in the OAuth client.
   For us that's `intimacy-and-sex-therapy-library.vercel.app` once
   we point a custom domain at it; Vercel preview URLs aren't
   accepted by the reviewers because the subdomain rotates.

4. **An app demo video** (3–5 minutes) showing:
   - the OAuth consent screen ("This app would like to manage your
     YouTube videos")
   - what the app does with the access (post a video, show the
     resulting public reel)
   - how a user can revoke access in their Google account
   Upload it as **Unlisted** to the brand channel itself (meta) and
   paste the link into the verification form.

5. **Per-scope justification text** (2–3 sentences each) for every
   sensitive/restricted scope:
   - `youtube.upload` — "Used to upload short-form video content
     (Reels/Shorts) produced by the platform on behalf of the
     authenticated channel owner."
   - `youtube` — "Used to update video metadata (privacy status,
     description) and to manage monetization flags on videos
     previously uploaded by this app."
   - `youtube.readonly` — "Used to read engagement metrics on
     uploaded videos for the platform's analytics dashboard."

6. **Brand verification** (only needed if you check 'I want to
   display a brand name'). Requires owning the domain in Google
   Search Console + uploading the brand logo at 256×256.

### Submission steps in Google Cloud Console (~30 minutes)

1. **Add the broader scope to the consent screen** first. Open
   <https://console.cloud.google.com/apis/credentials/consent>
   in the `intimacy-library` project →
   **Edit App** → **Scopes** step → **Add or Remove Scopes** →
   search for `youtube` and tick:
   - `https://www.googleapis.com/auth/youtube` (the broad one)
   - keep `youtube.upload` and `youtube.readonly` already there.
   Save and continue. The app is still in Testing — this just
   declares what you'll be asking for at verification time.

2. **Privacy policy / homepage / terms URLs.** Same consent-screen
   editor → **App Information** step → fill in:
   - Application home page: `https://intimacy-and-sex-therapy-library.vercel.app`
   - Application privacy policy: `https://intimacy-and-sex-therapy-library.vercel.app/legal/privacy`
   - Application terms of service: `https://intimacy-and-sex-therapy-library.vercel.app/legal/terms`
   - Authorized domains: `vercel.app` (Google auto-derives from
     the URLs above — confirm both are listed)

3. **Push to production.** Consent screen page → bottom →
   **Publishing status: Testing** → **PUBLISH APP** button →
   confirm dialog. Status flips to **In Production — verification
   required**.

4. **Submit for verification.** Consent screen → **Verification
   Center** (left sidebar) → **Prepare for Verification** →
   answer the questionnaire:
   - "Are you using sensitive/restricted scopes?" → **Yes**
   - Per scope, paste the justifications from step 5 above
   - Upload the demo video URL
   - Submit.

5. **Wait for Google.** You'll get an email within 4 business days
   confirming review has started. Most sex-health / education
   apps take **2–3 weeks** because reviewers route them to a
   safety-team queue. Some get extra back-and-forth ("can you
   clarify how content is moderated?"). Reply same-day to keep the
   ticket moving.

6. **Once approved**, the existing refresh token does NOT
   auto-upgrade. Mint a new one via the OAuth Playground using the
   broader `youtube` scope (Step 3.6 of Day 0, but with the
   broader scope ticked). Push it to Vercel as `YOUTUBE_REFRESH_TOKEN`,
   redeploy. From then on the token is permanent.

### What you get post-verification

- 🟢 Permanent refresh tokens — no more weekly ritual
- 🟢 `npx tsx scripts/_oneoff/yt-make-public.ts <videoId>…` works
  for retroactive privacy flips on already-uploaded videos
- 🟢 `npx tsx scripts/_oneoff/backfill-library-footer.ts <draftId>…`
  (without `--skip-yt`) works for description backfills
- 🟢 Once the channel is in YPP, `monetizationDetails.access.allowed`
  can be flipped programmatically per video
- 🟢 The "unverified app" warning disappears from the consent
  screen, which is nice if you ever onboard a collaborator

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

**How the lip sync actually gets generated:** the engine supports two
providers via `AVATAR_PROVIDER`:

| Provider          | Cost                 | Latency       | Card needed | Notes                                                                                          |
| ----------------- | -------------------- | ------------- | ----------- | ---------------------------------------------------------------------------------------------- |
| `github-actions`  | **free** (GH quota)  | ~5–10 min     | No          | Default. Runs `.github/workflows/avatar-render.yml` on a free Linux runner, installs SadTalker, uploads the MP4 as a workflow artifact, the Node process re-hosts on Vercel Blob. |
| `replicate`       | ~$0.002 per 30s reel | ~30 s         | Yes         | Faster but Replicate requires a payment method on file even for the free $5 credit. Optional escape hatch when you outgrow GH's quota. |

**One-time setup for `github-actions` (the default):**

1. Generate a fine-grained Personal Access Token at
   <https://github.com/settings/personal-access-tokens/new>:
   - Repository access: **Only select repositories** → this repo
   - Repository permissions: **Actions: Read and write** (Metadata
     auto-included)
   - Expiration: 90 days (rotate quarterly)
2. Add to local `.env`: `GH_AVATAR_TOKEN=<ghp_…>`
3. Add to Vercel:
   ```bash
   printf '<ghp_…>' | vercel env add GH_AVATAR_TOKEN production --sensitive --yes
   printf '<ghp_…>' | vercel env add GH_AVATAR_TOKEN preview --sensitive --yes
   ```
4. First run will take ~15 min (cold dep install + checkpoint
   download). Subsequent runs ~7 min — pip wheels and the ~3 GB of
   SadTalker checkpoints are cached between runs via
   `actions/cache@v4`.

**Quota math:** 5 reels/day × 30 days × ~7 min ≈ 1,050 minutes/month.
GitHub's free tier gives 2,000 min/month, so you have ~50% headroom.
At >8 reels/day you'll start hitting the quota — either upgrade to GH
Pro ($4/mo for 3,000 min) or switch `AVATAR_PROVIDER=replicate`.

**Cost guardrail (Replicate path only):** `REPLICATE_MAX_USD_PER_DAY`
(default $2.00) caps the talking-head spend per UTC day across all
renders. When the projected spend for the next call would exceed the
cap, the pipeline logs a refusal and falls back to the still-portrait
composition so a video is still produced. Today's running total lives
in `.replicate-usage.json` at the repo root (gitignored). The
`github-actions` path is free so the cap doesn't apply.

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
| Render log shows `avatar refused (missing_token)`    | `GH_AVATAR_TOKEN` (or `REPLICATE_API_TOKEN`) not set         | Add the PAT to `.env` + Vercel as documented in the Narrator section. Pipeline falls back to still-portrait. |
| Render log shows `avatar refused (missing_github_repo)` | `GH_AVATAR_REPO` not set or wrong format                  | Set to `<owner>/<repo>` — usually `productdecoded/intimacy-and-sex-therapy-library`.            |
| Render log shows `avatar refused (polling_timeout)`  | GH Actions run took >25 min (cold checkpoint download + slow runner) | Open the run URL printed in the log. Re-trigger if it eventually succeeded; bump `AVATAR_RENDER_MAX_WAIT_SECONDS` if cold runs consistently exceed 25 min. |
| Render log shows `avatar refused (prediction_failed)` | Workflow run finished with conclusion=failure (or Replicate model errored) | Open the run URL in the error; check the "Run SadTalker inference" step logs. Common: GH cache miss + slow torch install. Re-trigger. |
| Render log shows `avatar refused (artifact_not_found)` | Workflow succeeded but didn't upload the `avatar-<id>` artifact | Inspect the run's "Upload avatar artifact" step. The MP4 may have rendered but failed `if-no-files-found: error` because SadTalker produced zero output. |

---

## Monetisation gating — when to flip the switch

We deliberately don't monetise yet. Open monetisation only AFTER:

- [ ] 1,000 IG followers (eligibility for Reels Play and Branded
      Content).
- [ ] 1,000 YouTube subs + 4,000 Shorts views (YPP threshold).
- [ ] 50 confirmed newsletter subscribers (signal of intent, not noise).
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
