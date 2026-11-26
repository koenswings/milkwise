// Zones timeline history — pure (no clock, no fs). design/2026-10-25-feeding-zones.md §10, §11.3;
// rule settings refined by design/2026-11-26-live-rules-and-weight-anchor.md (live rules, weight anchor).
// History window = rolling 24 h before now (Koen, 2026-10-28), extended to include the last feed:
// historyWindowStart(now, lastFeedMs). Segments are built once from segmentsFromMs(feeds) =
// lastFeed.timestamp − 24 h (data only, never now); each clock tick only runs highlightSegmentsAt
// and the pure visibleSegments clip. Every actual feed cuts the diagram and starts a fresh set of zones,
// recomputed with that feed included. Each segment uses the rule in effect at its END (2026-11-26 §2):
// a closed segment the settings + effective weight at the next feed (settingsForFeed), the open
// segment the live settings + effective weight up to max(lastFeed, latest weigh-in) — never "now".
//
// Zone TIMES are computed from each segment's feed (status time frozen at the last feed); the
// highlight is evaluated now (§10). zoneSegments never takes the display clock, so a clock tick
// must only call highlightSegmentsAt.
import { Feed, Settings } from "../types";
import { WeightSource, ZoneRow, effectiveWeightKg, highlightZoneRows, smoothedAtTime, waterToMilk, zonesProgression } from "./calculations";
import { HistoryEntry, settingsForFeed } from "./settingsHistory";

export interface ZoneSegment {
  feed: Feed;             // the feed that starts this segment (zone times computed from feed.timestamp)
  fromMs: number;         // max(feed.timestamp, fromMs) — clipped again by visibleSegments
  toMs: number | null;    // next feed timestamp (cut), null for the current segment
  isCurrent: boolean;
  preferredBottleWaterMl: number;
  weightKg: number;       // effective weight used for D (at the segment's end; live for the open one)
  dailyTargetMl: number;  // formula ml
  approximate: boolean;   // rule taken from before the first history snapshot
  rows: ZoneRow[];        // highlight: past segments at their feed time; current segment at refMs until highlightSegmentsAt
}

/**
 * Segments from `fromMs` (pass segmentsFromMs(feeds) — never a value derived from now) up to the
 * last feed; the feed before `fromMs` covers fromMs → first feed. Each segment uses the rule in
 * effect at its END (design 2026-11-26 §2): a closed segment segmentEndCalcSettings at the next
 * feed's timestamp, the open (current) segment statusCalcSettings — the live settings and the
 * weight up to max(lastFeed, latest weigh-in), exactly what the status card uses. A stretch that
 * ran under a rule change therefore keeps that rule after the next feed closes it (no redraw).
 */
export function zoneSegments(
  feeds: Feed[],
  current: Settings,
  entries: HistoryEntry[],
  weights: Array<{ timestamp: number; weightKg: number }>,
  fromMs: number,
): ZoneSegment[] {
  const sorted = [...feeds].sort((a, b) => a.timestamp - b.timestamp);
  if (sorted.length === 0) return [];
  let first = sorted.findIndex(f => f.timestamp >= fromMs);
  if (first === -1) first = sorted.length - 1;       // no feed after fromMs: only the current segment
  else if (first > 0) first -= 1;                     // the feed before fromMs covers fromMs → first feed

  const out: ZoneSegment[] = [];
  for (let i = first; i < sorted.length; i++) {
    const feed = sorted[i];
    const isCurrent = i === sorted.length - 1;
    const upTo = sorted.slice(0, i + 1);
    // Rule at the segment's end: next feed (closed) or live (open — same as the status card).
    const fc = isCurrent
      ? statusCalcSettings(upTo, current, weights, feed.timestamp)
      : segmentEndCalcSettings(current, entries, weights, sorted[i + 1].timestamp);
    const s = fc.settings;
    const weightKg = fc.weightKg;
    const D = weightKg * s.mlPerKgPerDay;
    const rows = zonesProgression(upTo, s.preferredBottleWaterMl, D / 24, D, feed.timestamp);
    out.push({
      feed,
      fromMs: Math.max(feed.timestamp, fromMs),
      toMs: isCurrent ? null : sorted[i + 1].timestamp,
      isCurrent,
      preferredBottleWaterMl: s.preferredBottleWaterMl,
      weightKg,
      dailyTargetMl: D,
      approximate: fc.approximate,
      rows,
    });
  }
  return out;
}

export const HISTORY_WINDOW_MS = 24 * 3_600_000;

/** Data-only start for zoneSegments: lastFeed.timestamp − 24 h (0 with no feeds). Covers every
 * possible window, because now ≥ lastFeed ⇒ now − 24 h ≥ lastFeed − 24 h. */
export function segmentsFromMs(feeds: Feed[]): number {
  return feeds.length > 0 ? Math.max(...feeds.map(f => f.timestamp)) - HISTORY_WINDOW_MS : 0;
}

/** Visible history start for both timeline views: min(now − 24 h, lastFeed) — the last feed is
 * always shown (window extended, §10 2026-10-28). The only place `now` enters the window. */
export function historyWindowStart(nowMs: number, lastFeedMs: number | null): number {
  const w = nowMs - HISTORY_WINDOW_MS;
  return lastFeedMs === null ? w : Math.min(w, lastFeedMs);
}

/** Pure per-tick clip: drop segments that end at or before windowStart; clip a straddling
 * segment's fromMs to windowStart. Zone times and rows are untouched. */
