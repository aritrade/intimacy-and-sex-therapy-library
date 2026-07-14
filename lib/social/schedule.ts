/**
 * Throttled auto-scheduling for approved drafts.
 *
 * The publish pipeline never bursts: when a draft clears the editor gate
 * (status = "editor_reviewed") we stamp it with a `scheduled_at` at the next
 * free "peak" slot, and the hourly publish-due cron drains due drafts (≤20/run,
 * skipping any without a rendered HTTPS video). Spreading posts across a small
 * number of daily slots keeps us under IG/YT/FB spam thresholds and lands posts
 * at the India-audience evening peak.
 *
 * Design notes:
 *   - We DO NOT change the review gates. A draft only becomes eligible here
 *     once a human (or the combined bulk-approve action) has moved it to
 *     `editor_reviewed`. This module only decides *when* an already-approved
 *     draft goes out, never *whether*.
 *   - Slot assignment is idempotent per draft (callers skip drafts that already
 *     have a `scheduled_at`) and collision-free across a batch (see
 *     `pickNextSlots`, which accounts for slots reserved earlier in the same run).
 */

import { and, eq, isNotNull } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { contentDrafts } from "@/lib/db/schema";

const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000; // UTC+5:30
const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

/**
 * IST hours we post at — 6/day: an afternoon spread plus the 7–9 PM India
 * evening peak. Override with a comma-separated `PUBLISH_SLOTS_IST` env
 * (e.g. "19,20,21" for 3/day). Invalid entries are ignored; an empty/invalid
 * override falls back to the default so scheduling never breaks.
 */
export function dailySlotHoursIst(): number[] {
  const raw = process.env.PUBLISH_SLOTS_IST;
  if (raw) {
    const parsed = raw
      .split(",")
      .map((s) => Number(s.trim()))
      .filter((n) => Number.isInteger(n) && n >= 0 && n <= 23);
    if (parsed.length > 0) return [...new Set(parsed)].sort((a, b) => a - b);
  }
  return [11, 14, 17, 19, 20, 21];
}

/** How many posts/day the throttle allows (one per configured slot). */
export function postsPerDay(): number {
  return dailySlotHoursIst().length;
}

/**
 * Pure slot picker: returns `count` future UTC instants, each at a configured
 * IST peak hour, skipping any already in `taken`. Slots reserved within this
 * call are themselves treated as taken so a batch never double-books.
 */
export function pickNextSlots(now: Date, taken: Date[], count: number): Date[] {
  const slotHours = dailySlotHoursIst();
  const takenMs = new Set(taken.map((d) => d.getTime()));
  const nowMs = now.getTime();

  // UTC instant of the most recent IST midnight (start of "today" in IST).
  const istMidnightUtcMs = Math.floor((nowMs + IST_OFFSET_MS) / DAY_MS) * DAY_MS - IST_OFFSET_MS;

  const picked: Date[] = [];
  for (let day = 0; day < 366 && picked.length < count; day++) {
    for (const hour of slotHours) {
      const slotMs = istMidnightUtcMs + day * DAY_MS + hour * HOUR_MS;
      if (slotMs <= nowMs) continue;
      if (takenMs.has(slotMs)) continue;
      picked.push(new Date(slotMs));
      takenMs.add(slotMs);
      if (picked.length >= count) break;
    }
  }
  return picked;
}

/** All slots currently reserved by approved-but-unposted drafts. */
async function reservedSlots(): Promise<Date[]> {
  const rows = await db
    .select({ scheduledAt: contentDrafts.scheduledAt })
    .from(contentDrafts)
    .where(
      and(eq(contentDrafts.status, "editor_reviewed"), isNotNull(contentDrafts.scheduledAt)),
    );
  return rows
    .map((r) => r.scheduledAt)
    .filter((d): d is Date => d instanceof Date);
}

/**
 * Reserve the next free peak slot for a single draft. Returns the chosen UTC
 * instant, or null if auto-scheduling is disabled via env.
 */
export async function reserveNextSlot(): Promise<Date | null> {
  if (!isAutoScheduleEnabled()) return null;
  const [slot] = pickNextSlots(new Date(), await reservedSlots(), 1);
  return slot ?? null;
}

/**
 * Reserve `count` free peak slots at once (for bulk approval). Returns fewer
 * than `count` only in the pathological >1-year-out case.
 */
export async function reserveNextSlots(count: number): Promise<Date[]> {
  if (!isAutoScheduleEnabled() || count <= 0) return [];
  return pickNextSlots(new Date(), await reservedSlots(), count);
}

/**
 * Auto-scheduling is on by default; set AUTO_SCHEDULE_ON_APPROVAL=0 to make
 * editor approval leave `scheduled_at` null (reverting to manual "Publish now").
 */
export function isAutoScheduleEnabled(): boolean {
  return process.env.AUTO_SCHEDULE_ON_APPROVAL !== "0";
}
