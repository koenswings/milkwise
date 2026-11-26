// Classic timeline (1.1.59, §11c): single 100 % readiness rule and no grey ghost markers.
import fs from "fs";
import path from "path";
import fx from "./fixtures/snapshot-20261024.json";
import * as calc from "../calculations";
import { canTakeProgression, intakeReadyAtMs, intakeLevelAtPctMs, smoothedAtTime, waterToMilk, stomachReadyAtMs } from "../calculations";
import { buildClassicMarkers } from "../classicMarkers";
import { Feed } from "../../types";

const D = fx.D, r = D / 24;
const feeds: Feed[] = fx.feeds;
const at = (hhmm: string) => new Date(`2026-10-24T${hhmm}:00+02:00`).getTime();
const landing = (w: number, t: number) => ((smoothedAtTime(feeds, r, t) + waterToMilk(w)) / D) * 100;

describe("intakeReadyAtMs — 100 % only", () => {
  test("a 100–105 % landing is no longer 'now' (old rule returned now at ≤ 105 %)", () => {
    const t = at("16:20");
    expect(landing(90, t)).toBeGreaterThan(100);
    expect(landing(90, t)).toBeLessThanOrEqual(105);
    const ready = intakeReadyAtMs(feeds, 90, r, D, t);
    expect(ready).toBeGreaterThan(t);
    expect(Math.abs(ready - at("17:05"))).toBeLessThanOrEqual(60_000);
    expect(landing(90, ready)).toBeLessThanOrEqual(100);
  });

  test("returns now iff the landing is ≤ 100 % (+1 ml tolerance)", () => {
    const t = at("17:10");
    expect(landing(90, t)).toBeLessThanOrEqual(100);
    expect(intakeReadyAtMs(feeds, 90, r, D, t)).toBe(t);
    // exactly 1 ml over the target still counts as now; more does not
    const milk = waterToMilk(90);
    const I = smoothedAtTime(feeds, r, t);
    expect(intakeReadyAtMs(feeds, 90, r, I + milk - 1, t)).toBe(t);
    expect(intakeReadyAtMs(feeds, 90, r, I + milk - 5, t)).toBeGreaterThan(t);
  });

  test("canTakeProgression readyAt = max(stomach, intake 100 % time)", () => {
    const t = at("16:20");
    for (const e of canTakeProgression(feeds, 120, t, r, D)) {
      const s = stomachReadyAtMs(feeds, e.waterMl, 120, t, r);
      const i = landing(e.waterMl, t) * D / 100 <= D + 1 ? t : intakeLevelAtPctMs(feeds, waterToMilk(e.waterMl), r, D, 100, t);
      expect(e.readyAtMs).toBe(Math.max(s, i));
    }
  });
});

describe("no ghost markers", () => {
  test("ghostIntakeReadyAtMs is not exported and not defined in the classic card", () => {
    expect((calc as Record<string, unknown>).ghostIntakeReadyAtMs).toBeUndefined();
    const src = fs.readFileSync(path.join(__dirname, "../../screens/DashboardScreen.tsx"), "utf8");
    expect(src).not.toMatch(/ghost/i); // no ghost map, clamp or markers left
  });

  test("sizes that fit now but are not advised get no marker; markers stay sorted", () => {
    const t = at("17:40"); // 30/60/90/120 fit; 120 advised; 150 in the future
    const prog = canTakeProgression(feeds, 120, t, r, D);
    expect(prog.filter((e) => e.fitsNow).map((e) => e.waterMl)).toEqual([30, 60, 90, 120]);
    const m = buildClassicMarkers(prog, feeds, 120, t);
    const sizeMarkers = m.filter((x) => x.kind === "advised" || x.kind === "future");
    expect(sizeMarkers.map((x) => [x.kind, x.waterMl])).toEqual([["advised", 120], ["future", 150]]);
    expect(m.filter((x) => x.kind === "past-feed").length).toBe(feeds.length - 1);
    expect(m.filter((x) => x.kind === "last-feed").length).toBe(1);
    expect(new Set(m.map((x) => x.kind))).toEqual(new Set(["past-feed", "last-feed", "advised", "future"]));
    for (let i = 1; i < m.length; i++) expect(m[i].ms).toBeGreaterThanOrEqual(m[i - 1].ms);
  });
});
