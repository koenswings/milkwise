// Zones timeline history — pure (no clock, no fs). design/2026-10-25-feeding-zones.md §10, §11.3.
// History runs from midnight; every actual feed cuts the diagram and starts a fresh set of zones,
// recomputed with that feed included, with the settings in effect at that feed
// (settingsForFeed / settingsForReplay) and with the effective weight at that feed, never "now".
//
// Zones are frozen at the last feed; the highlight is evaluated now (§10). zoneSegments never
// takes the display clock, so a clock tick must only call highlightSegmentsAt.
import { Feed, Settings } from "../types";
import { ZoneRow, effectiveWeightKg, highlightZoneRows, smoothedAtTime, waterToMilk, zonesProgression } from "./calculations";
import { HistoryEntry, settingsForFeed, settingsForReplay } from "./settingsHistory";

export interface ZoneSegment {
  feed: Feed;             // the feed that starts this segment (refMs = feed.timestamp)
  fromMs: number;         // max(feed.timestamp, dayStartMs)
  toMs: number | null;    // next feed timestamp (cut), null for the current segment
  isCurrent: boolean;
  preferredBottleWaterMl: number;
  weightKg: number;       // effective weight used for D
  dailyTargetMl: number;  // formula ml
  approximate: boolean;   // settings before the first history snapshot
  rows: ZoneRow[];        // highlight: past segments at their feed time; current segment at refMs until highlightSegmentsAt
}

/**
 * Segments from `dayStartMs` up to the last feed. Every segment — the current one included —
 * uses the effective weight at its own feed timestamp (weigh-ins after the feed are ignored,
 * effectiveWeightKg), so a new weigh-in takes effect from the next feed. The status card uses
 * the same weight at lastFeed.timestamp (frozen status), so the two never disagree.
 */
export function zoneSegments(
  feeds: Feed[],
  current: Settings,
  entries: HistoryEntry[],
  weights: Array<{ timestamp: number; weightKg: number }>,
  dayStartMs: number,
): ZoneSegment[] {
  const sorted = [...feeds].sort((a, b) => a.timestamp - b.timestamp);
  if (sorted.length === 0) return [];
  let first = sorted.findIndex(f => f.timestamp >= dayStartMs);
  if (first === -1) first = sorted.length - 1;       // no feed today: show the segment after the last one
  else if (first > 0) first -= 1;                     // the feed before midnight covers 00:00 → first feed

  const out: ZoneSegment[] = [];
  for (let i = first; i < sorted.length; i++) {
    const feed = sorted[i];
    const isCurrent = i === sorted.length - 1;
    const upTo = sorted.slice(0, i + 1);
    const replay = isCurrent
      ? settingsForReplay(entries, current, upTo)!
      : settingsForFeed(entries, current, feed);
    const s = replay.settings;
    // Fallback (no weigh-in yet): replayed settings weight; current segment = live settings, like the status card.
    const fallbackKg = isCurrent ? current.weightKg : s.weightKg;
    const weightKg = effectiveWeightKg(weights, fallbackKg, current.dateOfBirthMs, current.sex, feed.timestamp).weightKg;
    const D = weightKg * s.mlPerKgPerDay;
    const rows = zonesProgression(upTo, s.preferredBottleWaterMl, D / 24, D, feed.timestamp);
    out.push({
      feed,
      fromMs: Math.max(feed.timestamp, dayStartMs),
      toMs: isCurrent ? null : sorted[i + 1].timestamp,
      isCurrent,
      preferredBottleWaterMl: s.preferredBottleWaterMl,
      weightKg,
      dailyTargetMl: D,
      approximate: replay.approximate,
      rows,
    });
  }
  return out;
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
 * Weight behind the frozen status card: effectiveWeightKg at lastFeed.timestamp (or at
 * `noFeedRefMs` when there are no feeds) — the same weight the current zone segment uses.
 */
export function statusWeight(
  feeds: Feed[],
  current: Settings,
  weights: Array<{ timestamp: number; weightKg: number }>,
  noFeedRefMs: number,
): ReturnType<typeof effectiveWeightKg> {
  const refMs = feeds.length > 0 ? Math.max(...feeds.map(f => f.timestamp)) : noFeedRefMs;
  return effectiveWeightKg(weights, current.weightKg, current.dateOfBirthMs, current.sex, refMs);
}
