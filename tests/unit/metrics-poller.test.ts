import { describe, expect, it } from "vitest";
import {
  parseInstagramInsights,
  parseYouTubeStatistics,
} from "@/lib/social/metrics-poller";

describe("parseInstagramInsights", () => {
  it("maps Reels metric set to our PollerMetrics shape", () => {
    const r = parseInstagramInsights({
      data: [
        { name: "plays", values: [{ value: 12000 }] },
        { name: "likes", values: [{ value: 845 }] },
        { name: "comments", values: [{ value: 17 }] },
        { name: "saved", values: [{ value: 92 }] },
        { name: "shares", values: [{ value: 25 }] },
        { name: "reach", values: [{ value: 9000 }] },
        { name: "total_interactions", values: [{ value: 1000 }] },
      ],
    });
    expect(r.views).toBe(12000); // plays preferred over reach
    expect(r.likes).toBe(845);
    expect(r.comments).toBe(17);
    expect(r.saves).toBe(92);
    expect(r.linkClicks).toBe(25); // shares slotted into linkClicks
  });

  it("falls back to reach when plays is absent", () => {
    const r = parseInstagramInsights({
      data: [{ name: "reach", values: [{ value: 4000 }] }],
    });
    expect(r.views).toBe(4000);
    expect(r.likes).toBe(0);
  });

  it("returns zeros for an empty payload", () => {
    expect(parseInstagramInsights({})).toEqual({
      views: 0,
      likes: 0,
      comments: 0,
      saves: 0,
      linkClicks: 0,
    });
    expect(parseInstagramInsights({ data: [] })).toEqual({
      views: 0,
      likes: 0,
      comments: 0,
      saves: 0,
      linkClicks: 0,
    });
  });
});

describe("parseYouTubeStatistics", () => {
  it("coerces string counts into numbers", () => {
    const r = parseYouTubeStatistics({
      viewCount: "23456",
      likeCount: "1234",
      commentCount: "78",
      favoriteCount: "12",
    });
    expect(r.views).toBe(23456);
    expect(r.likes).toBe(1234);
    expect(r.comments).toBe(78);
    expect(r.saves).toBe(12);
    expect(r.linkClicks).toBe(0);
  });

  it("treats missing or non-numeric fields as zero", () => {
    const r = parseYouTubeStatistics({
      viewCount: "abc",
      likeCount: undefined,
    });
    expect(r.views).toBe(0);
    expect(r.likes).toBe(0);
  });
});
