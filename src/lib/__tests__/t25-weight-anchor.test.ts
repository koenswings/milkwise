// t25 — WHO weight anchored on the latest weigh-in, with a floor
// (design/2026-11-26-live-rules-and-weight-anchor.md §4–§8). Golden cases, identical in both repos.
import fx from "./fixtures/weights-20261126.json";
import { effectiveWeightKg, WEIGHT_FRESH_MS } from "../calculations";
import { computeZScore, estimateZChannel, latestZScore, predictWeightFromZ, predictWeightKg } from "../whoGrowth";
import { statusCalcSettings, zoneSegments } from "../zoneSegments";
import { Feed, Settings } from "../../types";

const DAY = 86_400_000;
const MONTH = (365.25 / 12) * DAY;
const dob = fx.dateOfBirthMs;
const sex = fx.sex as "F";
const live = fx.weights;
const latest = live[live.length - 1];                                     // 10.00 kg, 12 Nov 12:00
const ref = new Date("2026-11-26T15:00:00+01:00").getTime();               // a last feed on 26 Nov

describe("golden: percentile jump up (live case, 26 Nov 2026)", () => {
  test("inputs: 17 weigh-ins, latest 10.00 kg at 6.95 months, z +2.41; mean z +2.00", () => {
    expect(live).toHaveLength(17);
    expect(latest.weightKg).toBe(10);
    expect((latest.timestamp - dob) / MONTH).toBeCloseTo(6.95, 2);
    expect(latestZScore(live, dob, sex)).toBeCloseTo(2.41, 2);
    expect(estimateZChannel(live, dob, sex)).toBeCloseTo(2.0, 2);
  });
  test("old mean-z rule gave 9.72 kg — below the last weigh-in (the bug)", () => {
    const oldEst = predictWeightFromZ(estimateZChannel(live, dob, sex)!, (ref - dob) / MONTH, sex);
    expect(oldEst).toBeCloseTo(9.72, 2);
  });
  test("estimate now ≥ 10.00 kg and ≈ 10.17 kg on 26 Nov", () => {
    const w = effectiveWeightKg(live, 9.09, dob, sex, ref);
    expect(w.source).toBe("who");
    expect(w.weightKg).toBeGreaterThanOrEqual(10);
    expect(w.weightKg).toBeCloseTo(10.17, 2);
  });
  test("day-8 step is small and upward (≈ +0.09 kg), not a drop", () => {
    const fresh = effectiveWeightKg(live, 9.09, dob, sex, latest.timestamp + WEIGHT_FRESH_MS);
    const day8 = effectiveWeightKg(live, 9.09, dob, sex, latest.timestamp + WEIGHT_FRESH_MS + 1);
    expect(fresh).toEqual({ weightKg: 10, source: "manual" });
    expect(day8.source).toBe("who");
    expect(day8.weightKg - 10).toBeGreaterThan(0);
    expect(day8.weightKg - 10).toBeLessThan(0.15);
  });
  test("status card on 26 Nov shows ≈ 10.17 kg and the header z (latest) = +2.41", () => {
    const feeds: Feed[] = [{ id: "f", timestamp: ref, volume: 150 }];
    const cur: Settings = { weightKg: 9.09, mlPerKgPerDay: 80, preferredBottleWaterMl: 150, yellowThresholdPct: 5, redThresholdPct: 10, timeFormat: "24h", dateOfBirthMs: dob, sex };
    const fc = statusCalcSettings(feeds, cur, live, 0);
    expect(fc.weightKg).toBeCloseTo(10.17, 2);
    expect(fc.settings.mlPerKgPerDay * fc.weightKg).toBeCloseTo(80 * 10.17, 0);
    expect(latestZScore(live, cur.dateOfBirthMs!, sex)).toBeCloseTo(2.41, 2);
  });
});

describe("golden: jump down", () => {
  // On channel z ≈ +2.4, then a lower weigh-in (z ≈ +1.5) 10 days before ref.
  const at = (m: number) => dob + m * MONTH;
  const hist = [4, 5, 6].map((m) => ({ timestamp: at(m), weightKg: predictWeightFromZ(2.4, m, sex) }));
  const downTs = ref - 10 * DAY;
  const downKg = predictWeightFromZ(1.5, (downTs - dob) / MONTH, sex);
  const ws = [...hist, { timestamp: downTs, weightKg: downKg }];
  test("the new lower weigh-in is used: projection follows its z, the floor is the new lower value", () => {
    const w = effectiveWeightKg(ws, 9, dob, sex, ref);
    const expected = predictWeightFromZ(computeZScore(downKg, (downTs - dob) / MONTH, sex), (ref - dob) / MONTH, sex);
    expect(w.weightKg).toBeCloseTo(expected, 9);
    expect(w.weightKg).toBeGreaterThanOrEqual(downKg);
    // the old higher weigh-ins do not hold the estimate up
    const oldHigh = predictWeightFromZ(2.4, (ref - dob) / MONTH, sex);
    expect(w.weightKg).toBeLessThan(oldHigh - 0.3);
    expect(w.weightKg).toBeLessThan(hist[hist.length - 1].weightKg + 0.5);
  });
  test("a fresh lower weigh-in is used directly", () => {
    expect(effectiveWeightKg(ws, 9, dob, sex, downTs + DAY)).toEqual({ weightKg: downKg, source: "manual" });
  });
});

