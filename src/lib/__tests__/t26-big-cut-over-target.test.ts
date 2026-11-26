// t26 — big cut to ml/kg (design/2026-11-26-live-rules-and-weight-anchor.md §9): the live target
// nearly halves while intake stays fact. Progress jumps over 100 %; the can-take text must say
// "over target" instead of a ready time far in the future. Zone bounds follow the live target.
import fx from "./fixtures/snapshot-20261024.json";
import { canTakeProgression, smoothedAtTime, zonesProgression } from "../calculations";
import { overTargetPct, statusCalcSettings, zoneSegments } from "../zoneSegments";
import { Feed, Settings } from "../../types";

const feeds: Feed[] = fx.feeds;
const last = Math.max(...feeds.map((f) => f.timestamp));
const now = last + 3 * 3_600_000; // display clock, 3 h after the last feed
const s150: Settings = { weightKg: fx.D / 150, mlPerKgPerDay: 150, preferredBottleWaterMl: 120, yellowThresholdPct: 5, redThresholdPct: 10, timeFormat: "24h" };
const s80: Settings = { ...s150, mlPerKgPerDay: 80 };
const D = (s: Settings) => statusCalcSettings(feeds, s, [], 0).weightKg * s.mlPerKgPerDay;

test("150 → 80 ml/kg: intake unchanged, progress jumps over 100 %", () => {
  const I150 = smoothedAtTime(feeds, D(s150) / 24, now);
  const I80 = smoothedAtTime(feeds, D(s80) / 24, now);
  expect(I150 / D(s150)).toBeLessThan(1);
  expect(I80 / D(s80)).toBeGreaterThan(1);
  expect(overTargetPct(feeds, D(s150) / 24, D(s150), now)).toBeNull();
  const pct = overTargetPct(feeds, D(s80) / 24, D(s80), now);
  expect(pct).not.toBeNull();
  expect(pct!).toBeGreaterThanOrEqual(100);
});

test("over target: no bottle is advised now, and the ready time is far away (why the text says 'over target')", () => {
  const prog = canTakeProgression(feeds, 120, now, D(s80) / 24, D(s80));
  expect(prog.some((e) => e.fitsNow)).toBe(false);
  expect(Math.min(...prog.map((e) => e.readyAtMs)) - now).toBeGreaterThan(6 * 3_600_000);
  // under the old 150 rule a bottle fits now
  expect(canTakeProgression(feeds, 120, now, D(s150) / 24, D(s150)).some((e) => e.fitsNow)).toBe(true);
});

test("zone open/close follow the live target — open segment and status agree", () => {
  const segs = zoneSegments(feeds, s80, [], [], last - 86_400_000);
  const cur = segs[segs.length - 1];
  expect(cur.dailyTargetMl).toBeCloseTo(D(s80), 9);
  expect(cur.rows).toEqual(zonesProgression(feeds, 120, D(s80) / 24, D(s80), last));
});

test("overTargetPct edges: no feeds / no target → null; exactly 100 % counts as over", () => {
  expect(overTargetPct([], 40, 960, last)).toBeNull();
  expect(overTargetPct(feeds, 40, 0, last)).toBeNull();
  const I = smoothedAtTime(feeds, 40, last);
  expect(overTargetPct(feeds, 40, I, last)).toBeCloseTo(100, 9);
});
