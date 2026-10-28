// 1.2.13 layout (unchanged in 1.2.14): Status → timeline (zones or classic; stored 'cards' renders classic) →
// Daily Target → Next Feed → Recent feeds. Daily Target is rendered once, outside the view switch.
import fs from 'fs';
import path from 'path';

const src = fs.readFileSync(path.join(__dirname, '../../screens/DashboardScreen.tsx'), 'utf8');
const pos = (n: string) => { const i = src.indexOf(n); expect(i).toBeGreaterThan(-1); return i; };

test('Daily Target sits directly below the timeline in both views', () => {
  const status = pos('<StatusCard');
  const zones = pos('<ZonesTimeline\n');
  const classic = pos('<FeedingTimeline\n');
  const daily = pos('🎯 DAILY TARGET');
  const next = pos('⏭ NEXT FEED');
  const recent = pos('🍼 RECENT FEEDS');
  expect(status).toBeLessThan(Math.min(zones, classic));
  expect(Math.max(zones, classic)).toBeLessThan(daily);
  expect(daily).toBeLessThan(next);
  expect(next).toBeLessThan(recent);
  expect(src.split('🎯 DAILY TARGET').length - 1).toBe(1);
});
