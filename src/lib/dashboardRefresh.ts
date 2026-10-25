// Dashboard refresh wiring (§10: zones frozen at last feed, highlight evaluated now).
//   - load() (fetch feeds/settings/weights/history) runs on screen focus and whenever the app
//     returns to the foreground (AppState → 'active');
//   - the timer only ticks the display clock — it never fetches feeds or recomputes zones.
// Returns a cleanup that clears the timer and removes the AppState listener.
import { AppState, AppStateStatus } from 'react-native';

export const DASHBOARD_TICK_MS = 30_000;

export function startDashboardRefresh(load: () => void, tick: () => void, tickMs: number = DASHBOARD_TICK_MS): () => void {
  load();
  const id = setInterval(tick, tickMs);
  let prev: AppStateStatus = AppState.currentState;
  const sub = AppState.addEventListener('change', (next: AppStateStatus) => {
    if (next === 'active' && prev !== 'active') load();
    prev = next;
  });
  return () => {
    clearInterval(id);
    sub.remove();
  };
}
