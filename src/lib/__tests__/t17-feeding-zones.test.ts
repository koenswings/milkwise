// Feeding zones (1.1.59) — zone math, sizes, highlight, horizon, replay.
// design/2026-10-25-feeding-zones.md §3.2, §4.1, §10. Fixture = 24/10 14:31 CEST snapshot (§4.1 table).
import fx from "./fixtures/snapshot-20261024.json";
import {
  intakeZone, intakeLevelAtPctMs, zonesProgression, highlightZoneRows, smoothedAtTime, waterToMilk, ZoneRow,
} from "../calculations";
import { zoneSegments } from "../zoneSegments";
import { HistoryEntry } from "../settingsHistory";
import { Feed, Settings } from "../../types";

const D = fx.D, r = D / 24, PREF = 120;
const feeds: Feed[] = fx.feeds;
const last = Math.max(...feeds.map((f) => f.timestamp));
const at = (hhmm: string) => new Date(`2026-10-24T${hhmm}:00+02:00`).getTime();
const MIN = 60_000;
const near = (ms: number | null, hhmm: string) => {
  expect(ms).not.toBeNull();
  expect(Math.abs((ms as number) - at(hhmm))).toBeLessThanOrEqual(MIN);
};
const pctAt = (fs: Feed[], w: number, t: number, d = D) => ((smoothedAtTime(fs, d / 24, t) + waterToMilk(w)) / d) * 100;

describe("zone math (§3.2, §4.1 table)", () => {
  const rows = zonesProgression(feeds, PREF, r, D, last);
  const row = (w: number) => rows.find((x) => x.waterMl === w)!;

  test("open = max(S, t105), close = t100 — 24/10 table ±1 min", () => {
    near(row(30).openMs, "15:08"); near(row(30).closeMs, "16:12");
    near(row(60).openMs, "15:44"); near(row(60).closeMs, "16:34");
    near(row(90).openMs, "16:09"); near(row(90).closeMs, "17:05");
    near(row(120).openMs, "16:30"); near(row(120).closeMs, "17:28");
    for (const w of [30, 60, 90, 120]) {
      const z = row(w);
      const t105 = intakeLevelAtPctMs(feeds, waterToMilk(w), r, D, 105, last);
      expect(z.state).toBe("zone");
      expect(z.openMs).toBe(Math.max(z.stomachFitsMs, t105));
      expect(z.closeMs).toBe(intakeLevelAtPctMs(feeds, waterToMilk(w), r, D, 100, last));
      expect(z.landingAtOpenPct).toBeLessThanOrEqual(105 + 1e-6);
      expect(z.landingAtOpenPct).toBeGreaterThan(100);
    }
  });

  test("150 is collapsed: from 17:54, lands ~98.8 %", () => {
    const z = row(150);
    expect(z.state).toBe("collapsed");
    expect(z.closeMs).toBeNull();
    near(z.openMs, "17:54");
    expect(z.landingAtOpenPct).toBeCloseTo(98.8, 1);
  });

  test("stomach-limited open: open = S and start % < 105", () => {
    const fs = feeds.slice(0, 15); // after the 12:00 feed
    const ref = fs[14].timestamp;
    const z = intakeZone(fs, 150, 120, r, D, ref);
    expect(z.state).toBe("zone");
    expect(z.openMs).toBe(z.stomachFitsMs);
    expect(z.openMs).toBeGreaterThan(intakeLevelAtPctMs(fs, waterToMilk(150), r, D, 105, ref));
    expect(z.landingAtOpenPct).toBeLessThan(105);
    expect(z.landingAtOpenPct).toBeGreaterThan(100);
  });

  test("collapsed iff I(S) + B <= D (both sides of the boundary, every feed of the fixture)", () => {
    let real = 0, collapsed = 0;
    for (let k = 1; k <= feeds.length; k++) {
      const fs = feeds.slice(0, k);
      const ref = fs[k - 1].timestamp;
      for (const w of [30, 60, 90, 120, 150]) {
        const z = intakeZone(fs, w, PREF, r, D, ref);
        const landsAtS = pctAt(fs, w, z.stomachFitsMs);
        if (landsAtS > 100.01) { expect(z.state).toBe("zone"); real++; }
        if (landsAtS <= 100) { expect(z.state).toBe("collapsed"); collapsed++; }
      }
    }
    expect(real).toBeGreaterThan(0);
    expect(collapsed).toBeGreaterThan(0);
  });

  test("works in water ml: milkMl is the formula conversion of the water size", () => {
    expect(row(90).milkMl).toBe(100);
    expect(row(120).milkMl).toBe(135);
  });
});

test("sizes shown = 30 … preferred + 1", () => {
  const sizes = (p: number) => zonesProgression(feeds, p, r, D, last).map((x) => x.waterMl);
  expect(sizes(60)).toEqual([30, 60, 90]);
  expect(sizes(120)).toEqual([30, 60, 90, 120, 150]);
  expect(sizes(210)).toEqual([30, 60, 90, 120, 150, 180, 210]);
  expect(zonesProgression(feeds, 120, r, D, last).filter((x) => x.isPreferred).map((x) => x.waterMl)).toEqual([120]);
});

