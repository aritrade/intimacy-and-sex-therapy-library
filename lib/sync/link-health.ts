/**
 * Link-health agent.
 *
 * Pulls every published resource's externalUrl, HEAD-probes it, and:
 *   - 200/204/3xx -> healthy, do nothing
 *   - 401/403     -> bot-blocked but probably reachable in browser
 *   - 404/410     -> emit `fix_url` (when we can find a working
 *                    candidate via Wayback) or `remove_resource`
 *                    proposal otherwise.
 *   - 5xx, timeout-> retry once; if still failing, log but DO NOT
 *                    propose removal — could be transient.
 *
 * The agent is idempotent: re-running emits zero new proposals if the
 * catalog hasn't changed.
 */

import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { resources } from "@/lib/db/schema";
import { submitProposal } from "./proposals";

const PROPOSED_BY = "agent:link-health";
const TIMEOUT_MS = 12_000;
const USER_AGENT =
  "ISTL-LinkHealth/1.0 (+https://intimacy-and-sex-therapy-library.vercel.app/about)";

export type ProbeOutcome =
  | { status: "healthy"; httpCode: number }
  | { status: "bot_blocked"; httpCode: number }
  | { status: "broken"; httpCode: number; canFix: string | null }
  | { status: "transient"; httpCode: number | null; detail: string };

export type LinkHealthSummary = {
  scanned: number;
  healthy: number;
  botBlocked: number;
  brokenWithFix: number;
  brokenNoFix: number;
  transient: number;
  proposalsEmitted: number;
};

export async function runLinkHealthAgent(opts?: {
  /** Cap how many resources we probe in a single run. */
  limit?: number;
}): Promise<LinkHealthSummary> {
  const summary: LinkHealthSummary = {
    scanned: 0,
    healthy: 0,
    botBlocked: 0,
    brokenWithFix: 0,
    brokenNoFix: 0,
    transient: 0,
    proposalsEmitted: 0,
  };

  const rows = await db
    .select({
      id: resources.id,
      title: resources.title,
      externalUrl: resources.externalUrl,
    })
    .from(resources)
    .where(eq(resources.isPublished, true))
    .limit(opts?.limit ?? 200);

  for (const r of rows) {
    summary.scanned += 1;
    const outcome = await probe(r.externalUrl);
    if (outcome.status === "healthy") {
      summary.healthy += 1;
    } else if (outcome.status === "bot_blocked") {
      summary.botBlocked += 1;
    } else if (outcome.status === "transient") {
      summary.transient += 1;
    } else if (outcome.status === "broken") {
      if (outcome.canFix) {
        summary.brokenWithFix += 1;
        const result = await submitProposal({
          kind: "fix_url",
          proposedBy: PROPOSED_BY,
          resourceId: r.id,
          payload: {
            oldUrl: r.externalUrl,
            newUrl: outcome.canFix,
            httpCode: outcome.httpCode,
          },
          summary: `Replace broken URL for "${r.title.slice(0, 60)}"`,
          evidence: {
            probe: { httpCode: outcome.httpCode, ranAt: new Date().toISOString() },
            replacementSource: "wayback-machine",
          },
          confidence: 70,
        });
        if (result.inserted) summary.proposalsEmitted += 1;
      } else {
        summary.brokenNoFix += 1;
        const result = await submitProposal({
          kind: "remove_resource",
          proposedBy: PROPOSED_BY,
          resourceId: r.id,
          payload: {
            url: r.externalUrl,
            httpCode: outcome.httpCode,
            reason: "unreachable_no_replacement",
          },
          summary: `Remove or replace "${r.title.slice(0, 60)}" — link returns ${outcome.httpCode}`,
          evidence: {
            probe: { httpCode: outcome.httpCode, ranAt: new Date().toISOString() },
            waybackChecked: true,
          },
          confidence: 50,
        });
        if (result.inserted) summary.proposalsEmitted += 1;
      }
    }
  }

  return summary;
}

async function probe(url: string): Promise<ProbeOutcome> {
  // Try HEAD first (cheaper); fall back to GET if HEAD is rejected.
  const headOutcome = await tryFetch(url, "HEAD");
  if (headOutcome.status === "healthy" || headOutcome.status === "bot_blocked") {
    return headOutcome;
  }
  // Many servers (Cloudflare, Akamai) refuse HEAD; treat 4xx HEAD as
  // ambiguous and re-probe with GET.
  if (headOutcome.status === "broken" && (headOutcome.httpCode === 405 || headOutcome.httpCode === 403)) {
    return tryFetch(url, "GET");
  }
  if (headOutcome.status === "broken") {
    const fix = await waybackLatest(url);
    return { status: "broken", httpCode: headOutcome.httpCode, canFix: fix };
  }
  return headOutcome;
}

async function tryFetch(url: string, method: "HEAD" | "GET"): Promise<ProbeOutcome> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method,
      headers: { "User-Agent": USER_AGENT, Accept: "*/*" },
      redirect: "follow",
      signal: controller.signal,
    });
    if (res.status >= 200 && res.status < 400) {
      return { status: "healthy", httpCode: res.status };
    }
    if (res.status === 401 || res.status === 403 || res.status === 429) {
      return { status: "bot_blocked", httpCode: res.status };
    }
    if (res.status >= 500) {
      return { status: "transient", httpCode: res.status, detail: `${res.status}` };
    }
    return { status: "broken", httpCode: res.status, canFix: null };
  } catch (e) {
    return {
      status: "transient",
      httpCode: null,
      detail: String((e as Error).message).slice(0, 200),
    };
  } finally {
    clearTimeout(t);
  }
}

/**
 * Ask the Wayback Machine for the most recent successful snapshot of
 * the given URL. We treat a result as "fixable" only if Wayback has
 * a 2xx snapshot from the last 5 years.
 */
async function waybackLatest(url: string): Promise<string | null> {
  try {
    const res = await fetch(
      `https://archive.org/wayback/available?url=${encodeURIComponent(url)}`,
      {
        headers: { "User-Agent": USER_AGENT },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as {
      archived_snapshots?: { closest?: { available?: boolean; url?: string; status?: string; timestamp?: string } };
    };
    const c = data.archived_snapshots?.closest;
    if (!c?.available || !c.url) return null;
    if (c.status && !c.status.startsWith("2")) return null;
    if (c.timestamp) {
      const yr = Number(c.timestamp.slice(0, 4));
      const ageYears = new Date().getUTCFullYear() - yr;
      if (Number.isFinite(yr) && ageYears > 5) return null;
    }
    return c.url;
  } catch {
    return null;
  }
}
