// (1) Zones frozen at last feed, highlight evaluated now: a clock tick only re-runs the highlight.
// (2) Replay weight: a closed segment uses effectiveWeightKg at its END (the next feed); the open
//     segment and the status card count weigh-ins up to max(lastFeed, latest weigh-in)
//     (design/2026-11-26-live-rules-and-weight-anchor.md §2, §4).
import fs from "fs";
import path from "path";
import fx from "./fixtures/snapshot-20261024.json";
import { effectiveWeightKg, smoothedEffective, WEIGHT_FRESH_MS } from "../calculations";
import { statusCalcSettings, highlightSegmentsAt, zoneSegments } from "../zoneSegments";
import { Feed, Settings } from "../../types";

const D = fx.D;
const feeds: Feed[] = fx.feeds;
const at = (hhmm: string) => new Date(`2026-10-24T${hhmm}:00+02:00`).getTime();
const DAY = 86_400_000;
const dayStart = at("00:00");
const current: Settings = {
  weightKg: D / 150, mlPerKgPerDay: 150, preferredBottleWaterMl: 120,
  yellowThresholdPct: 5, redThresholdPct: 10, timeFormat: "24h",
};
const zoneTimes = (sg: ReturnType<typeof zoneSegments>[number]) =>
  sg.rows.map((r) => [r.waterMl, r.stomachFitsMs, r.openMs, r.closeMs, r.state, r.landingAtOpenPct]);

describe("clock tick re-runs only the highlight", () => {
  test("advancing fake timers fetches no feeds and leaves zones identical; only the highlight moves", () => {
    jest.useFakeTimers({ now: at("16:00") });
    const fetchFeeds = jest.fn(() => feeds);
    const loaded = fetchFeeds();
    const frozen = zoneSegments(loaded, current, [], [], dayStart);
    let now = Date.now();
    const tick = jest.fn(() => { now = Date.now(); });      // what the dashboard interval does
    const id = setInterval(tick, 60_000);
    const seen: Array<number | null> = [];
    for (let i = 0; i < 90; i++) {
      jest.advanceTimersByTime(60_000);
      const shown = highlightSegmentsAt(frozen, loaded, now);
      shown.forEach((sg, k) => expect(zoneTimes(sg)).toEqual(zoneTimes(frozen[k])));
      seen.push(shown[shown.length - 1].rows.find((r) => r.isHighlighted)?.waterMl ?? null);
    }
    clearInterval(id);
    jest.useRealTimers();
    expect(tick).toHaveBeenCalledTimes(90);
    expect(fetchFeeds).toHaveBeenCalledTimes(1);
    expect(zoneSegments(loaded, current, [], [], dayStart)).toEqual(frozen); // not mutated
    expect(new Set(seen).size).toBeGreaterThan(1); // 16:01 → 17:30 walks 30 → 60 → 90 → 120
  });

  test("zoneSegments takes no display clock; the dashboard interval only sets now", () => {
    expect(zoneSegments.length).toBe(5);
    const src = fs.readFileSync(path.join(__dirname, "../dashboardRefresh.ts"), "utf8");
    const intervals = src.match(/setInterval\([^;]*\)/g) ?? [];
    expect(intervals.length).toBeGreaterThan(0);
    for (const s of intervals) {
      expect(s).not.toMatch(/load|getFeeds|zoneSegments|zonesProgression/);
    }
    const dash = fs.readFileSync(path.join(__dirname, "../../screens/DashboardScreen.tsx"), "utf8");
    expect(dash).not.toMatch(/setInterval/);
    expect(dash).toMatch(/useMemo\(\s*\(\) => zoneSegments\([^)]*\),\s*\[[^\]]*\]/);
    expect(dash).not.toMatch(/zoneSegments\([^)]*\bnow\b/);
  });
});

describe("effectiveWeightKg(refMs)", () => {
  const ref = at("09:12");
  const dob = ref - 90 * DAY;
  test("measured weight used directly when fresh", () => {
    expect(effectiveWeightKg([{ timestamp: ref - 2 * DAY, weightKg: 5.8 }], 9, dob, "F", ref)).toEqual({ weightKg: 5.8, source: "manual" });
  });
  test("7-day boundary: exactly 7 d → measured; 7 d + 1 ms → WHO", () => {
    const w = (age: number) => [{ timestamp: ref - 60 * DAY, weightKg: 4.6 }, { timestamp: ref - age, weightKg: 5.6 }];
    expect(effectiveWeightKg(w(WEIGHT_FRESH_MS), 9, dob, "F", ref)).toEqual({ weightKg: 5.6, source: "manual" });
    const who = effectiveWeightKg(w(WEIGHT_FRESH_MS + 1), 9, dob, "F", ref);
    expect(who.source).toBe("who");
    expect(who.weightKg).not.toBe(5.6);
  });
  test("weigh-ins after refMs are ignored; none before → fallback", () => {
    expect(effectiveWeightKg([{ timestamp: ref + 1, weightKg: 7 }], 6.1, dob, "F", ref)).toEqual({ weightKg: 6.1, source: "settings" });
    expect(effectiveWeightKg([{ timestamp: ref - DAY, weightKg: 5.9 }, { timestamp: ref + 1, weightKg: 7 }], 6.1, dob, "F", ref).weightKg).toBe(5.9);
  });
  test("pure: same answer whatever Date.now says", () => {
    const ws = [{ timestamp: ref - 10 * DAY, weightKg: 5.2 }, { timestamp: ref - 40 * DAY, weightKg: 4.5 }];
    const a = effectiveWeightKg(ws, 9, dob, "F", ref);
    const spy = jest.spyOn(Date, "now").mockReturnValue(ref + 30 * DAY);
    expect(effectiveWeightKg(ws, 9, dob, "F", ref)).toEqual(a);
    spy.mockRestore();
  });
});

