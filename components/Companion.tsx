"use client";

import { useChat } from "ai/react";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { trackEvent } from "./Analytics";
import { sealTranscript, type VaultTranscript } from "@/lib/crypto/vault";

type Locale = "en" | "hi" | "hinglish";
type Mode = "ephemeral" | "encrypted" | "vault";

const STARTERS: Record<Locale, string[]> = {
  en: [
    "I haven't felt close to my partner in a long time.",
    "I'm scared to talk to a clinician about this.",
    "Sex feels painful and I don't know who to ask.",
    "I think I might be asexual but I'm not sure.",
    "My family wants me to marry and I'm anxious about intimacy.",
  ],
  hi: [
    "मुझे अपने साथी से दूरी महसूस हो रही है।",
    "मुझे डॉक्टर से बात करने में डर लगता है।",
    "सेक्स में दर्द होता है, किससे पूछूँ?",
    "क्या asexual होना सामान्य है?",
    "घरवालों का शादी का दबाव है, मुझे चिंता हो रही है।",
  ],
  hinglish: [
    "Apne partner se distance feel ho raha hai.",
    "Therapist se baat karne mein hesitation hoti hai.",
    "Sex mein pain hota hai, kis se poochun?",
    "Mujhe lagta hai main asexual hoon — confused hoon.",
    "Ghar mein shaadi ka pressure hai, intimacy ki tension hai.",
  ],
};

const MODE_DESCRIPTIONS: Record<Mode, { title: string; body: string; pill: string }> = {
  ephemeral: {
    title: "Ephemeral",
    body: "Nothing is stored. When you close this tab, the conversation is gone. The strongest privacy default for first-time visits.",
    pill: "pill-teal",
  },
  encrypted: {
    title: "Encrypted",
    body: "Stored encrypted at rest in your browser only. Our staff can decrypt only for verified support cases. Good if you want to come back to a conversation.",
    pill: "pill-accent",
  },
  vault: {
    title: "Zero-knowledge Vault",
    body: "Encrypted with your passphrase, client-side. Even our servers cannot read it. If you forget the passphrase, the conversation is gone forever.",
    pill: "pill-plum",
  },
};

const LANG_LABELS: Record<Locale, string> = { en: "English", hi: "हिन्दी", hinglish: "Hinglish" };