export function visibleSegments(segments: ZoneSegment[], windowStartMs: number): ZoneSegment[] {
  return segments
    .filter(sg => sg.toMs === null || sg.toMs > windowStartMs)
    .map(sg => (sg.fromMs < windowStartMs ? { ...sg, fromMs: windowStartMs } : sg));
}

/** Classic view: logged feeds inside the window (≥ windowStart), oldest first. */
export function feedsInWindow(feeds: Feed[], windowStartMs: number): Feed[] {
  return feeds.filter(f => f.timestamp >= windowStartMs).sort((a, b) => a.timestamp - b.timestamp);
}

/**
 * Clock-tick step: re-evaluate only the current segment's highlight (landing % and
 * highlightZoneRows) at atMs. Zone open/close times are copied unchanged; inputs are not mutated.
 */
export function highlightSegmentsAt(segments: ZoneSegment[], feeds: Feed[], atMs: number): ZoneSegment[] {
  return segments.map(sg => {
    if (!sg.isCurrent) return sg;
    const upTo = feeds.filter(f => f.timestamp <= sg.feed.timestamp);
    const I = smoothedAtTime(upTo, sg.dailyTargetMl / 24, atMs);
    const rows = sg.rows.map(r => ({ ...r, landingNowPct: ((I + waterToMilk(r.waterMl)) / sg.dailyTargetMl) * 100 }));
    return { ...sg, rows: highlightZoneRows(rows, atMs) };
  });
}

/**
 * Big-cut guard (design 2026-11-26 §9): the smoothed intake at atMs as % of the daily target when
 * it already meets or exceeds the target (≥ 100 %), else null. When non-null the can-take /
 * next-feed text says "over target" instead of a ready time that may be days away.
 */
export function overTargetPct(feeds: Feed[], hourlyRate: number, dailyTargetMl: number, atMs: number): number | null {
  if (feeds.length === 0 || !(dailyTargetMl > 0)) return null;
  const pct = (smoothedAtTime(feeds, hourlyRate, atMs) / dailyTargetMl) * 100;
  return pct >= 100 ? pct : null;
}

/** Calculation parameters for one rule time (status card, or one zone segment). */
export interface FrozenCalc {
  refMs: number;           // status / segment time: lastFeed.timestamp (or noFeedRefMs), or a closed segment's end
  weightRefMs: number;     // weigh-ins up to this time count: max(refMs, latest weigh-in) for the status
  settings: Settings;      // rule settings with weightKg = effective weight; display-only keys from live settings
  weightKg: number;
  weightSource: WeightSource;
  approximate: boolean;    // rule taken from before the first history snapshot
}

function withWeight(
  s: Settings,
  current: Settings,
  weights: Array<{ timestamp: number; weightKg: number }>,
  refMs: number,
  weightRefMs: number,
  approximate: boolean,
): FrozenCalc {
  const w = effectiveWeightKg(weights, s.weightKg, s.dateOfBirthMs, s.sex, weightRefMs);
  const settings: Settings = {
    ...s,
    weightKg: w.weightKg,
    timeFormat: current.timeFormat,
    feedingTimelineView: current.feedingTimelineView,
    feedingTimelineViewMigrated: current.feedingTimelineViewMigrated,
  };
  if (settings.feedingTimelineView === undefined) delete settings.feedingTimelineView;
  if (settings.feedingTimelineViewMigrated === undefined) delete settings.feedingTimelineViewMigrated;
  return { refMs, weightRefMs, settings, weightKg: w.weightKg, weightSource: w.source, approximate };
}

/** Weight reference time for the status / open segment: max(refMs, latest weigh-in) — data only. */
export function weightRefMsFor(refMs: number, weights: Array<{ timestamp: number; weightKg: number }>): number {
  return weights.reduce((m, w) => (w.timestamp > m ? w.timestamp : m), refMs);
}

/**
 * Calculation settings for the status card and the open zone segment (design 2026-11-26 §1–§4).
 * Status TIME stays frozen at lastFeed.timestamp (refMs; noFeedRefMs only with no feeds), but the
 * rule settings (ml/kg/day, preferred size, thresholds, date of birth, sex, …) are the LIVE
 * settings, and the weight is effectiveWeightKg at max(lastFeed, latest weigh-in), so a rule
 * change or a weigh-in after the last feed applies immediately. No clock is read: live settings
 * and weigh-ins are data, reloaded on page load / focus / app foreground.
 */
export function statusCalcSettings(
  feeds: Feed[],
  current: Settings,
  weights: Array<{ timestamp: number; weightKg: number }>,
  noFeedRefMs: number,
): FrozenCalc {
  const refMs = feeds.length > 0 ? Math.max(...feeds.map(f => f.timestamp)) : noFeedRefMs;
  return withWeight(current, current, weights, refMs, weightRefMsFor(refMs, weights), false);
}

/**
 * Rule of a CLOSED zone segment: the settings in effect at its end (the next feed's timestamp,
 * settingsForFeed) and the effective weight at that time — so the segment keeps the rule it ran
 * under, before and after it closed (design 2026-11-26 §2, §4).
 */
export function segmentEndCalcSettings(
  current: Settings,
  entries: HistoryEntry[],
  weights: Array<{ timestamp: number; weightKg: number }>,
  endMs: number,
): FrozenCalc {
  const at = settingsForFeed(entries, current, { timestamp: endMs });
  return withWeight(at.settings, current, weights, endMs, endMs, at.approximate);
}
