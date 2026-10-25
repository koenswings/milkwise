// All calculation parameters are frozen at lastFeed.timestamp (settings history), not just weight:
// the status card and the current zone segment both read frozenCalcSettings.
import fx from "./fixtures/snapshot-20261024.json";
import { deriveSettings, smoothedEffective } from "../calculations";
import { HistoryEntry } from "../settingsHistory";
import { frozenCalcSettings, zoneSegments } from "../zoneSegments";
import { Feed, Settings } from "../../types";

const feeds: Feed[] = fx.feeds;
const last = Math.max(...feeds.map((f) => f.timestamp));
const iso = (ms: number) => new Date(ms).toISOString();
const dayStart = new Date("2026-10-24T00:00:00+02:00").getTime();
const weights = [{ timestamp: last - 86_400_000, weightKg: 6.2 }];
const base = { weightKg: 6.2, yellowThresholdPct: 5, redThresholdPct: 10, timeFormat: "24h" as const };
const snapshot: HistoryEntry = {
  v: 1, kind: "snapshot", effectiveFrom: iso(dayStart), changedAt: iso(dayStart), source: "seed", appVersion: "1.1.58",
  changes: { mlPerKgPerDay: { new: 150 }, preferredBottleWaterMl: { new: 120 }, yellowThresholdPct: { new: 5 } },
};
// Changed 30 min after the last feed: ml/kg/day 150 → 170, preferred 120 → 150, yellow 5 → 8.
const changeAt = last + 30 * 60_000;
const change: HistoryEntry = {
  v: 1, kind: "diff", effectiveFrom: iso(changeAt), changedAt: iso(changeAt), source: "web", appVersion: "1.1.59",
  changes: { mlPerKgPerDay: { old: 150, new: 170 }, preferredBottleWaterMl: { old: 120, new: 150 }, yellowThresholdPct: { old: 5, new: 8 } },
};
const before: Settings = { ...base, mlPerKgPerDay: 150, preferredBottleWaterMl: 120 };
const live: Settings = { ...base, mlPerKgPerDay: 170, preferredBottleWaterMl: 150, yellowThresholdPct: 8, feedingTimelineView: "zones" };

function card(fs: Feed[], cur: Settings, hist: HistoryEntry[]) {
  // What the dashboard feeds into the status card.
  const c = frozenCalcSettings(fs, cur, hist, weights, dayStart).settings;
  const d = deriveSettings(c);
  const at = Math.max(...fs.map((f) => f.timestamp));
  const ml = smoothedEffective(fs, d.hourlyRate, c.preferredBottleWaterMl, at).totalMl;
  return { D: d.dailyTargetMl, pref: c.preferredBottleWaterMl, yellow: c.yellowThresholdPct, pct: (ml / d.dailyTargetMl) * 100 };
}
const seg = (fs: Feed[], cur: Settings, hist: HistoryEntry[]) => {
  const s = zoneSegments(fs, cur, hist, weights, dayStart);
  const c = s[s.length - 1];
  return { D: c.dailyTargetMl, pref: c.preferredBottleWaterMl, rows: c.rows };
};

test("changing ml/kg/day, preferred size and thresholds after the last feed changes neither the card nor the current segment", () => {
  const ref = card(feeds, before, [snapshot]);
  const refSeg = seg(feeds, before, [snapshot]);
  expect(card(feeds, live, [snapshot, change])).toEqual(ref);
  expect(seg(feeds, live, [snapshot, change])).toEqual(refSeg);
  expect(ref).toMatchObject({ pref: 120, yellow: 5 });
  expect(ref.D).toBeCloseTo(6.2 * 150, 9);
  expect(refSeg.D).toBeCloseTo(ref.D, 9);                     // card and segment agree
  expect(refSeg.rows.map((r) => r.waterMl)).toEqual([30, 60, 90, 120, 150]);
});

test("after a new feed both pick up the new settings", () => {
  const next: Feed[] = [...feeds, { id: "next", timestamp: last + 3 * 3_600_000, volume: 150 }];
  const c = card(next, live, [snapshot, change]);
  const s = seg(next, live, [snapshot, change]);
  expect(c).toMatchObject({ pref: 150, yellow: 8 });
  expect(c.D).toBeCloseTo(6.2 * 170, 9);
  expect(s.D).toBeCloseTo(c.D, 9);
  expect(s.pref).toBe(150);
  expect(s.rows.map((r) => r.waterMl)).toEqual([30, 60, 90, 120, 150, 180]);
});

test("display-only keys come from live settings", () => {
  const c = frozenCalcSettings(feeds, { ...live, timeFormat: "12h" }, [snapshot, change], weights, dayStart).settings;
  expect(c.timeFormat).toBe("12h");
  expect(c.feedingTimelineView).toBe("zones");
  expect(c.mlPerKgPerDay).toBe(150);
});
