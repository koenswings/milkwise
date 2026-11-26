import { buildNewFeed } from '../newFeed';

describe('buildNewFeed', () => {
  it('does not write the deprecated targetMlPerDay field', () => {
    const feed = buildNewFeed('abc', 1_700_000_000_000, 120);
    expect(feed).toEqual({ id: 'abc', timestamp: 1_700_000_000_000, volume: 120 });
    expect(Object.prototype.hasOwnProperty.call(feed, 'targetMlPerDay')).toBe(false);
  });
});
