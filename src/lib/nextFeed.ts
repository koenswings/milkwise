// Next-feed predictor — exact port of web baby-milk-tracker src/lib/calculations.ts
// (`findTargetAwareNext` + `nextFeedTime`, lines ~160-255, OUTSIDE the shared feeding-zones block;
// `NextFeedResult` lives in web src/types/index.ts). The bodies below are copied verbatim; only the
// imports and the local NextFeedResult declaration differ. No new math.
//
// Mobile wrapper `nextFeedAtLastFeed` applies the invariants: everything frozen at
// lastFeed.timestamp, with frozenCalcSettings (settings history + effectiveWeightKg).
import { Feed } from '../types';
import { deriveSettings, smoothedAtTime, smoothedEffective, waterToMilk } from './calculations';
import type { FrozenCalc } from './zoneSegments';

export interface NextFeedResult {
  timestamp: number;              // suggested next feed time (ms)
  balanceMl: number;              // energy balance ml (+ overfed, - underfed)
  capped: boolean;                // true if cap was applied
}

// ── BEGIN PORT: web calculations.ts findTargetAwareNext … nextFeedTime ──
/**
 * Predictor 3 — Target-aware adjusted next bottle (T*)
 *
 * Find T* such that smoothed(T*) = dailyTargetMl − milkPerBottle.
 * Giving a standard bottle at T* produces smoothed = dailyTargetMl exactly (if not capped).
 *
 * Uses binary search over [lastFeed, lastFeed + maxCorrectionMs].
 * Falls back to T_min when underfed (smoothed already below target − bottle).
 */
function findTargetAwareNext(
  feeds: Feed[],
  hourlyRate: number,
  dailyTargetMl: number,
  lastFeed: Feed,
  standardNext: number,
  maxCorrectionMs: number,
  nextBottleMilkMl: number
): { timestamp: number; capped: boolean } {
  const targetBefore = dailyTargetMl - nextBottleMilkMl;
  const T_min = lastFeed.timestamp;
  const T_max = standardNext + maxCorrectionMs;

  const s_min = smoothedAtTime(feeds, hourlyRate, T_min);

  // Underfed: smoothed already ≤ target-before-feed → give now
  if (s_min <= targetBefore) {
    return { timestamp: T_min, capped: false };
  }

  const s_max = smoothedAtTime(feeds, hourlyRate, T_max);

  // Still overfed at max gap → cap applies
  if (s_max > targetBefore) {
    return { timestamp: T_max, capped: true };
  }

  // Binary search for T* where smoothed(T*) = targetBefore
  let lo = T_min, hi = T_max;
  for (let i = 0; i < 30; i++) {
    const mid = Math.floor((lo + hi) / 2);
    if (smoothedAtTime(feeds, hourlyRate, mid) > targetBefore) {
      lo = mid;
    } else {
      hi = mid;
    }
    if (hi - lo < 60_000) break; // 1-minute precision
  }
  return { timestamp: Math.floor((lo + hi) / 2), capped: false };
}

/** @deprecated Use computePredictors instead. Kept for backward compatibility. */
interface LegacyPredictorSettings {
  maxCorrectionPct: number;
  useTargetAwarePredictor: boolean;
  nextBottleWaterMl: number;
}

export function nextFeedTime(
  feeds: Feed[],
  hourlyRate: number,
  smoothedTotal: number,
  dailyTargetMl: number,
  settings: LegacyPredictorSettings
): NextFeedResult | null {
  if (feeds.length === 0) return null;

  const lastFeed = feeds.reduce((a, b) => (a.timestamp > b.timestamp ? a : b));
  // Use the NEXT bottle size for the standard interval and T_max window.
  // P3 is planning when to give the next bottle — its interval is how long that
  // bottle lasts, not how long the last bottle lasted.
  const nextBottleMilkMl = waterToMilk(settings.nextBottleWaterMl);
  const standardIntervalMs = (nextBottleMilkMl / hourlyRate) * 3_600_000;
  const standardNext = lastFeed.timestamp + standardIntervalMs;
  const maxCorrectionMs = standardIntervalMs * (settings.maxCorrectionPct / 100);

  if (settings.useTargetAwarePredictor) {
    // Predictor 3: T* binary search
    const { timestamp, capped } = findTargetAwareNext(
      feeds, hourlyRate, dailyTargetMl, lastFeed, standardNext, maxCorrectionMs, nextBottleMilkMl
    );
    const surplus = smoothedTotal - dailyTargetMl;
    return { timestamp, balanceMl: Math.round(surplus), capped };
  } else {
    // Predictor 2: Formula S
    const surplus = smoothedTotal - dailyTargetMl;
    const rawCorrectionMs = (surplus / hourlyRate) * 3_600_000;
    const clampedCorrection = Math.max(-maxCorrectionMs, Math.min(maxCorrectionMs, rawCorrectionMs));
    const timestamp = standardNext + clampedCorrection;
    const capped = Math.abs(clampedCorrection - rawCorrectionMs) > 1;
    return { timestamp, balanceMl: Math.round(surplus), capped };
  }
}
// ── END PORT ──

/**
 * Predictor frozen at lastFeed.timestamp: hourly rate and D from `fc` (frozenCalcSettings —
 * settings history + effective weight at the last feed); smoothedTotal = smoothedEffective at
 * the last feed (same value as the status card). Never reads the clock. The legacy predictor
 * options are passed by the caller (they are no longer persisted settings on either app).
 */
export function nextFeedAtLastFeed(
  feeds: Feed[],
  fc: FrozenCalc,
  options: { maxCorrectionPct: number; useTargetAwarePredictor: boolean; nextBottleWaterMl?: number },
): NextFeedResult | null {
  if (feeds.length === 0) return null;
  const d = deriveSettings(fc.settings);
  const lastTs = Math.max(...feeds.map(f => f.timestamp));
  const smoothedTotal = smoothedEffective(feeds, d.hourlyRate, fc.settings.preferredBottleWaterMl, lastTs).totalMl;
  return nextFeedTime(feeds, d.hourlyRate, smoothedTotal, d.dailyTargetMl, {
    maxCorrectionPct: options.maxCorrectionPct,
    useTargetAwarePredictor: options.useTargetAwarePredictor,
    nextBottleWaterMl: options.nextBottleWaterMl ?? fc.settings.preferredBottleWaterMl,
  });
}
