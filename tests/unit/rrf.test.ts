import { describe, expect, it } from "vitest";
import { rrfFuse } from "@/lib/search/hybrid";

describe("rrfFuse", () => {
  it("ranks documents that appear in both lists higher than singletons", () => {
    const vec = [{ chunkId: "a", rank: 0 }, { chunkId: "b", rank: 1 }];
    const bm25 = [{ chunkId: "b", rank: 0 }, { chunkId: "c", rank: 1 }];
    const fused = rrfFuse(vec, bm25, 60);
    expect(fused[0].chunkId).toBe("b");
    expect(fused[0].matchedBy.sort()).toEqual(["bm25", "vector"]);
  });

  it("preserves the original lists when one side is empty", () => {
    const vec = [{ chunkId: "a", rank: 0 }, { chunkId: "b", rank: 1 }];
    const fused = rrfFuse(vec, [], 60);
    expect(fused.map((f) => f.chunkId)).toEqual(["a", "b"]);
    expect(fused[0].matchedBy).toEqual(["vector"]);
    expect(fused[1].matchedBy).toEqual(["vector"]);
  });

  it("returns an empty array when both lists are empty", () => {
    expect(rrfFuse([], [], 60)).toEqual([]);
  });

  it("scores follow 1/(k + rank + 1) formula", () => {
    const fused = rrfFuse([{ chunkId: "a", rank: 0 }], [], 10);
    expect(fused[0].score).toBeCloseTo(1 / 11, 10);
  });

  it("higher k flattens score deltas (sanity)", () => {
    const vec = [{ chunkId: "a", rank: 0 }, { chunkId: "b", rank: 9 }];
    const fLow = rrfFuse(vec, [], 1);
    const fHigh = rrfFuse(vec, [], 1000);
    const dLow = fLow[0].score - fLow[1].score;
    const dHigh = fHigh[0].score - fHigh[1].score;
    expect(dHigh).toBeLessThan(dLow);
  });
});
