import fs from 'fs';
import path from 'path';
import { classicFeedsToday } from '../classicToday';
import { buildClassicMarkers } from '../classicMarkers';
import { Feed } from '../../types';

const midnight = new Date(2026, 9, 25, 0, 0, 0, 0).getTime();   // local midnight
const h = 3_600_000;
const feeds: Feed[] = [
  { id: 'y1', timestamp: midnight - 5 * h, volume: 120 },
  { id: 'y2', timestamp: midnight - 1, volume: 120 },
  { id: 't0', timestamp: midnight, volume: 90 },
  { id: 't1', timestamp: midnight + 3 * h, volume: 120 },
  { id: 't2', timestamp: midnight + 6 * h, volume: 150 },
];

test("Classic shows today's earlier feeds from local midnight and nothing before", () => {
  const today = classicFeedsToday(feeds, midnight);
  expect(today.map(f => f.id)).toEqual(['t0', 't1', 't2']);
  const m = buildClassicMarkers([], today, 120, midnight + 7 * h);
  expect(m.map(x => x.kind)).toEqual(['past-feed', 'past-feed', 'last-feed']);
  expect(m.every(x => x.ms >= midnight)).toBe(true);
});

test('no feeds yet today → no feed markers', () => {
  expect(classicFeedsToday(feeds.slice(0, 2), midnight)).toEqual([]);
});

test('Dashboard Classic passes today\'s feeds (not just the last feed) to buildClassicMarkers', () => {
  const src = fs.readFileSync(path.resolve(__dirname, '../../screens/DashboardScreen.tsx'), 'utf8');
  expect(src).toContain('buildClassicMarkers(progression, classicFeedsToday(feeds, dayStartMs)');
  expect(src).not.toContain('lastFeed ? [lastFeed] : []');
});
