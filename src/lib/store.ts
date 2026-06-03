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
import { Feed, Settings } from '../types';

// Set in .env for dev; leave unset (or empty) for production builds.
const API_URL = process.env.EXPO_PUBLIC_API_URL ?? '';
const USE_API = __DEV__ && API_URL.length > 0;

// AsyncStorage keys (production only)
const FEEDS_KEY = 'bmt_feeds';
const SETTINGS_KEY = 'bmt_settings';

const DEFAULT_SETTINGS: Settings = {
  weightKg: 6.27,
  mlPerKgPerDay: 150,
  standardBottleVolume: 90,
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
      const res = await fetch(`${API_URL}/api/feeds`, { cache: 'no-store' });
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
      const res = await fetch(`${API_URL}/api/settings`, { cache: 'no-store' });
      if (res.ok) return { ...DEFAULT_SETTINGS, ...(await res.json()) };
    } catch {}
    return DEFAULT_SETTINGS;
  }
  const raw = await AsyncStorage.getItem(SETTINGS_KEY);
  if (!raw) return DEFAULT_SETTINGS;
  try { return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) }; } catch { return DEFAULT_SETTINGS; }
}

export async function saveSettings(settings: Settings): Promise<void> {
  if (USE_API) {
    await fetch(`${API_URL}/api/settings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings),
    });
    return;
  }
  await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

// Stamps historical feeds (AsyncStorage only) that are missing targetMlPerDay.
// Idempotent: only runs on feeds without a stamp, skips entirely in API mode.
export async function migrateAsyncStorageFeeds(currentTargetMl: number): Promise<void> {
  if (USE_API) return; // Migration handled server-side
  const feeds = await getFeeds();
  const needsMigration = feeds.some((f) => f.targetMlPerDay === undefined);
  if (!needsMigration) return;
  const migrated = feeds.map((f) =>
    f.targetMlPerDay !== undefined ? f : { ...f, targetMlPerDay: currentTargetMl }
  );
  await saveFeeds(migrated);
}
