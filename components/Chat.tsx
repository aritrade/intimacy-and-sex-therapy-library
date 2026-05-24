"use client";

import { useChat } from "ai/react";
import { useState } from "react";
import { CitationList } from "./CitationList";
import { trackEvent } from "./Analytics";

const STARTER_QUESTIONS = [
  "What does the evidence say about responsive desire?",
  "How is vaginismus typically treated?",
  "What is the dual-control model of arousal?",
  "Is asexuality a sexual dysfunction?",
  "What does WPATH SOC8 recommend for adolescents?",
];

export function Chat({
  scopedResourceId,
  scopedResourceTitle,
}: {
  scopedResourceId?: string;
  scopedResourceTitle?: string;
}) {
  const { messages, input, handleInputChange, handleSubmit, isLoading, error, append } =
    useChat({
      api: "/api/chat",
      body: { scopedResourceId },
      onFinish: () => trackEvent("chat_message_completed", { scoped: !!scopedResourceId }),
      onError: (err) => console.error(err),
    });

  const hasMessages = messages.length > 0;

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
      <section className="flex flex-col">
        {scopedResourceTitle && (
          <div className="rounded-xl border border-accent/30 bg-accent-soft px-3 py-2 text-sm text-accent-ink mb-4">
            Scoped to: <strong>{scopedResourceTitle}</strong>
          </div>
        )}

        <div
          aria-live="polite"
          aria-label="Conversation"
          className="flex-1 space-y-3 mb-4"
        >
          {!hasMessages && (
            <div className="card p-5 animate-fade-up">
              <p className="text-sm text-ink-600">
                Ask the library a question. The chatbot answers only from the curated
                corpus and cites every claim. If the library doesn&apos;t know, it says so.
              </p>
              <ul className="mt-4 flex flex-wrap gap-2">
                {STARTER_QUESTIONS.map((q) => (
                  <li key={q}>
                    <button
                      type="button"
                      onClick={() => {
                        trackEvent("chat_starter_clicked");
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
          )}

          {messages.map((m) => (
            <article
              key={m.id}
              className={`rounded-2xl p-4 animate-fade-up ${
                m.role === "user"
                  ? "bg-accent-soft text-accent-ink ml-6 sm:ml-12"
                  : "card mr-6 sm:mr-12"
              }`}
            >
              <header className="text-[10px] uppercase tracking-wider text-ink-400 mb-1 font-medium">
                {m.role === "user" ? "You" : "Library"}
              </header>
              <div className="prose prose-sm max-w-none whitespace-pre-wrap leading-relaxed">
                {m.content || <span className="italic text-ink-400">…</span>}
              </div>
            </article>
          ))}

          {error && (
            <div role="alert" className="rounded-xl border border-warn/40 bg-warn/10 px-3 py-2 text-sm text-ink">
              {String(error.message ?? error)}
            </div>
          )}
        </div>

        <form onSubmit={handleSubmit} className="card p-3">
          <label htmlFor="chat-input" className="sr-only">
            Ask a question
          </label>
          <textarea
            id="chat-input"
            value={input}
            onChange={handleInputChange}
            placeholder="Ask a question…"
            rows={3}
            className="w-full rounded-xl bg-transparent p-2 text-sm focus:outline-none resize-none"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSubmit();
              }
            }}
          />
          <div className="flex flex-wrap items-center gap-3 mt-1">
            <button
              type="submit"
              disabled={isLoading || !input.trim()}
              className="btn-primary"
            >
              {isLoading ? "Thinking…" : "Ask"}
            </button>
            <span className="ml-auto text-[11px] text-ink-400">
              30 messages / 10 min · No tracking cookies
            </span>
          </div>
        </form>
      </section>

      <CitationList messages={messages} />
    </div>
  );
}
