/**
 * store.ts — MilkWise data layer
 *
 * Development mode (__DEV__ = true):
 *   Reads and writes go to the Pi web app API (EXPO_PUBLIC_API_URL).
 *   Both Expo Go and the browser share the same feeds.json on disk.
 *
 * Production mode (__DEV__ = false):
 *   Reads and writes use AsyncStorage (local to device).
 *   Will be replaced with Supabase household sync in v1.1.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { Feed, Settings, WeightEntry } from '../types';

// Fallback to Pi (idea02) Tailscale IP so EAS builds always connect.
const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://100.85.108.118:3333';
const USE_API = true; // always use API — local AsyncStorage is not the primary store

// AsyncStorage keys (production only)
const FEEDS_KEY = 'bmt_feeds';
const SETTINGS_KEY = 'bmt_settings';

const DEFAULT_SETTINGS: Settings = {
  weightKg: 6.27,
  mlPerKgPerDay: 150,
  preferredBottleWaterMl: 90,
  yellowThresholdPct: 5,
  redThresholdPct: 10,
  timeFormat: '24h' as const,
};

export function generateId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    try { return crypto.randomUUID(); } catch {}
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// ─── Feeds ────────────────────────────────────────────────────────────────────

export async function getFeeds(): Promise<Feed[]> {
  if (USE_API) {
    try {
      const res = await fetch(`${API_URL}/api/feeds`);
      if (res.ok) return res.json() as Promise<Feed[]>;
    } catch {}
    return [];
  }
  const raw = await AsyncStorage.getItem(FEEDS_KEY);
  if (!raw) return [];
  try { return JSON.parse(raw) as Feed[]; } catch { return []; }
}

export async function saveFeeds(feeds: Feed[]): Promise<void> {
  if (USE_API) {
    await fetch(`${API_URL}/api/feeds`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(feeds),
    });
    return;
  }
  await AsyncStorage.setItem(FEEDS_KEY, JSON.stringify(feeds));
}

export async function addFeed(feed: Feed): Promise<Feed[]> {
  const feeds = await getFeeds();
  const updated = [...feeds, feed];
  await saveFeeds(updated);
  return updated;
}

export async function updateFeed(id: string, partial: Partial<Feed>): Promise<Feed[]> {
  const feeds = await getFeeds();
  const updated = feeds.map((f) => (f.id === id ? { ...f, ...partial } : f));
  await saveFeeds(updated);
  return updated;
}

export async function deleteFeed(id: string): Promise<Feed[]> {
  const feeds = await getFeeds();
  const updated = feeds.filter((f) => f.id !== id);
  await saveFeeds(updated);
  return updated;
}

// ─── Settings ─────────────────────────────────────────────────────────────────

export async function getSettings(): Promise<Settings> {
  if (USE_API) {
    try {
      const res = await fetch(`${API_URL}/api/settings`);
      if (res.ok) return { ...DEFAULT_SETTINGS, ...(await res.json() as Partial<Settings>) };
    } catch {}
    return DEFAULT_SETTINGS;
  }
  const raw = await AsyncStorage.getItem(SETTINGS_KEY);
  if (!raw) return DEFAULT_SETTINGS;
  try { return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) as Partial<Settings> }; } catch { return DEFAULT_SETTINGS; }
}

export async function getWeights(): Promise<WeightEntry[]> {
  if (USE_API) {
    try {
      const res = await fetch(`${API_URL}/api/weights`);
      if (res.ok) return res.json() as Promise<WeightEntry[]>;
    } catch {}
    return [];
  }
  // AsyncStorage fallback — not yet implemented
  return [];
}

/** Thrown when settings could not be saved to the server (HTTP error or network failure). */
export class SettingsSaveError extends Error {
  readonly kind: 'http' | 'network';
  readonly status?: number;
  constructor(kind: 'http' | 'network', message: string, status?: number) {
    super(message);
    this.name = 'SettingsSaveError';
    this.kind = kind;
    this.status = status;
  }
}

/**
 * Save settings. In API mode this throws SettingsSaveError when the request fails
 * (non-2xx or network error) so callers can show the failure — a failed save is never
 * silently dropped. No offline queue yet (phase 2).
 */
export async function saveSettings(settings: Settings): Promise<void> {
  if (USE_API) {
    let res: Response;
    try {
      res = await fetch(`${API_URL}/api/settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-MilkWise-Source': 'mobile' },
        body: JSON.stringify(settings),
      });
    } catch (e) {
      throw new SettingsSaveError(
        'network',
        `Settings not saved: could not reach the server (${e instanceof Error ? e.message : String(e)}). Check your connection and try again.`,
      );
    }
    if (!res.ok) {
      throw new SettingsSaveError(
        'http',
        `Settings not saved: the server returned an error (HTTP ${res.status}). Please try again.`,
        res.status,
      );
    }
    return;
  }
  await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

/** User-facing text for a failed save. */
export function saveErrorMessage(e: unknown): string {
  if (e instanceof SettingsSaveError) return e.message;
  return `Settings not saved: ${e instanceof Error ? e.message : String(e)}`;
}

// Legacy migration stub — targetMlPerDay has been removed from Feed; this is now a no-op.
/** @deprecated targetMlPerDay no longer exists on Feed; this function does nothing. */
export async function migrateAsyncStorageFeeds(_currentTargetMl?: number): Promise<void> {
  // No-op: migration no longer needed after types/index.ts sync.
}
