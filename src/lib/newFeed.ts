import { Feed } from '../types';

/**
 * Build a new Feed record. `volume` is water ml (invariant 5).
 * Never writes the deprecated `targetMlPerDay` field (invariant 6).
 */
export function buildNewFeed(id: string, timestamp: number, volume: number): Feed {
  return { id, timestamp, volume };
}
