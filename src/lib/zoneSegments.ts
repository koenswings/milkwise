// Zones timeline history — pure (no clock, no fs). design/2026-10-25-feeding-zones.md §10, §11.3.
// History window = rolling 24 h before now (Koen, 2026-10-28), extended to include the last feed:
// historyWindowStart(now, lastFeedMs). Segments are built once from segmentsFromMs(feeds) =
// lastFeed.timestamp − 24 h (data only, never now); each clock tick only runs highlightSegmentsAt
// and the pure visibleSegments clip. Every actual feed cuts the diagram and starts a fresh set of zones,
// recomputed with that feed included, with the settings in effect at that feed
// (settingsForFeed / settingsForReplay) and with the effective weight at that feed, never "now".
//
// Zones are frozen at the last feed; the highlight is evaluated now (§10). zoneSegments never
// takes the display clock, so a clock tick must only call highlightSegmentsAt.
import { Feed, Settings } from "../types";
import { WeightSource, ZoneRow, effectiveWeightKg, highlightZoneRows, smoothedAtTime, waterToMilk, zonesProgression } from "./calculations";
import { HistoryEntry, settingsForFeed } from "./settingsHistory";

export interface ZoneSegment {
  feed: Feed;             // the feed that starts this segment (refMs = feed.timestamp)
  fromMs: number;         // max(feed.timestamp, fromMs) — clipped again by visibleSegments
  toMs: number | null;    // next feed timestamp (cut), null for the current segment
  isCurrent: boolean;
  preferredBottleWaterMl: number;
  weightKg: number;       // effective weight used for D
  dailyTargetMl: number;  // formula ml
  approximate: boolean;   // settings before the first history snapshot
  rows: ZoneRow[];        // highlight: past segments at their feed time; current segment at refMs until highlightSegmentsAt
}

/**
 * Segments from `fromMs` (pass segmentsFromMs(feeds) — never a value derived from now) up to the
 * last feed; the feed before `fromMs` covers fromMs → first feed. Every segment — the current one included —
 * uses frozenCalcSettings at its own feed timestamp (settings history + effective weight; later
 * settings changes and weigh-ins are ignored), so changes take effect from the next feed. The
 * status card uses the same function at lastFeed.timestamp, so the two never disagree.
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
    // Same function as the status card: every calc param + weight frozen at this feed.
    const fc = frozenCalcSettings(upTo, current, entries, weights, feed.timestamp);
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

/** Every calculation parameter frozen at one reference time (the last feed). */
export interface FrozenCalc {
  refMs: number;           // lastFeed.timestamp, or noFeedRefMs when there are no feeds
  settings: Settings;      // settingsAt(refMs) with weightKg = effective weight; display-only keys from live settings
  weightKg: number;
  weightSource: WeightSource;
  approximate: boolean;    // refMs before the first history snapshot
}

/**
 * Calculation settings for the frozen status card and the current zone segment:
 * settingsForFeed (settings history) at lastFeed.timestamp for ml/kg/day, preferred size,
 * thresholds and every other calc param, plus effectiveWeightKg at that time. Settings or
 * weigh-ins changed after the last feed take effect from the next feed. Display-only keys
 * (timeFormat, feedingTimelineView, its marker) always come from the live settings.
 */
export function frozenCalcSettings(
  feeds: Feed[],
  current: Settings,
  entries: HistoryEntry[],
  weights: Array<{ timestamp: number; weightKg: number }>,
  noFeedRefMs: number,
): FrozenCalc {
  const refMs = feeds.length > 0 ? Math.max(...feeds.map(f => f.timestamp)) : noFeedRefMs;
  const at = feeds.length > 0 ? settingsForFeed(entries, current, { timestamp: refMs }) : { settings: current, approximate: false };
  const s = at.settings;
  const w = effectiveWeightKg(weights, s.weightKg, s.dateOfBirthMs, s.sex, refMs);
  const settings: Settings = {
    ...s,
    weightKg: w.weightKg,
    timeFormat: current.timeFormat,
    feedingTimelineView: current.feedingTimelineView,
    feedingTimelineViewMigrated: current.feedingTimelineViewMigrated,
  };
  if (settings.feedingTimelineView === undefined) delete settings.feedingTimelineView;
  if (settings.feedingTimelineViewMigrated === undefined) delete settings.feedingTimelineViewMigrated;
  return { refMs, settings, weightKg: w.weightKg, weightSource: w.source, approximate: at.approximate };
}