describe("golden: single weigh-in", () => {
  const ts = dob + 3 * MONTH;
  const kg = 6.4;
  test("the estimate follows that weigh-in's z", () => {
    const z = computeZScore(kg, 3, sex);
    const r = dob + 4 * MONTH;
    const w = effectiveWeightKg([{ timestamp: ts, weightKg: kg }], 9, dob, sex, r);
    expect(w.source).toBe("who");
    expect(w.weightKg).toBeCloseTo(predictWeightFromZ(z, 4, sex), 9);
    expect(latestZScore([{ timestamp: ts, weightKg: kg }], dob, sex)).toBeCloseTo(z, 12);
  });
});

describe("floor and edges", () => {
  test("floor: never below the latest weigh-in", () => {
    // Projection evaluated *before* the weigh-in age would be lower; the floor holds it at the measurement.
    const ts = dob + 6 * MONTH;
    const ws = [{ timestamp: ts, weightKg: 8 }];
    const w = effectiveWeightKg(ws, 9, dob, sex, ts + 8 * DAY);
    expect(w.weightKg).toBeGreaterThanOrEqual(8);
    for (let d = 8; d < 200; d += 7) {
      expect(effectiveWeightKg(ws, 9, dob, sex, ts + d * DAY).weightKg).toBeGreaterThanOrEqual(8);
    }
  });
  test("ages outside 0–24 months: latest measured weight (as before)", () => {
    const ts = dob + 25 * MONTH;
    const ws = [{ timestamp: dob + 20 * MONTH, weightKg: 11 }, { timestamp: ts, weightKg: 12.5 }];
    expect(effectiveWeightKg(ws, 9, dob, sex, ts + 30 * DAY)).toEqual({ weightKg: 12.5, source: "manual" });
    expect(latestZScore(ws, dob, sex)).toBeNull();
    expect(predictWeightKg(ws, dob, sex, ts + 30 * DAY)).toBeNull();
    // inside the data but projected past 24 months → latest measured weight
    const w2 = [{ timestamp: dob + 23.9 * MONTH, weightKg: 12 }];
    expect(effectiveWeightKg(w2, 9, dob, sex, dob + 24.5 * MONTH)).toEqual({ weightKg: 12, source: "manual" });
  });
  test("no DOB/sex: latest measured weight", () => {
    expect(effectiveWeightKg(live, 9, undefined, undefined, ref)).toEqual({ weightKg: 10, source: "manual" });
  });
  test("latestZScore is by timestamp, not array order", () => {
    const shuffled = [live[16], ...live.slice(0, 16)].reverse();
    expect(latestZScore(shuffled, dob, sex)).toBeCloseTo(latestZScore(live, dob, sex)!, 12);
  });
});

describe("weight reference time = max(lastFeed, latest weigh-in)", () => {
  const cur: Settings = { weightKg: 9.09, mlPerKgPerDay: 80, preferredBottleWaterMl: 150, yellowThresholdPct: 5, redThresholdPct: 10, timeFormat: "24h", dateOfBirthMs: dob, sex };
  const feeds: Feed[] = [{ id: "a", timestamp: ref - 3 * 3_600_000, volume: 120 }, { id: "b", timestamp: ref, volume: 150 }];
  test("a weigh-in after the last feed applies immediately (status + open segment), data only", () => {
    const ws = [...live, { timestamp: ref + 2 * 3_600_000, weightKg: 10.4 }];
    const fc = statusCalcSettings(feeds, cur, ws, 0);
    expect(fc.refMs).toBe(ref);
    expect(fc.weightRefMs).toBe(ref + 2 * 3_600_000);
    expect(fc.weightKg).toBe(10.4);
    const segs = zoneSegments(feeds, cur, [], ws, ref - DAY);
    expect(segs[segs.length - 1].weightKg).toBe(10.4);
    // the closed segment (a → b) ends at b, before the weigh-in: unchanged
    expect(segs[0].weightKg).toBeCloseTo(effectiveWeightKg(live, 9.09, dob, sex, ref).weightKg, 12);
  });
  test("pure: Date.now does not enter", () => {
    const a = statusCalcSettings(feeds, cur, live, 0);
    const spy = jest.spyOn(Date, "now").mockReturnValue(ref + 40 * DAY);
    expect(statusCalcSettings(feeds, cur, live, 0)).toEqual(a);
    spy.mockRestore();
  });
});