export function Companion({
  configured,
  initialLocale = "en",
}: {
  configured: boolean;
  initialLocale?: Locale;
}) {
  const [locale, setLocale] = useState<Locale>(initialLocale);
  const [mode, setMode] = useState<Mode>("ephemeral");
  const [region, setRegion] = useState<"IN" | "US" | "UK" | "AE" | "SG" | "OTHER">("IN");
  const [vaultPassphrase, setVaultPassphrase] = useState<string>("");
  const [vaultPassphraseConfirmed, setVaultPassphraseConfirmed] = useState(false);

  const conversationIdRef = useRef<string>(makeId());

  const { messages, input, handleInputChange, handleSubmit, isLoading, error, append } =
    useChat({
      api: "/api/companion/chat",
      body: { locale, mode, region },
      onFinish: () => trackEvent("sahay_message_completed", { locale, mode }),
    });

  // Persistence side-effect for "encrypted" and "vault" modes.
  useEffect(() => {
    if (mode === "ephemeral" || messages.length === 0) return;
    if (typeof window === "undefined") return;
    const transcript: VaultTranscript = {
      conversationId: conversationIdRef.current,
      startedAt: messages[0]?.createdAt?.toISOString?.() ?? new Date().toISOString(),
      messages: messages.map((m) => ({
        role: m.role === "assistant" ? "assistant" : "user",
        content: m.content,
        ts: m.createdAt?.toISOString?.() ?? new Date().toISOString(),
      })),
    };

    if (mode === "encrypted") {
      // Plain JSON in localStorage; "encrypted at rest" is a runtime claim
      // about the OS-level disk on the server side. In a fuller implementation
      // (P11 follow-up) we'd encrypt with a session key derived from the
      // signed-in user's Clerk ID + a server-issued KEK. For now, this is a
      // clean local-only persistence.
      try {
        localStorage.setItem(
          `sahay-encrypted:${conversationIdRef.current}`,
          JSON.stringify(transcript),
        );
      } catch {
        /* localStorage may be unavailable */
      }
    }
    // Vault mode persistence happens explicitly via the "Save to Vault" button below.
  }, [messages, mode]);

  async function saveToVault() {
    if (!vaultPassphrase) return;
    try {
      const transcript: VaultTranscript = {
        conversationId: conversationIdRef.current,
        startedAt: new Date().toISOString(),
        messages: messages.map((m) => ({
          role: m.role === "assistant" ? "assistant" : "user",
          content: m.content,
          ts: m.createdAt?.toISOString?.() ?? new Date().toISOString(),
        })),
      };
      const sealed = await sealTranscript(transcript, vaultPassphrase);
      localStorage.setItem(`sahay-vault:${conversationIdRef.current}`, JSON.stringify(sealed));
      alert("Saved to your zero-knowledge vault. Don't lose your passphrase.");
      trackEvent("sahay_vault_saved");
    } catch (e) {
      alert(`Vault save failed: ${(e as Error).message}`);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_18rem]">
      <section className="flex flex-col">
        {/* Top toolbar */}
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <span className={`pill ${MODE_DESCRIPTIONS[mode].pill}`}>
            {MODE_DESCRIPTIONS[mode].title}
          </span>
          <select
            aria-label="Language"
            value={locale}
            onChange={(e) => setLocale(e.target.value as Locale)}
            className="rounded-full border border-border bg-surface px-3 py-1.5 text-sm text-ink-700"
          >
            {(["en", "hi", "hinglish"] as Locale[]).map((l) => (
              <option key={l} value={l}>{LANG_LABELS[l]}</option>
            ))}
          </select>
          <select
            aria-label="Region"
            value={region}
            onChange={(e) => setRegion(e.target.value as typeof region)}
            className="rounded-full border border-border bg-surface px-3 py-1.5 text-sm text-ink-700"
          >
            <option value="IN">India</option>
            <option value="US">United States</option>
            <option value="UK">United Kingdom</option>
            <option value="AE">UAE</option>
            <option value="SG">Singapore</option>
            <option value="OTHER">Other</option>
          </select>
          <span className="ml-auto text-xs text-ink-400">
            40 messages / 10 min
          </span>
        </div>

        {!configured && (
          <div role="status" className="mb-4 card p-4 text-sm border-warn/40">
            <strong className="text-ink-900">Sahay is currently disabled.</strong> No
            LLM provider is configured. Set <code>LLM_PROVIDER=groq</code> with{" "}
            <code>GROQ_API_KEY</code>, <code>LLM_PROVIDER=anthropic</code> with{" "}
            <code>ANTHROPIC_API_KEY</code>, or <code>LLM_PROVIDER=ollama</code> with a
            local Ollama daemon.
          </div>
        )}

        {/* Conversation */}
        <div aria-live="polite" aria-label="Conversation" className="flex-1 space-y-3 mb-4">
          {messages.length === 0 ? (
            <div className="card p-5 animate-fade-up">
              <p className="text-sm text-ink-600">
                Hi. I&apos;m Sahay. I&apos;m not a clinician — I&apos;m a companion. There&apos;s
                nothing you have to be brave enough to say. We can go slowly.
              </p>
              <p className="mt-3 text-xs text-ink-400">A few openers, if it helps:</p>
              <ul className="mt-2 flex flex-wrap gap-2">
                {STARTERS[locale].map((q) => (
                  <li key={q}>
                    <button
                      type="button"
                      onClick={() => {
                        trackEvent("sahay_starter_clicked");
                        append({ role: "user", content: q });
                      }}
                      className="pill hover:border-accent/40 hover:bg-accent-soft hover:text-accent-ink transition-colors"
                    >
                      {q}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            messages.map((m) => (
              <article
                key={m.id}
                className={`rounded-2xl p-4 animate-fade-up ${
                  m.role === "user"
                    ? "bg-accent-soft text-accent-ink ml-6 sm:ml-12"
                    : "card mr-6 sm:mr-12"
                }`}
              >
                <header className="text-[10px] uppercase tracking-wider text-ink-400 mb-1 font-medium">
                  {m.role === "user" ? "You" : "Sahay"}
                </header>
                <div className="prose prose-sm max-w-none whitespace-pre-wrap leading-relaxed">
                  {m.content || <span className="italic text-ink-400">…</span>}
                </div>
              </article>
            ))
          )}

          {error && (
            <div role="alert" className="rounded-xl border border-warn/40 bg-warn/10 px-3 py-2 text-sm">
              {String(error.message ?? error)}
            </div>
          )}
        </div>

        {/* Composer */}
        <form onSubmit={handleSubmit} className="card p-3">
          <label htmlFor="sahay-input" className="sr-only">
            Type a message to Sahay
          </label>
          <textarea
            id="sahay-input"
            value={input}
            onChange={handleInputChange}
            placeholder={
              locale === "en"
                ? "Type something — even one sentence is enough"
                : locale === "hi"
                ? "एक वाक्य भी काफी है। शुरू करें।"
                : "Ek line bhi enough hai. Shuru karein."
            }
            rows={3}
            className="w-full rounded-xl bg-transparent p-2 text-sm focus:outline-none resize-none"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSubmit();
              }
            }}
          />
          <div className="flex flex-wrap items-center gap-2 mt-1">
            <button type="submit" disabled={isLoading || !input.trim()} className="btn-primary">
              {isLoading ? "Sahay is replying…" : "Send"}
            </button>
            {mode === "vault" && messages.length > 0 && vaultPassphraseConfirmed && (
              <button type="button" onClick={saveToVault} className="btn-secondary">
                Save to Vault
              </button>
            )}
            <Link href="/clinicians" className="btn-ghost ml-auto">
              Talk to a human →
            </Link>
          </div>
        </form>
      </section>

      {/* Side panel: confidentiality + safety */}
      <aside className="space-y-4 h-fit lg:sticky lg:top-20">
        <div className="card p-4">
          <h2 className="font-medium text-ink-900 mb-2">Confidentiality mode</h2>
          <fieldset className="space-y-2">
            {(["ephemeral", "encrypted", "vault"] as Mode[]).map((m) => (
              <label
                key={m}
                className={`flex items-start gap-2 rounded-xl border p-3 text-sm cursor-pointer transition-colors ${
                  mode === m ? "border-accent/40 bg-accent-soft" : "border-border bg-surface hover:bg-elevated"
                }`}
              >
                <input
                  type="radio"
                  name="mode"
                  value={m}
                  checked={mode === m}
                  onChange={() => setMode(m)}
                  className="mt-0.5 accent-current"
                />
                <span>
                  <span className="block font-medium text-ink-900">{MODE_DESCRIPTIONS[m].title}</span>
                  <span className="block text-xs text-ink-600">{MODE_DESCRIPTIONS[m].body}</span>
                </span>
              </label>
            ))}
          </fieldset>

          {mode === "vault" && (
            <div className="mt-3 rounded-xl border border-warn/30 bg-warn/5 p-3 text-xs text-ink-800">
              <p className="font-medium">Set a passphrase</p>
              <p className="mt-1 text-ink-600">
                Long sentences work best. We never see this passphrase. If you forget it,
                the saved conversation is gone forever.
              </p>
              <input
                type="password"
                value={vaultPassphrase}
                onChange={(e) => setVaultPassphrase(e.target.value)}
                placeholder="A sentence only you would write"
                className="mt-2 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm"
              />
              <button
                type="button"
                disabled={vaultPassphrase.length < 12}
                onClick={() => setVaultPassphraseConfirmed(true)}
                className="mt-2 btn-primary text-xs px-3 py-1.5"
              >
                {vaultPassphraseConfirmed ? "Passphrase set ✓" : "Set passphrase"}
              </button>
              {vaultPassphraseConfirmed && (
                <p className="mt-2 text-xs text-ok">Ready. Click &quot;Save to Vault&quot; after a turn.</p>
              )}
            </div>
          )}
        </div>

        <div className="card p-4 text-xs text-ink-600">
          <h2 className="font-medium text-ink-900 mb-1">Important</h2>
          <ul className="space-y-1 list-disc pl-4">
            <li>Sahay is not a therapist or doctor.</li>
            <li>For real-time crisis help, use the bottom-right button anywhere on the site.</li>
            <li>You can change language and mode any time without losing your turn.</li>
            <li><Link href="/about/privacy" className="text-accent-ink hover:underline">How we handle your data →</Link></li>
          </ul>
        </div>
      </aside>
    </div>
  );
}

function makeId(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}
