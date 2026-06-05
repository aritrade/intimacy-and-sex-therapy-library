/**
 * AI "Key takeaways" for an open-access article shown in the inline reader.
 *
 * Strictly grounded: the model summarises ONLY the provided body text into a
 * few plain-language bullet points — no outside facts, no medical advice. The
 * result is cached (long TTL; article text rarely changes) via the shared
 * discover JSON cache, so the LLM runs at most once per article.
 *
 * Returns null when no LLM is configured or the body is too thin to summarise.
 */

import { generateObject } from "ai";
import { z } from "zod";
import { chatModel, isLlmConfigured } from "@/lib/ai/llm";
import { getOrComputeJson } from "./cache";

const TAKEAWAYS_TTL = 120 * 24 * 60 * 60 * 1000; // 120 days

const Schema = z.object({
  points: z.array(z.string().max(240)).min(2).max(6),
});

export type Takeaways = { points: string[] };

const SYSTEM = `You write plain-language "key takeaways" for an evidence-based intimacy & sex-therapy library aimed at adults.

RULES:
- Summarise ONLY the provided article text. Never add facts, statistics, or claims not present in it.
- 3–5 short bullet points, each a complete, jargon-free sentence a non-expert can understand.
- Warm, non-pathologising, non-moralising, inclusive of all orientations, identities, and relationship structures.
- No medical dosing or directive medical advice. No crisis instructions.
- If the text doesn't support a confident point, write fewer points rather than inventing one.`;

export async function keyTakeaways({
  id,
  title,
  body,
}: {
  id: string;
  title: string;
  body: string;
}): Promise<Takeaways | null> {
  if (!isLlmConfigured()) return null;
  const text = body.trim();
  if (text.length < 400) return null;

  try {
    const { data } = await getOrComputeJson<Takeaways | null>({
      key: `takeaways:${id}`,
      ttlMs: TAKEAWAYS_TTL,
      compute: async () => {
        const { object } = await generateObject({
          model: chatModel(),
          system: SYSTEM,
          prompt: `ARTICLE TITLE: ${title}\n\nARTICLE TEXT (verbatim, may be truncated):\n${text.slice(0, 9000)}\n\nWrite the key takeaways.`,
          schema: Schema,
          temperature: 0.2,
        });
        return { points: object.points };
      },
    });
    return data;
  } catch {
    return null;
  }
}
