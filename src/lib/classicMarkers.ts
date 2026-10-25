// Classic (point-in-time) timeline markers — pure, no clock, no DOM. Used by CanTakeCard.
// §11c of design/2026-10-25-feeding-zones.md: single 100 % rule, no grey ghost markers.
import { Feed } from "../types";
import { canTakeProgression } from "./calculations";

export type ClassicMarkerKind = "past-feed" | "last-feed" | "advised" | "future";

export interface ClassicMarker {
  kind: ClassicMarkerKind;
  ms: number;
  waterMl: number;          // bottle size (water ml) or logged water volume for feeds
  aboveBottle: boolean;     // future marker for a size above preferred
}

/**
 * Markers for the classic timeline: past feeds, the last feed, one "give now" marker for the
 * advised size (at `now`) and one marker per size that does not fit yet (at its 100 % time).
 * Sizes that fit now but are not advised get no marker (the old grey ghosts are gone).
 * Sorted by time (the :347 sort in CanTakeCard, kept for the remaining markers).
 */
export function buildClassicMarkers(
  progression: ReturnType<typeof canTakeProgression>,
  feeds: Feed[],
  preferredBottleWaterMl: number,
  now: number,
): ClassicMarker[] {
  const lastFeed = feeds.length > 0 ? feeds.reduce((a, b) => (a.timestamp > b.timestamp ? a : b)) : null;
  const out: ClassicMarker[] = [];
  for (const f of feeds) {
    out.push({ kind: f === lastFeed ? "last-feed" : "past-feed", ms: f.timestamp, waterMl: f.volume, aboveBottle: false });
  }
  for (const e of progression) {
    if (e.isAdvised) out.push({ kind: "advised", ms: now, waterMl: e.waterMl, aboveBottle: false });
    else if (!e.fitsNow) {
      out.push({ kind: "future", ms: e.readyAtMs, waterMl: e.waterMl, aboveBottle: e.waterMl > preferredBottleWaterMl });
    }
  }
  return out.sort((a, b) => a.ms - b.ms);
}
