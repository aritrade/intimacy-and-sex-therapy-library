/**
 * Boundary math for lib/social/avatar.ts#generateAvatarVideoChunked.
 * The chunk-boundary function is pure and off-by-one prone, so it
 * gets a dedicated test to lock in the invariants:
 *   - Every chunk is ≤ maxChunkSec (SadTalker's comfort zone).
 *   - Chunks are as evenly sized as possible (no tiny trailing chunk
 *     that would produce a jarring ~2s avatar clip at the end).
 *   - The last boundary equals totalSeconds exactly, no drift.
 *   - We never emit more chunks than mathematically required.
 */
import { describe, it, expect } from "vitest";
import { computeChunkBoundaries } from "../../lib/social/avatar";

describe("computeChunkBoundaries", () => {
  it("returns [] for zero-length audio", () => {
    expect(computeChunkBoundaries(0, 30)).toEqual([]);
    expect(computeChunkBoundaries(-1, 30)).toEqual([]);
  });

  it("returns a single boundary equal to total when audio ≤ maxChunk", () => {
    expect(computeChunkBoundaries(20, 30)).toEqual([20]);
    expect(computeChunkBoundaries(30, 30)).toEqual([30]);
  });

  it("splits 60s into two even 30s chunks", () => {
    const b = computeChunkBoundaries(60, 30);
    expect(b).toHaveLength(2);
    expect(b[0]).toBeCloseTo(30, 6);
    expect(b[1]).toBe(60);
  });

  it("keeps every chunk under maxChunkSec by evening the split", () => {
    // 65s with max 30s: naive floor split would leave a 5s tail chunk.
    // Even split gives 3 chunks of ~21.67s each — under max, no runt.
    const b = computeChunkBoundaries(65, 30);
    expect(b).toHaveLength(3);
    const chunkSizes = b.map((end, i) => (i === 0 ? end : end - b[i - 1]));
    for (const size of chunkSizes) {
      expect(size).toBeLessThanOrEqual(30 + 1e-6);
    }
    expect(b[b.length - 1]).toBe(65);
  });

  it("handles the plan's headline case (240s essay ≈ 4 min → 8 chunks)", () => {
    const total = 240;
    const b = computeChunkBoundaries(total, 30);
    expect(b).toHaveLength(8);
    expect(b[b.length - 1]).toBe(total);
    for (let i = 0; i < b.length; i++) {
      const chunkSize = i === 0 ? b[0] : b[i] - b[i - 1];
      expect(chunkSize).toBeLessThanOrEqual(30 + 1e-6);
    }
  });

  it("last boundary equals totalSeconds exactly (no floating-point drift)", () => {
    // Non-divisible durations that would leave a rounding tail.
    for (const total of [47.1, 89.37, 123.456, 199.999]) {
      const b = computeChunkBoundaries(total, 30);
      expect(b[b.length - 1]).toBe(total);
    }
  });

  it("throws on non-positive maxChunkSec", () => {
    expect(() => computeChunkBoundaries(100, 0)).toThrow();
    expect(() => computeChunkBoundaries(100, -5)).toThrow();
  });
});