describe("replay uses the weight at each past segment's end", () => {
  const morningFeed = at("09:12");
  const sorted = [...feeds].sort((a, b) => a.timestamp - b.timestamp);
  const morningEnd = sorted[sorted.findIndex((f) => f.timestamp === morningFeed) + 1].timestamp;
  const weights = [{ timestamp: morningFeed - 2 * DAY, weightKg: 6.0 }];
  const seg = (ws: typeof weights) => zoneSegments(feeds, current, [], ws, dayStart).find((s) => s.feed.timestamp === morningFeed)!;

  test("past segment D = effective weight at its end (next feed)", () => {
    const s = seg(weights);
    expect(s.toMs).toBe(morningEnd);
    expect(s.weightKg).toBe(6.0);
    expect(s.dailyTargetMl).toBeCloseTo(900, 6);
  });
  test("a weigh-in inside a past segment counts for it; one after its end does not", () => {
    const before = seg(weights);
    const inside = seg([...weights, { timestamp: morningFeed + 60_000, weightKg: 7.4 }]);
    expect(inside.weightKg).toBe(7.4);
    expect(inside.dailyTargetMl).toBeCloseTo(7.4 * 150, 9);
    const afterEnd = seg([...weights, { timestamp: morningEnd + 60_000, weightKg: 7.4 }]);
    expect(afterEnd.dailyTargetMl).toBe(before.dailyTargetMl);
    expect(afterEnd.rows).toEqual(before.rows);
  });
  const last = Math.max(...feeds.map((f) => f.timestamp));
  const status = (fs: Feed[], ws: typeof weights) => {
    const w = statusCalcSettings(fs, current, ws, dayStart).weightKg;
    const d = w * 150;
    return { d, pct: (smoothedEffective(fs, d / 24, 120, Math.max(...fs.map((f) => f.timestamp))).totalMl / d) * 100 };
  };
  const curSeg = (fs: Feed[], ws: typeof weights) => { const s = zoneSegments(fs, current, [], ws, dayStart); return s[s.length - 1]; };

  test("current segment and status card use the same weight", () => {
    const ws = [{ timestamp: last - DAY, weightKg: 6.2 }];
    expect(curSeg(feeds, ws).weightKg).toBe(6.2);
    expect(curSeg(feeds, ws).dailyTargetMl).toBeCloseTo(status(feeds, ws).d, 9);
    expect(curSeg(feeds, []).dailyTargetMl).toBeCloseTo(D, 6); // no weigh-ins → settings weight, like the card
  });
  test("a weigh-in after the last feed applies immediately to the current segment and status; the closed segment keeps it after the next feed", () => {
    const ws = [{ timestamp: last - DAY, weightKg: 6.2 }];
    const later = [...ws, { timestamp: last + 30 * 60_000, weightKg: 7.0 }];
    expect(curSeg(feeds, later).weightKg).toBe(7.0);
    expect(curSeg(feeds, later).dailyTargetMl).toBeCloseTo(1050, 9);
    expect(status(feeds, later).d).toBeCloseTo(1050, 9);
    expect(status(feeds, later).pct).not.toBeCloseTo(status(feeds, ws).pct, 3);
    expect(statusCalcSettings(feeds, current, later, dayStart).weightRefMs).toBe(last + 30 * 60_000);
    expect(statusCalcSettings(feeds, current, later, dayStart).refMs).toBe(last); // status time unchanged
    const open = curSeg(feeds, later);
    const next: Feed[] = [...feeds, { id: "next", timestamp: last + 3 * 3_600_000, volume: 120 }];
    const closed = zoneSegments(next, current, [], later, dayStart).find((s) => s.feed.timestamp === last)!;
    expect(closed.weightKg).toBe(7.0);
    expect(closed.rows).toEqual(open.rows);                     // no redraw after the next feed
    expect(curSeg(next, later).weightKg).toBe(7.0);
  });
});
