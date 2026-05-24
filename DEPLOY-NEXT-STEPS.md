# Next steps to get this live

Everything in this repo is ready to deploy. Three short steps remain that
require your hands on a browser (no shell automation can do these without
your credentials).

The whole sequence takes about 10 minutes once you have the API keys.

---

## Step 1 — Push to GitHub (3 minutes)

The repo is already initialised, all 230 files committed cleanly, no
secrets staged. You just need a remote.

### 1a. Create a private GitHub repo

Go to <https://github.com/new>:

- **Repository name**: `intimacy-and-sex-therapy-library`
- **Visibility**: Private (recommended for v1; you can flip to public
  later once you've eyeballed the code one more time)
- **Do NOT** tick "Add a README", "Add .gitignore", or "Add a license"
  — the local repo already has these and an empty remote prevents merge
  conflicts on the first push.
- Click **Create repository**.

### 1b. Wire the remote and push

Copy the new repo's HTTPS URL from the GitHub page (looks like
`https://github.com/<you>/intimacy-and-sex-therapy-library.git`) then run:

```sh
cd "/Users/aritra.de/Desktop/Cursor Work/sex-therapy-repo"
git remote add origin https://github.com/<you>/intimacy-and-sex-therapy-library.git
git push -u origin main
```

When git prompts for a password, paste a Personal Access Token (NOT your
GitHub password — that path was deprecated in 2021). Generate one at
<https://github.com/settings/tokens?type=beta> with **Contents: Read and
write** scope on this single repository. Save the token to your password
manager so you don't have to regenerate it next time.

If you'd rather not use a token, install the GitHub CLI and use it for
everything from now on:

```sh
brew install gh
gh auth login          # follow the prompts, pick HTTPS + login via browser
gh repo create intimacy-and-sex-therapy-library --private --source=. --push
```

After the push, open the repo on GitHub and click **Actions**. The
workflows in `.github/workflows/` will run automatically — typecheck,
unit tests, integration tests (skipped without `INTEGRATION_DATABASE_URL`),
build, Lighthouse, and the post-metrics cron. The first run takes ~3
minutes.

---

## Step 2 — Deploy on Vercel (5 minutes)

### 2a. Get your API keys ready

Open these tabs and grab the values you'll paste into Vercel:

| Variable | Where to get it | Notes |
|---|---|---|
| `DATABASE_URL` | Neon dashboard → your project → Connection Details | Use the **pooled** URL ending in `-pooler.…` |
| `GROQ_API_KEY` | <https://console.groq.com/keys> → "Create API Key" | Free tier; no credit card required |
| `OPENAI_API_KEY` | <https://platform.openai.com/api-keys> | Used only for embeddings + Whisper STT, not chat |
| `AUTH_SECRET` | Run `openssl rand -base64 32` in your terminal | Any 32+ random bytes |
| `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` | <https://console.cloud.google.com/apis/credentials> | Optional; skip if you only want magic-link sign-in |
| `AUTH_RESEND_KEY` | <https://resend.com/api-keys> | For magic-link email |
| `CRON_SECRET` | Run `openssl rand -hex 24` | Any random string; pasted into the cron URL |
| `BOOTSTRAP_ADMIN_EMAILS` | Your own email | Comma-separated; auto-promotes you to admin on first sign-in |

### 2b. Import into Vercel

1. Go to <https://vercel.com/new>.
2. **Import Git Repository** → select
   `intimacy-and-sex-therapy-library`. Vercel auto-detects Next.js.
3. **Environment Variables**: paste each variable from step 2a.
   Critical ones for first boot:

   ```
   DATABASE_URL=<your Neon pooled URL>
   AUTH_SECRET=<openssl output>
   LLM_PROVIDER=groq
   GROQ_API_KEY=<from console.groq.com>
   GROQ_MODEL=llama-3.3-70b-versatile
   OPENAI_API_KEY=<from platform.openai.com>
   AUTH_RESEND_KEY=<from resend.com>
   AUTH_RESEND_FROM=Intimacy & Sex Therapy Library <onboarding@resend.dev>
   BOOTSTRAP_ADMIN_EMAILS=aritrajob79@gmail.com
   ADMIN_BASIC_AUTH_ENABLED=false
   CRON_SECRET=<openssl output>
   NEXT_PUBLIC_SITE_URL=https://your-project.vercel.app
   KMS_PROVIDER=local
   KMS_LOCAL_MASTER_KEY=<openssl rand -base64 32>
   ```

