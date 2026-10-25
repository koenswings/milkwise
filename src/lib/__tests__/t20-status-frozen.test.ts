// Invariant: status is frozen at lastFeed.timestamp — 24 h intake and % do not move with the clock.
import fx from "./fixtures/snapshot-20261024.json";
import { smoothedEffective, strict24hTotal, zonesProgression } from "../calculations";
import { Feed } from "../../types";

const D = fx.D, r = D / 24;
const feeds: Feed[] = fx.feeds;
const last = Math.max(...feeds.map((f) => f.timestamp));

function status() {
  // Same inputs as the dashboard: everything evaluated at lastFeed.timestamp, never "now".
  const smoothed = smoothedEffective(feeds, r, 120, last).totalMl;
  const strict = strict24hTotal(feeds, last);
  return { smoothed, strict, pct: (smoothed / D) * 100, strictPct: (strict / D) * 100, zones: zonesProgression(feeds, 120, r, D, last) };
}

test("24 h intake and percentage unchanged when Date.now is mocked later", () => {
  const spy = jest.spyOn(Date, "now").mockReturnValue(last + 60_000);
  const a = status();
  spy.mockReturnValue(last + 7 * 3_600_000);
  const b = status();
  spy.mockReturnValue(last + 3 * 86_400_000);
  const c = status();
  spy.mockRestore();
  expect(b).toEqual(a);
  expect(c).toEqual(a);
  expect(a.pct).toBeCloseTo(105.1, 1); // §4.1: status 105.1 % after the 14:30 feed
});
