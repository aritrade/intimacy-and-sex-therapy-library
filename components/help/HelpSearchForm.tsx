"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AFFIRMING_FILTERS,
  COMMUNITY_TOPICS,
  COUNTRIES,
  SPECIALTIES,
  statesForCountry,
} from "@/lib/help/taxonomy";

const FIELD =
  "w-full rounded-xl border border-border bg-surface px-3 py-2.5 text-sm text-ink-900 outline-none focus-visible:ring-2 focus-visible:ring-accent";

type CommunityScope = "local" | "online" | "both";

export type HelpSearchInitial = {
  country: string;
  state?: string;
  locality?: string;
  specialty?: string;
  topic?: string;
  scope?: CommunityScope;
  affirming?: string[];
};

export function HelpSearchForm({
  mode,
  initial,
}: {
  mode: "clinician" | "community";
  initial: HelpSearchInitial;
}) {
  const router = useRouter();
  const [country, setCountry] = useState(initial.country || "IN");
  const [state, setState] = useState(initial.state ?? "");
  const [locality, setLocality] = useState(initial.locality ?? "");
  const [specialty, setSpecialty] = useState(initial.specialty ?? SPECIALTIES[0].id);
  const [topic, setTopic] = useState(initial.topic ?? COMMUNITY_TOPICS[0].id);
  const [scope, setScope] = useState<CommunityScope>(initial.scope ?? "both");
  const [affirming, setAffirming] = useState<string[]>(initial.affirming ?? []);
  const [localityOptions, setLocalityOptions] = useState<string[]>([]);

  const states = useMemo(() => statesForCountry(country), [country]);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Locality autocomplete (Google Places city suggestions via our API).
  useEffect(() => {
    if (locality.trim().length < 2) {
      setLocalityOptions([]);
      return;
    }
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(async () => {
      const params = new URLSearchParams({ level: "locality", country, q: locality });
      if (state) params.set("state", state);
      try {
        const res = await fetch(`/api/help/locations?${params}`);
        if (!res.ok) return;
        const data = (await res.json()) as { options?: string[] };
        setLocalityOptions(data.options ?? []);
      } catch {
        /* ignore — autocomplete is best-effort */
      }
    }, 300);
    return () => {
      if (debounce.current) clearTimeout(debounce.current);
    };
  }, [locality, country, state]);

  function toggleAffirming(id: string) {
    setAffirming((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const params = new URLSearchParams();
    params.set("country", country);
    if (state) params.set("state", state);
    if (locality.trim()) params.set("locality", locality.trim());
    if (affirming.length) params.set("affirming", affirming.join(","));
    if (mode === "clinician") {
      params.set("specialty", specialty);
    } else {
      params.set("topic", topic);
      params.set("scope", scope);
    }
    params.set("go", "1");
    const base = mode === "clinician" ? "/clinicians" : "/communities";
    router.push(`${base}?${params}`);
  }

  return (
    <form onSubmit={submit} className="card p-5">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-ink-600">Country</span>
          <select
            className={FIELD}
            value={country}
            onChange={(e) => {
              setCountry(e.target.value);
              setState("");
              setLocality("");
            }}
          >
            {COUNTRIES.map((c) => (
              <option key={c.code} value={c.code}>
                {c.label}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-medium text-ink-600">State / region</span>
          <select className={FIELD} value={state} onChange={(e) => setState(e.target.value)}>
            <option value="">Any</option>
            {states.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-medium text-ink-600">Locality / city</span>
          <input
            className={FIELD}
            value={locality}
            list="help-locality-options"
            placeholder="Start typing a city…"
            onChange={(e) => setLocality(e.target.value)}
          />
          <datalist id="help-locality-options">
            {localityOptions.map((o) => (
              <option key={o} value={o} />
            ))}
          </datalist>
        </label>

        {mode === "clinician" ? (
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-ink-600">Looking for</span>
            <select className={FIELD} value={specialty} onChange={(e) => setSpecialty(e.target.value)}>
              {SPECIALTIES.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-ink-600">Topic</span>
              <select className={FIELD} value={topic} onChange={(e) => setTopic(e.target.value)}>
                {COMMUNITY_TOPICS.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-ink-600">Where</span>
              <select
                className={FIELD}
                value={scope}
                onChange={(e) => setScope(e.target.value as CommunityScope)}
              >
                <option value="both">Local + online</option>
                <option value="local">Local groups</option>
                <option value="online">Online communities</option>
              </select>
            </label>
          </>
        )}
      </div>

      <fieldset className="mt-4">
        <legend className="mb-2 text-xs font-medium text-ink-600">
          Affirming &amp; inclusive (optional)
        </legend>
        <div className="flex flex-wrap gap-2">
          {AFFIRMING_FILTERS.map((f) => {
            const on = affirming.includes(f.id);
            return (
              <button
                key={f.id}
                type="button"
                onClick={() => toggleAffirming(f.id)}
                aria-pressed={on}
                className={on ? "pill-teal" : "pill"}
              >
                {f.label}
              </button>
            );
          })}
        </div>
      </fieldset>

      <div className="mt-5 flex items-center gap-3">
        <button type="submit" className="btn-primary">
          {mode === "clinician" ? "Find clinicians" : "Find communities"}
        </button>
        <span className="text-xs text-ink-400">
          We search official directories. Everyone is welcome here.
        </span>
      </div>
    </form>
  );
}
