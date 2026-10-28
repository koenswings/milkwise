// Mobile Classic timeline: which logged feeds get a marker. Today's feeds from local midnight
// (`dayStartMs`, same value the zones view uses); nothing before midnight. Pure, no clock.
// buildClassicMarkers (identical to web) then marks the latest one "last-feed", the rest "past-feed".
import { Feed } from '../types';

export function classicFeedsToday(feeds: Feed[], dayStartMs: number): Feed[] {
  return feeds.filter(f => f.timestamp >= dayStartMs).sort((a, b) => a.timestamp - b.timestamp);
}
