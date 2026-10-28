// Rolling 24 h history window (Koen, 2026-10-28; design §10): zones + Classic, both apps.
// Segments are built from lastFeed − 24 h (data only); `now` only enters via historyWindowStart.
import { effectiveWeightKg } from "../calculations";
import { buildClassicMarkers } from "../classicMarkers";
import { HistoryEntry } from "../settingsHistory";
import {
  feedsInWindow, highlightSegmentsAt, historyWindowStart, segmentsFromMs, visibleSegments, zoneSegments, HISTORY_WINDOW_MS,
} from "../zoneSegments";
import { Feed, Settings } from "../../types";

const H = 3_600_000;
const NOW = new Date(2026, 9, 24, 10, 0, 0, 0).getTime();          // local 24/10 10:00
const base: Settings = {
  weightKg: 6, mlPerKgPerDay: 150, preferredBottleWaterMl: 120, yellowThresholdPct: 5, redThresholdPct: 10, timeFormat: "24h",
};
const feed = (id: string, ms: number, volume = 120): Feed => ({ id, timestamp: ms, volume });
const build = (feeds: Feed[], hist: HistoryEntry[] = [], weights: Array<{ timestamp: number; weightKg: number }> = []) =>
  zoneSegments(feeds, base, hist, weights, segmentsFromMs(feeds));
const lastOf = (feeds: Feed[]) => Math.max(...feeds.map((f) => f.timestamp));
const shown = (feeds: Feed[], now: number, segs = build(feeds)) =>
  visibleSegments(highlightSegmentsAt(segs, feeds, now), historyWindowStart(now, lastOf(feeds)));

test("window = min(now − 24 h, last feed)", () => {
  expect(HISTORY_WINDOW_MS).toBe(24 * H);
  expect(historyWindowStart(NOW, NOW - 2 * H)).toBe(NOW - 24 * H);
  expect(historyWindowStart(NOW, NOW - 25 * H)).toBe(NOW - 25 * H);
  expect(historyWindowStart(NOW, null)).toBe(NOW - 24 * H);
});

test("23 h: a feed 23 h ago is shown unclipped (zones and Classic)", () => {
  const feeds = [feed("a", NOW - 23 * H), feed("b", NOW - 20 * H), feed("c", NOW - 2 * H)];
  const vis = shown(feeds, NOW);
  expect(vis.map((s) => s.feed.id)).toEqual(["a", "b", "c"]);
  expect(vis[0].fromMs).toBe(NOW - 23 * H);
  expect(feedsInWindow(feeds, historyWindowStart(NOW, lastOf(feeds))).map((f) => f.id)).toEqual(["a", "b", "c"]);
});

test("25 h: straddling segment clipped to now − 24 h, earlier one dropped; Classic omits the 25 h feed", () => {
  const feeds = [feed("x", NOW - 30 * H), feed("a", NOW - 25 * H), feed("b", NOW - 20 * H), feed("c", NOW - 2 * H)];
  const segs = build(feeds);
  const vis = shown(feeds, NOW, segs);
  expect(vis.map((s) => s.feed.id)).toEqual(["a", "b", "c"]);              // x ends at −25 h → dropped
  expect(vis[0].fromMs).toBe(NOW - 24 * H);                                // a straddles → clipped
  expect(vis[0].rows).toEqual(highlightSegmentsAt(segs, feeds, NOW).find((s) => s.feed.id === "a")!.rows); // zones untouched
  const cf = feedsInWindow(feeds, historyWindowStart(NOW, lastOf(feeds)));
  expect(cf.map((f) => f.id)).toEqual(["b", "c"]);
  expect(cf.every((f) => f.timestamp >= NOW - 24 * H)).toBe(true);
});

test("extend: a last feed older than 24 h is still shown (window extended to it)", () => {
  const feeds = [feed("old", NOW - 31 * H), feed("last", NOW - 25 * H)];
  const ws = historyWindowStart(NOW, lastOf(feeds));
  expect(ws).toBe(NOW - 25 * H);
  const vis = shown(feeds, NOW);
  expect(vis.map((s) => s.feed.id)).toEqual(["last"]);
  expect(vis[0].isCurrent).toBe(true);
  expect(vis[0].fromMs).toBe(NOW - 25 * H);
  const markers = buildClassicMarkers([], feedsInWindow(feeds, ws), 120, NOW);
  expect(markers.map((m) => [m.kind, m.ms])).toEqual([["last-feed", NOW - 25 * H]]);
});