describe("highlight (§10)", () => {
  const hl = (t: number) => zonesProgression(feeds, PREF, r, D, last, t).filter((x) => x.isHighlighted);

  test("in zone: closest to 100 % (16:11 → 30; 16:20 → 60; 16:40 → 90)", () => {
    expect(hl(at("16:11")).map((x) => [x.waterMl, x.highlightKind])).toEqual([[30, "in-zone"]]);
    expect(hl(at("16:20")).map((x) => x.waterMl)).toEqual([60]);
    expect(hl(at("16:40")).map((x) => x.waterMl)).toEqual([90]);
  });

  test("none in zone → largest fitting size under target", () => {
    const h = hl(at("17:40"));
    expect(h.map((x) => [x.waterMl, x.highlightKind])).toEqual([[120, "under-target"]]);
    expect(h[0].landingNowPct).toBeLessThanOrEqual(100);
  });

  test("nothing fits → no highlight", () => {
    expect(hl(last)).toEqual([]);
  });

  test("tie → larger size", () => {
    const mk = (w: number, pct: number): ZoneRow => ({
      waterMl: w, milkMl: w, stomachFitsMs: 0, openMs: 0, closeMs: 10, state: "zone", landingAtOpenPct: 105,
      isPreferred: false, isHighlighted: false, highlightKind: null, landingNowPct: pct,
    });
    const rows = highlightZoneRows([mk(30, 102), mk(60, 101), mk(90, 101)], 5);
    expect(rows.filter((x) => x.isHighlighted).map((x) => x.waterMl)).toEqual([90]);
  });
});

test("48 h cap → beyond-horizon", () => {
  const t0 = at("12:00");
  const heavy: Feed[] = Array.from({ length: 10 }, (_, i) => ({ id: `h${i}`, timestamp: t0 - i * 3_600_000, volume: 210 }));
  const z = intakeZone(heavy, 30, 120, 100 / 24, 100, t0);
  expect(z.state).toBe("beyond-horizon");
  expect(z.openMs).toBeGreaterThanOrEqual(t0 + 48 * 3_600_000);
});

describe("determinism and replay", () => {
  test("zones depend only on inputs, never on Date.now()", () => {
    const a = zonesProgression(feeds, PREF, r, D, last, at("16:20"));
    const spy = jest.spyOn(Date, "now").mockReturnValue(at("23:59") + 5 * 86_400_000);
    const b = zonesProgression(feeds, PREF, r, D, last, at("16:20"));
    spy.mockRestore();
    expect(b).toEqual(a);
  });

  test("past segments use the settings in effect at that feed (settingsForFeed), cut by the next feed", () => {
    const current: Settings = {
      weightKg: D / 150, mlPerKgPerDay: 150, preferredBottleWaterMl: 120,
      yellowThresholdPct: 5, redThresholdPct: 10, timeFormat: "24h",
    };
    const iso = (hhmm: string) => `2026-10-24T${hhmm}:00+02:00`;
    const history: HistoryEntry[] = [
      { v: 1, kind: "snapshot", effectiveFrom: iso("00:00"), changedAt: iso("00:00"), source: "seed", appVersion: "1.1.57",
        changes: { preferredBottleWaterMl: { new: 90 } } },
      { v: 1, kind: "diff", effectiveFrom: iso("11:00"), changedAt: iso("11:00"), source: "web", appVersion: "1.1.58",
        changes: { preferredBottleWaterMl: { old: 90, new: 120 } } },
    ];
    const dayStart = at("00:00");
    const segs = zoneSegments(feeds, current, history, D / 150, dayStart, at("16:20"));
    const morning = segs.find((s) => s.feed.timestamp === at("09:12"))!;
    const after = segs.find((s) => s.feed.timestamp === at("12:00"))!;
    expect(morning.preferredBottleWaterMl).toBe(90);
    expect(morning.rows.map((x) => x.waterMl)).toEqual([30, 60, 90, 120]);
    expect(morning.toMs).toBe(after.feed.timestamp);
    expect(after.preferredBottleWaterMl).toBe(120);
    expect(after.rows.map((x) => x.waterMl)).toEqual([30, 60, 90, 120, 150]);
    // the current segment is frozen at lastFeed.timestamp (refMs) and equals a direct computation
    const cur = segs[segs.length - 1];
    expect(cur.isCurrent).toBe(true);
    expect(cur.feed.timestamp).toBe(last);
    expect(cur.rows).toEqual(zonesProgression(feeds, 120, r, D, last, at("16:20")));
    // history starts with the feed that covers midnight
    expect(segs[0].feed.timestamp).toBeLessThan(dayStart);
    expect(segs[0].fromMs).toBe(dayStart);
  });
});
