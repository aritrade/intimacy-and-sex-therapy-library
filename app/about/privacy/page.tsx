import { ALL_PURPOSES, DATA_PRINCIPAL_RIGHTS } from "@/lib/compliance/dpdp";

export const metadata = { title: "Privacy notice · Intimacy & Sex Therapy Library" };

export default function PrivacyPage() {
  return (
    <article className="mx-auto max-w-prose px-4 sm:px-6 py-10 prose prose-ink">
      <h1 className="font-serif text-3xl text-ink-900">Privacy notice</h1>
      <p className="text-ink-600">
        This site treats sexual orientation and health as <em>Sensitive Personal Data</em>{" "}
        under India&apos;s DPDP Act 2023 and as <em>Special Category Data</em> under
        GDPR Article 9. We collect the minimum needed and ask for explicit consent
        for any optional purpose.
      </p>

      <h2 className="font-serif text-xl mt-8">Purposes of processing</h2>
      <p>
        Each row below names a single, declared purpose. Reads and writes of your
        data must cite one of these purposes. You can revoke any optional purpose
        at any time without losing access to features that don&apos;t depend on it.
      </p>
      <ul>
        {ALL_PURPOSES.map((p) => (
          <li key={p.id} className="my-4">
            <strong>{p.id}</strong>{" "}
            {p.optional ? (
              <span className="text-ink-400 text-sm">(optional)</span>
            ) : (
              <span className="text-ink-400 text-sm">(required to run the site)</span>
            )}
            <div className="text-ink-600">{p.description}</div>
            <div className="text-xs text-ink-400 mt-1">
              Legal basis (IN): {p.legal_basis_in} · Legal basis (EU): {p.legal_basis_eu}
              {" · "}Retention:{" "}
              {p.retention_days < 0 ? "until deletion" : `${p.retention_days} days`}
            </div>
          </li>
        ))}
      </ul>

      <h2 className="font-serif text-xl mt-8">Your rights</h2>
      <ul>
        {Object.entries(DATA_PRINCIPAL_RIGHTS).map(([k, v]) => (
          <li key={k}>
            <code>{k}</code> →{" "}
            <a href={v} className="underline">
              {v}
            </a>
          </li>
        ))}
      </ul>

      <h2 className="font-serif text-xl mt-8">Grievance Officer</h2>
      <p>
        Per DPDP Section 11, you can contact our Data Protection Officer / Grievance
        Officer for any concern at{" "}
        <a className="underline" href="mailto:privacy@example.com">
          privacy@example.com
        </a>
        .
      </p>

      <h2 className="font-serif text-xl mt-8">Accounts (optional)</h2>
      <p>
        Signing in is optional and unlocks three things only: a saved
        assessment-score history, learning-path progress checkmarks, and a
        cloud back-up of your encrypted Sahay vault entries. The chatbot,
        Sahay companion, library, glossary, myths, paths, decision aid, and
        worksheets work fully without an account.
      </p>
      <p>
        We store your email and (if you used Google) your Google profile name
        and image. We do not log your search queries, chatbot prompts,
        Sahay messages, or your individual assessment answers. Saved assessment
        rows contain only the numeric score, severity label, and a flag list
        (e.g., <code>urgent</code> when a crisis-signal item was endorsed) so
        we can route you to support — not to profile you.
      </p>
      <p>
        Vault entries stored on the server are AES-256-GCM ciphertext encrypted
        on your device with a passphrase-derived key (PBKDF2, 310,000
        iterations). The server cannot read them. If you forget the
        passphrase, the data is gone — by design.
      </p>

      <h2 className="font-serif text-xl mt-8">Subprocessors</h2>
      <p>
        We use Anthropic (Claude, generation), OpenAI (text-embedding-3-small,
        embeddings; Whisper for caption alignment if a draft uses voiceover), Sarvam AI
        (Hindi/Indic text-to-speech), ElevenLabs (English text-to-speech),
        Google Identity (OAuth sign-in if you choose that flow), Resend
        (transactional email for magic-link sign-in if you choose that flow),
        and your selected KMS (AWS / GCP / Vault Transit) for encryption.
        Sahay messages in <em>Vault</em> mode never reach any of these in
        plaintext after the moment of generation.
      </p>
      <p>
        Auth.js stores a single short-lived JWT session cookie when you sign
        in (<code>__Secure-authjs.session-token</code> in production,
        <code>authjs.session-token</code> in dev). This cookie is required to
        load your account page and saves your role claims so admin pages stay
        gated; it expires after 30 days and is removed on sign-out.
      </p>

      <h2 className="font-serif text-xl mt-8">Social publishing</h2>
      <p>
        When a draft is published to Instagram or YouTube, that platform receives
        only the rendered video and its caption. No personal information about
        site visitors is sent. Social publishing requires (1) clinician approval,
        (2) editor approval, and (3) a human pressing publish on our admin page.
        Nothing is auto-posted, ever.
      </p>
    </article>
  );
}
