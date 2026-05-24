import { REFUSAL_CATEGORIES } from "@/lib/safety/guardrails";
import { CLAUDE_GENERATION_MODEL } from "@/lib/ai/anthropic";
import { PROMPT_SET_VERSION } from "@/lib/eval/redteam";

export const metadata = { title: "Model card · Intimacy & Sex Therapy Library" };

export default function ModelCardPage() {
  return (
    <div className="container-page py-10 max-w-3xl">
      <header className="mb-6">
        <p className="pill-accent w-fit">Model card</p>
        <h1 className="mt-3 font-serif text-3xl sm:text-4xl text-ink-900">How the AI works</h1>
        <p className="mt-2 text-ink-600">
          A plain-language summary of which models we use, what they can and can&apos;t do,
          and how we measure them.
        </p>
      </header>

      <section className="card p-6 space-y-2">
        <h2 className="font-serif text-xl text-ink-900">What we use</h2>
        <ul className="list-disc pl-5 text-ink-700 space-y-1">
          <li>
            <strong>Generation:</strong> Anthropic <code>{CLAUDE_GENERATION_MODEL}</code>{" "}
            (citation chatbot and Sahay companion use separate system prompts).
          </li>
          <li>
            <strong>Embeddings:</strong> OpenAI <code>text-embedding-3-small</code>{" "}
            (1536-dim) over the curated corpus.
          </li>
          <li>
            <strong>Retrieval:</strong> Hybrid pgvector cosine + tsvector BM25, fused via
            Reciprocal Rank Fusion (k=60).
          </li>
          <li>
            <strong>Voice (Sahay):</strong> OpenAI Whisper STT, Sarvam AI for Hindi/Indic
            TTS, ElevenLabs / Cartesia for English. Zero retention configured.
          </li>
        </ul>
      </section>

      <section className="card p-6 mt-4 space-y-2">
        <h2 className="font-serif text-xl text-ink-900">What the AI can do</h2>
        <ul className="list-disc pl-5 text-ink-700 space-y-1">
          <li>Answer questions grounded in the curated, allowlisted corpus, with [n] citations on every claim.</li>
          <li>Hold a warm, validation-first conversation in English, Hindi, or Hinglish (Sahay).</li>
          <li>Surface India-aware crisis hotlines and clinician handoff cards when appropriate.</li>
        </ul>
      </section>

      <section className="card p-6 mt-4 space-y-2">
        <h2 className="font-serif text-xl text-ink-900">What the AI refuses to do</h2>
        <p className="text-ink-700">
          The system prompt explicitly refuses these categories. We track refusal correctness
          on every release through the red-team eval set.
        </p>
        <ul className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-1.5">
          {REFUSAL_CATEGORIES.map((c) => (
            <li key={c}>
              <span className="pill">{c.replace(/_/g, " ")}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="card p-6 mt-4 space-y-2">
        <h2 className="font-serif text-xl text-ink-900">How we measure it</h2>
        <p className="text-ink-700">
          Every release is replayed against an adversarial red-team prompt set
          (<code>{PROMPT_SET_VERSION}</code>). We score:
        </p>
        <ul className="list-disc pl-5 text-ink-700 space-y-1">
          <li><strong>Refusal correctness:</strong> did the model refuse when it should and answer when it should?</li>
          <li><strong>Citation faithfulness:</strong> answers contain numeric citations that map to real corpus entries.</li>
          <li><strong>Empathy heuristic:</strong> presence of validating language for sensitive prompts.</li>
          <li><strong>Bias audit:</strong> LGBTQ+, caste, gender, and religion-related prompts for pathologising language.</li>
        </ul>
        <p className="text-ink-700 mt-3">
          Results are written to <code>eval-reports/</code> on disk and to the
          content-free <code>eval_runs</code> table when DB is configured. We never persist
          the prompt content or the model&apos;s reply in any audit log.
        </p>
      </section>

      <section className="card p-6 mt-4 space-y-2">
        <h2 className="font-serif text-xl text-ink-900">Known limitations</h2>
        <ul className="list-disc pl-5 text-ink-700 space-y-1">
          <li>The AI is not a clinician and can be wrong. Always consult a qualified human for medical or psychological care.</li>
          <li>Citation faithfulness is monitored but not perfect — always check the linked source.</li>
          <li>
            In Sahay <em>Vault</em> mode, the model still reads your message in plaintext
            at the moment of replying. We never write that plaintext to disk. We disclose
            this honestly because no AI conversation can be perfectly zero-knowledge
            end-to-end while the AI is the responder.
          </li>
        </ul>
      </section>

      <section className="card p-6 mt-4 space-y-2">
        <h2 className="font-serif text-xl text-ink-900">Short-form content &amp; social publishing</h2>
        <p className="text-ink-700">
          We can generate short-form (Reels / Shorts) drafts using the same Claude model and
          render them with Remotion. <strong>Nothing posts automatically.</strong> Every
          publication requires three human signatures:
        </p>
        <ul className="list-disc pl-5 text-ink-700 space-y-1">
          <li><strong>Clinician review</strong> — for factual and ethical correctness.</li>
          <li><strong>Editor review</strong> — for tone, captions, length, and accessibility.</li>
          <li><strong>Reviewer click-through</strong> — a human ticks an attestation and presses publish.</li>
        </ul>
        <p className="text-ink-700">
          We are honest about a hard reality: Instagram and YouTube treat sexual-health
          content harshly even when it&apos;s clinically accurate, and reach is reduced
          unpredictably. We will not chase reach by softening the medicine. If a post is
          taken down or shadowbanned we record it on the draft and move on; we do not retry.
        </p>
      </section>

      <section className="card p-6 mt-4 space-y-2">
        <h2 className="font-serif text-xl text-ink-900">Provenance &amp; ingestion</h2>
        <p className="text-ink-700">
          The corpus is restricted to an explicit allowlist of sources
          (clinical bodies, peer-reviewed open-access journals, government
          health authorities, accredited universities, and a small set of
          named publishers). Anything else is rejected at ingest. The full
          allowlist lives in <code>lib/ingest/allowlist.ts</code>. Open
          licenses (CC, public domain, government work, OA-PMC) are stored
          in full so the chatbot can cite specific passages; copyrighted
          material is stored as metadata + a curator-written abstract +
          deep links only.
        </p>
        <p className="text-ink-700">
          Operator runbook on a fresh install:
        </p>
        <ol className="list-decimal pl-5 text-ink-700 space-y-1">
          <li><code>npm run db:migrate</code> — apply the SQL migrations.</li>
          <li><code>npm run db:seed-all</code> — seed the allowlist, taxonomy, clinical-board placeholders, the curated catalog, and the clinician directory.</li>
          <li>(optional) <code>npm run ingest -- --source=pmc --query=&quot;vaginismus&quot;</code> — pull more open-access articles from Europe PMC.</li>
          <li>(optional) <code>npm run ingest -- --from-file=manifests/topic-pack-low-desire.json</code> — ingest a hand-written manifest.</li>
        </ol>
        <p className="text-ink-700">
          Every resource lands as <code>is_published=false</code>. A
          clinician approves via the admin UI before anything appears on
          the public catalog.
        </p>
      </section>

      <section className="card p-6 mt-4 space-y-2">
        <h2 className="font-serif text-xl text-ink-900">Report a problem</h2>
        <p className="text-ink-700">
          Found a wrong citation, a harmful response, or content that shouldn&apos;t be
          here?{" "}
          <a className="underline text-accent-ink" href="mailto:safety@example.com">
            safety@example.com
          </a>
          .
        </p>
      </section>
    </div>
  );
}
