// t22 — refined freeze rule (design/2026-11-26-live-rules-and-weight-anchor.md §1–§3):
// status TIME is frozen at lastFeed.timestamp, but rule settings (ml/kg/day, preferred size,
// thresholds, DOB, sex) are LIVE. Each zone segment uses the rule in effect at its END: a closed
// segment the settings at the next feed, the open segment the live settings — so a stretch that ran
// under a rule change keeps that rule after the next feed (no redraw).
import fx from "./fixtures/snapshot-20261024.json";
import { deriveSettings, smoothedEffective } from "../calculations";
import { HistoryEntry } from "../settingsHistory";
import { statusCalcSettings, zoneSegments } from "../zoneSegments";
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

function card(fs: Feed[], cur: Settings) {
  // What the dashboard feeds into the status card: live rule, status time = last feed.
  const c = statusCalcSettings(fs, cur, weights, dayStart).settings;
  const d = deriveSettings(c);
  const at = Math.max(...fs.map((f) => f.timestamp));
  const ml = smoothedEffective(fs, d.hourlyRate, c.preferredBottleWaterMl, at).totalMl;
  return { D: d.dailyTargetMl, pref: c.preferredBottleWaterMl, yellow: c.yellowThresholdPct, pct: (ml / d.dailyTargetMl) * 100 };
}
const segs = (fs: Feed[], cur: Settings, hist: HistoryEntry[]) => zoneSegments(fs, cur, hist, weights, dayStart);
const cur = (fs: Feed[], c: Settings, hist: HistoryEntry[]) => {
  const s = segs(fs, c, hist);
  return s[s.length - 1];
};

test("a rule change after the last feed applies immediately to the card and the open segment", () => {
  const old = card(feeds, before);
  const now = card(feeds, live);
  expect(old).toMatchObject({ pref: 120, yellow: 5 });
  expect(now).toMatchObject({ pref: 150, yellow: 8 });
  expect(now.D).toBeCloseTo(6.2 * 170, 9);
  const s = cur(feeds, live, [snapshot, change]);
  expect(s.dailyTargetMl).toBeCloseTo(now.D, 9);             // card and open segment agree
  expect(s.preferredBottleWaterMl).toBe(150);
  expect(s.rows.map((r) => r.waterMl)).toEqual([30, 60, 90, 120, 150, 180]);
  expect(now.pct).not.toBeCloseTo(old.pct, 3);              // status % follows the live target
});

test("status TIME stays frozen at the last feed (no clock)", () => {
  const a = card(feeds, live);
  const spy = jest.spyOn(Date, "now").mockReturnValue(last + 9 * 3_600_000);
  expect(card(feeds, live)).toEqual(a);
  expect(cur(feeds, live, [snapshot, change]).rows).toEqual(cur(feeds, live, [snapshot, change]).rows);
  spy.mockRestore();
  expect(statusCalcSettings(feeds, live, weights, dayStart).refMs).toBe(last);
});

test("the history file does not override the live rule for the open segment", () => {
  // Live settings say 170 even if history still ends at 150 (e.g. history line not yet appended).
  const s = cur(feeds, live, [snapshot]);
  expect(s.dailyTargetMl).toBeCloseTo(6.2 * 170, 9);
});

test("after a new feed the closed segment keeps the rule it ran under — no redraw", () => {
  const openBefore = cur(feeds, live, [snapshot, change]);
  const next: Feed[] = [...feeds, { id: "next", timestamp: last + 3 * 3_600_000, volume: 150 }];
  const after = segs(next, live, [snapshot, change]);
  const closed = after.find((sg) => sg.feed.timestamp === last)!;
  expect(closed.isCurrent).toBe(false);
  expect(closed.toMs).toBe(last + 3 * 3_600_000);
  expect(closed.dailyTargetMl).toBeCloseTo(openBefore.dailyTargetMl, 9);
  expect(closed.preferredBottleWaterMl).toBe(openBefore.preferredBottleWaterMl);
  expect(closed.rows).toEqual(openBefore.rows);
  // and the new open segment also runs under the new rule
  const open = after[after.length - 1];
  expect(open.dailyTargetMl).toBeCloseTo(6.2 * 170, 9);
  expect(card(next, live)).toMatchObject({ pref: 150, yellow: 8 });
});

test("history before the change stays historical: a segment that ended before it keeps the old rule", () => {
  const next: Feed[] = [...feeds, { id: "next", timestamp: last + 3 * 3_600_000, volume: 150 }];
  const after = segs(next, live, [snapshot, change]);
  const earlier = after.filter((sg) => sg.toMs !== null && sg.toMs <= last);
  expect(earlier.length).toBeGreaterThan(0);
  for (const sg of earlier) {
    expect(sg.dailyTargetMl).toBeCloseTo(6.2 * 150, 9);
    expect(sg.preferredBottleWaterMl).toBe(120);
  }
});

test("a closed segment uses the rule at its END, not at its start", () => {
  // Change lands between the second-to-last and last feed: the segment ending at `last` takes it.
  const sorted = [...feeds].sort((a, b) => a.timestamp - b.timestamp);
  const prev = sorted[sorted.length - 2];
  const midAt = prev.timestamp + Math.floor((last - prev.timestamp) / 2);
  const mid: HistoryEntry = { ...change, effectiveFrom: iso(midAt), changedAt: iso(midAt) };
  const s = segs(feeds, live, [snapshot, mid]).find((sg) => sg.feed.timestamp === prev.timestamp)!;
  expect(s.toMs).toBe(last);
  expect(s.dailyTargetMl).toBeCloseTo(6.2 * 170, 9);
  expect(s.preferredBottleWaterMl).toBe(150);
});

test("display-only keys come from live settings", () => {
  const c = statusCalcSettings(feeds, { ...live, timeFormat: "12h" }, weights, dayStart).settings;
  expect(c.timeFormat).toBe("12h");
  expect(c.feedingTimelineView).toBe("zones");
  expect(c.mlPerKgPerDay).toBe(170);
});
