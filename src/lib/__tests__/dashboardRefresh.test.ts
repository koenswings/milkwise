// Mobile refresh: one load on focus, one per return to foreground ('active'), none on clock ticks;
// cleanup removes the AppState listener and the timer.
const mockListeners: Array<(s: string) => void> = [];
const mockRemove = jest.fn();
jest.mock('react-native', () => ({
  AppState: {
    currentState: 'active',
    addEventListener: jest.fn((_: string, cb: (s: string) => void) => { mockListeners.push(cb); return { remove: mockRemove }; }),
  },
}));
import { startDashboardRefresh, DASHBOARD_TICK_MS } from '../dashboardRefresh';

beforeEach(() => { mockListeners.length = 0; mockRemove.mockClear(); jest.useFakeTimers(); });
afterEach(() => jest.useRealTimers());
const emit = (s: string) => mockListeners.forEach((l) => l(s));

test('ticks never fetch; foreground fetches once; cleanup removes listener and timer', () => {
  const load = jest.fn(); const tick = jest.fn();
  const stop = startDashboardRefresh(load, tick);
  expect(load).toHaveBeenCalledTimes(1);                   // focus
  jest.advanceTimersByTime(DASHBOARD_TICK_MS * 20);
  expect(tick).toHaveBeenCalledTimes(20);
  expect(load).toHaveBeenCalledTimes(1);                   // no fetch on ticks
  emit('background'); emit('active');
  expect(load).toHaveBeenCalledTimes(2);                   // one fetch on foreground
  emit('active');
  expect(load).toHaveBeenCalledTimes(2);                   // already active: no extra fetch
  emit('inactive'); emit('active');
  expect(load).toHaveBeenCalledTimes(3);
  stop();
  expect(mockRemove).toHaveBeenCalledTimes(1);
  jest.advanceTimersByTime(DASHBOARD_TICK_MS * 5);
  expect(tick).toHaveBeenCalledTimes(20);
});