test("feeds before midnight are replayed with settingsForFeed + effectiveWeightKg at their own time", () => {
  const midnight = new Date(2026, 9, 24, 0, 0, 0, 0).getTime();
  const evening = midnight - 4 * H;                         // 23/10 20:00 — inside the 24 h window
  const feeds = [feed("e", evening), feed("n", midnight + 3 * H), feed("m", midnight + 8 * H)];
  const weights = [{ timestamp: evening - H, weightKg: 5 }, { timestamp: midnight + 2 * H, weightKg: 6 }];
  const iso = (ms: number) => new Date(ms).toISOString();
  const t0 = midnight - 2 * 86_400_000;
  const hist: HistoryEntry[] = [
    { v: 1, kind: "snapshot", effectiveFrom: iso(t0), changedAt: iso(t0), source: "seed", appVersion: "1.1.61",
      changes: { mlPerKgPerDay: { new: 150 }, preferredBottleWaterMl: { new: 120 } } },
    { v: 1, kind: "diff", effectiveFrom: iso(midnight + H), changedAt: iso(midnight + H), source: "web", appVersion: "1.1.61",
      changes: { mlPerKgPerDay: { old: 150, new: 170 } } },
  ];
  const vis = shown(feeds, NOW, build(feeds, hist, weights));
  expect(vis.map((s) => s.feed.id)).toEqual(["e", "n", "m"]);
  const e = vis[0];
  expect(e.feed.timestamp).toBeLessThan(midnight);
  expect(e.fromMs).toBe(evening);                                         // not cut at midnight
  expect(e.weightKg).toBe(effectiveWeightKg(weights, 6, undefined, undefined, evening).weightKg);
  expect(e.weightKg).toBe(5);
  expect(e.dailyTargetMl).toBeCloseTo(5 * 150, 9);
  expect(vis[1].dailyTargetMl).toBeCloseTo(6 * 170, 9);
});

test("frozen under moving now: 23 h → 25 h changes only visibility and highlight, never zone times or the clock", () => {
  const feeds = [feed("a", NOW - 23 * H), feed("b", NOW - 20 * H), feed("c", NOW - 2 * H)];
  const spy = jest.spyOn(Date, "now");
  const segs = build(feeds);
  const snapshot = JSON.parse(JSON.stringify(segs));
  expect(segmentsFromMs(feeds)).toBe(NOW - 2 * H - 24 * H);              // depends on data only
  const early = shown(feeds, NOW, segs);
  const later = shown(feeds, NOW + 2 * H, segs);                          // feed a is now 25 h old
  expect(early.map((s) => s.feed.id)).toEqual(["a", "b", "c"]);
  expect(later.map((s) => s.feed.id)).toEqual(["a", "b", "c"]);
  expect(later[0].fromMs).toBe(NOW + 2 * H - 24 * H);                     // clipped, not dropped
  const times = (s: (typeof segs)[number]) => s.rows.map((r) => [r.waterMl, r.openMs, r.closeMs, r.state]);
  for (let i = 0; i < 3; i++) expect(times(later[i])).toEqual(times(early[i]));
  expect(JSON.parse(JSON.stringify(segs))).toEqual(snapshot);             // not mutated
  expect(build(feeds)).toEqual(segs);                                     // rebuild is identical
  expect(spy).not.toHaveBeenCalled();
  spy.mockRestore();
});

test("Dashboard Classic and Zones use the same rolling window (no midnight filter)", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const src: string = require("fs").readFileSync(require("path").resolve(__dirname, "../../screens/DashboardScreen.tsx"), "utf8");
  expect(src).toContain("buildClassicMarkers(progression, feedsInWindow(feeds, windowStartMs)");
  expect(src).toContain("const windowStartMs = historyWindowStart(now, lastFeedMs)");
  expect(src).toContain("const startMs = windowStartMs;");
  expect(src).not.toMatch(/setHours\(0, 0, 0, 0\)/);
});
