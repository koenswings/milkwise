// (1) Zones frozen at last feed, highlight evaluated now: a clock tick only re-runs the highlight.
// (2) Replay weight: past segments use effectiveWeightKg at the feed's own timestamp.
import fs from "fs";
import path from "path";
import fx from "./fixtures/snapshot-20261024.json";
import { effectiveWeightKg, WEIGHT_FRESH_MS } from "../calculations";
import { highlightSegmentsAt, zoneSegments } from "../zoneSegments";
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
    const frozen = zoneSegments(loaded, current, [], [], D / 150, dayStart);
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
    expect(zoneSegments(loaded, current, [], [], D / 150, dayStart)).toEqual(frozen); // not mutated
    expect(new Set(seen).size).toBeGreaterThan(1); // 16:01 → 17:30 walks 30 → 60 → 90 → 120
  });

  test("zoneSegments takes no display clock; the dashboard interval only sets now", () => {
    expect(zoneSegments.length).toBe(6);
    const src = fs.readFileSync(path.join(__dirname, "../../screens/DashboardScreen.tsx"), "utf8");
    const intervals = src.match(/setInterval\([^;]*\)/g) ?? [];
    expect(intervals.length).toBeGreaterThan(0);
    for (const s of intervals) {
      expect(s).not.toMatch(/load|getFeeds|zoneSegments|zonesProgression/);
    }
    expect(src).toMatch(/useMemo\(\s*\(\) => zoneSegments\([^)]*\),\s*\[[^\]]*\]/);
    expect(src).not.toMatch(/zoneSegments\([^)]*\bnow\b/);
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

describe("replay uses the weight at each past feed", () => {
  const morningFeed = at("09:12");
  const weights = [{ timestamp: morningFeed - 2 * DAY, weightKg: 6.0 }];
  const seg = (ws: typeof weights) => zoneSegments(feeds, current, [], ws, D / 150, dayStart).find((s) => s.feed.timestamp === morningFeed)!;

  test("past segment D = effective weight at that feed", () => {
    const s = seg(weights);
    expect(s.weightKg).toBe(6.0);
    expect(s.dailyTargetMl).toBeCloseTo(900, 6);
  });
  test("a weigh-in made after a past feed does not change that feed's target", () => {
    const before = seg(weights);
    const after = seg([...weights, { timestamp: morningFeed + 60_000, weightKg: 7.4 }]);
    expect(after.dailyTargetMl).toBe(before.dailyTargetMl);
    expect(after.rows).toEqual(before.rows);
  });
  test("current segment keeps the dashboard's D (same as the status card)", () => {
    const segs = zoneSegments(feeds, current, [], weights, D / 150, dayStart);
    expect(segs[segs.length - 1].dailyTargetMl).toBeCloseTo(D, 6);
  });
});
