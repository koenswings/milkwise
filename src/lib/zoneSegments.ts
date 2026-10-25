// Zones timeline history — pure (no clock, no fs). design/2026-10-25-feeding-zones.md §10, §11.3.
// History runs from midnight; every actual feed cuts the diagram and starts a fresh set of zones,
// recomputed with that feed included and with the settings in effect at that feed
// (settingsForFeed / settingsForReplay), never "now".
import { Feed, Settings } from "../types";
import { ZoneRow, zonesProgression } from "./calculations";
import { HistoryEntry, settingsForFeed, settingsForReplay } from "./settingsHistory";

export interface ZoneSegment {
  feed: Feed;             // the feed that starts this segment (refMs = feed.timestamp)
  fromMs: number;         // max(feed.timestamp, dayStartMs)
  toMs: number | null;    // next feed timestamp (cut), null for the current segment
  isCurrent: boolean;
  preferredBottleWaterMl: number;
  dailyTargetMl: number;  // formula ml
  approximate: boolean;   // settings before the first history snapshot
  rows: ZoneRow[];
}

/**
 * Segments from `dayStartMs` up to now. `weightKg` is the effective weight used for D (the
 * same value the dashboard uses); preferred size and ml/kg/day come from the settings history.
 * The current segment's highlight is evaluated at `atMs` (the display clock); past segments
 * are evaluated at their own feed time.
 */
export function zoneSegments(
  feeds: Feed[],
  current: Settings,
  entries: HistoryEntry[],
  weightKg: number,
  dayStartMs: number,
  atMs: number,
): ZoneSegment[] {
  const sorted = [...feeds].filter(f => f.timestamp <= atMs).sort((a, b) => a.timestamp - b.timestamp);
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
    const D = weightKg * s.mlPerKgPerDay;
    const rows = zonesProgression(upTo, s.preferredBottleWaterMl, D / 24, D, feed.timestamp, isCurrent ? atMs : feed.timestamp);
    out.push({
      feed,
      fromMs: Math.max(feed.timestamp, dayStartMs),
      toMs: isCurrent ? null : sorted[i + 1].timestamp,
      isCurrent,
      preferredBottleWaterMl: s.preferredBottleWaterMl,
      dailyTargetMl: D,
      approximate: replay.approximate,
      rows,
    });
  }
  return out;
}