4. Click **Deploy**. First build takes ~2 minutes.

### 2c. Pick a clean subdomain

Once deployed, Vercel gives you something like
`intimacy-and-sex-therapy-library-<hash>.vercel.app`. To rename:

- Project → **Settings** → **Domains** → **Add**.
- Type something short, e.g. `the-intimacy-library.vercel.app`.
- Vercel auto-issues SSL.

---

## Step 3 — Smoke test (2 minutes)

Replace `$DOMAIN` with your live Vercel URL and run:

```sh
DOMAIN="the-intimacy-library.vercel.app"
# 1. Liveness + readiness
curl -fsS https://$DOMAIN/api/health   | jq .
curl -fsS https://$DOMAIN/api/ready    | jq .

# 2. Confirm Groq is the active LLM
curl -fsS https://$DOMAIN/api/chat | jq '{provider, mode}'
# expected: {"provider":"Groq · llama-3.3-70b-versatile","mode":"tools"}

# 3. Public surfaces
curl -fsSI https://$DOMAIN/                     # 200
curl -fsSI https://$DOMAIN/catalog              # 200
curl -fsSI https://$DOMAIN/library              # 200
curl -fsSI https://$DOMAIN/manifest.webmanifest # 200
```

Then in a browser:

1. Open `https://$DOMAIN/`. Confirm:
   - The age-gate appears.
   - After confirming, the "Picked for you" intake quiz renders (try
     it; the chips should appear after the third question).
   - The language toggle in the navbar (EN / हि / Hin) changes the
     home tagline when picked.
2. Sign in via Google or magic-link with `aritrajob79@gmail.com`. After
   first sign-in, hit `/admin` — you should be auto-promoted to admin
   thanks to `BOOTSTRAP_ADMIN_EMAILS`.
3. Open `/companion`, send Sahay one message. Confirm a streamed reply.
   Toggle the language to Hinglish in the navbar and reload — Sahay's
   default language should now be Hinglish.

---

## Step 4 (optional) — Custom domain

If you want a real domain instead of `*.vercel.app`:

- Best for India-first positioning: `.in` for ~₹500/yr at GoDaddy or
  BigRock. Try `intimacylibrary.in` or `theintimacylibrary.in`.
- Or `.com` for ~$10/yr at Porkbun or Namecheap.
- After purchase, Vercel → Domains → Add → follow the DNS instructions.
  SSL is automatic.

---

## Day-2 operations cheat sheet

| Task | How |
|---|---|
| Push a code change | `git add -A && git commit -m '…' && git push` — Vercel auto-deploys in ~2 minutes |
| Open a PR for review | Push a branch; Vercel creates a preview URL; merge to main when green |
| Update an env var | Vercel project → Settings → Environment Variables → Edit → Redeploy |
| Switch LLM provider | Set `LLM_PROVIDER=anthropic` + `ANTHROPIC_API_KEY`, redeploy |
| Pause AI surface | Unset `LLM_PROVIDER` (or `GROQ_API_KEY`), redeploy. The site keeps working; chat/companion show a clear refusal banner |
| See the post-metrics cron | Vercel project → Cron tab; logs at `/api/cron/post-metrics-poll` |
| Bootstrap a new admin | Add their email to `BOOTSTRAP_ADMIN_EMAILS`, redeploy, ask them to sign in |
| Forget a user | They self-serve via `/account`; manual override is `DELETE FROM users WHERE id = …` |

---

That's it. Once you've finished step 2b, the app is live and reachable
from anywhere — your laptop can be off and Sahay still talks to users.
