// Settings history — pure helpers (no fs, no clock). See design/2026-10-25-settings-history.md.
// Deliberately NOT in calculations.ts (that file is in the PR #2 byte-identical reconciliation scope).
import { Feed, Settings } from "../types";

/** Keys that affect calculations and are recorded in history (§2). Never spread request bodies. */
export const LOGGED_KEYS = [
  "preferredBottleWaterMl",
  "mlPerKgPerDay",
  "weightKg",
  "dateOfBirthMs",
  "sex",
  "yellowThresholdPct",
  "redThresholdPct",
] as const;
export type LoggedKey = (typeof LOGGED_KEYS)[number];

/**
 * Every key that may be persisted in settings.json: the logged (calculation) keys plus
 * display-only preferences that are not logged. Single source of truth for the
 * settings.json allowlist. targetMlPerDay is deprecated and must never appear here.
 */
export const PERSISTED_KEYS = [...LOGGED_KEYS, "timeFormat", "feedingTimelineView", "feedingTimelineViewMigrated"] as const;
export type PersistedKey = (typeof PERSISTED_KEYS)[number];

/** Keep only allowlisted keys (drops unknown keys and targetMlPerDay). Never spread request bodies. */
export function pickPersisted(input: unknown): Partial<Settings> {
  const out: Record<string, unknown> = {};
  if (!input || typeof input !== "object") return out as Partial<Settings>;
  const src = input as Record<string, unknown>;
  for (const k of PERSISTED_KEYS) if (src[k] !== undefined) out[k] = src[k];
  return out as Partial<Settings>;
}

export type HistorySource =
  | "web" | "mobile" | "weights-sync" | "seed" | "reconcile" | "manual" | "mobile-offline" | "migration";

export interface Change { old?: unknown; new: unknown }

export interface HistoryEntry {
  v: 1;
  kind?: "diff" | "snapshot";
  effectiveFrom: string;
  changedAt: string;
  source: HistorySource;
  appVersion: string;
  oldUnknown?: boolean;
  changes: Partial<Record<LoggedKey, Change>>;
}

/** ISO 8601 with the local UTC offset, e.g. 2026-10-25T09:00:00+01:00. */
export function isoWithOffset(d: Date): string {
  const pad = (n: number) => String(Math.abs(n)).padStart(2, "0");
  const off = -d.getTimezoneOffset();
  const sign = off >= 0 ? "+" : "-";
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}` +
    `${sign}${pad(Math.trunc(off / 60))}:${pad(off % 60)}`
  );
}

function get(s: Partial<Settings>, k: LoggedKey): unknown {
  return (s as Record<string, unknown>)[k];
}

/** Diff only the allowlisted keys. Returns {} when nothing logged changed. */
export function diffLogged(
  oldS: Partial<Settings>, newS: Partial<Settings>,
): Partial<Record<LoggedKey, Change>> {
  const changes: Partial<Record<LoggedKey, Change>> = {};
  for (const k of LOGGED_KEYS) {
    const o = get(oldS, k);
    const n = get(newS, k);
    if (o !== n) changes[k] = { old: o ?? null, new: n ?? null };
  }
  return changes;
}

/** Snapshot of all allowlisted keys (seed / reconcile). */
export function snapshotLogged(s: Partial<Settings>): Partial<Record<LoggedKey, Change>> {
  const changes: Partial<Record<LoggedKey, Change>> = {};
  for (const k of LOGGED_KEYS) changes[k] = { new: get(s, k) ?? null };
  return changes;
}

/** Parse JSONL; invalid lines are skipped and reported via `warn`, never rewritten. */
export function parseHistory(
  text: string, warn: (msg: string) => void = (m) => console.warn(m),
): HistoryEntry[] {
  const out: HistoryEntry[] = [];
  text.split("\n").forEach((line, i) => {
    if (line.trim() === "") return;
    try {
      const e = JSON.parse(line);
      if (!e || typeof e !== "object" || e.v !== 1 || typeof e.effectiveFrom !== "string" || !e.changes) {
        throw new Error("not a v1 history entry");
      }
      out.push(e as HistoryEntry);
    } catch (err) {
      warn(`[settings-history] skipping invalid line ${i + 1}: ${(err as Error).message}`);
    }
  });
  return out;
}

const ts = (s: string) => Date.parse(s);

/** Sort by effectiveFrom, tiebreak changedAt, then file (append) order. */
export function sortEntries(entries: HistoryEntry[]): HistoryEntry[] {
  return entries
    .map((e, i) => ({ e, i }))
    .sort((a, b) =>
      ts(a.e.effectiveFrom) - ts(b.e.effectiveFrom) ||
      ts(a.e.changedAt) - ts(b.e.changedAt) ||
      a.i - b.i)
    .map((x) => x.e);
}

function apply(target: Record<string, unknown>, e: HistoryEntry) {
  for (const k of LOGGED_KEYS) {
    const c = e.changes[k];
    if (!c) continue;
    if (c.new === null || c.new === undefined) delete target[k];
    else target[k] = c.new;
  }
}

/**
 * Settings in effect at time T (epoch ms).
 * Start from the latest snapshot ≤ T and apply diffs ≤ T. Keys never logged come from `current`.
 * If no snapshot ≤ T exists (T before the seed), each key takes its earliest known value
 * (first later snapshot value, or the `old` of its first later diff) and `approximate` is true.
 */
export function settingsAt(
  entries: HistoryEntry[], current: Settings, T: number,
): { settings: Settings; approximate: boolean } {
  const sorted = sortEntries(entries);
  const before = sorted.filter((e) => ts(e.effectiveFrom) <= T);
  const after = sorted.filter((e) => ts(e.effectiveFrom) > T);
  const result: Record<string, unknown> = { ...current };

  let lastSnap = -1;
  before.forEach((e, i) => { if (e.kind === "snapshot") lastSnap = i; });

  let approximate = false;
  if (lastSnap === -1) {
    approximate = true;
    for (const k of LOGGED_KEYS) {
      for (const e of after) {
        const c = e.changes[k];
        if (!c) continue;
        if (e.kind === "snapshot") { setOrDelete(result, k, c.new); break; }
        if (!e.oldUnknown && "old" in c) { setOrDelete(result, k, c.old); break; }
      }
    }
  }
  for (let i = Math.max(lastSnap, 0); i < before.length; i++) apply(result, before[i]);
  return { settings: result as unknown as Settings, approximate };
}

function setOrDelete(o: Record<string, unknown>, k: string, v: unknown) {
  if (v === null || v === undefined) delete o[k]; else o[k] = v;
}

/** True if `a` and `b` agree on every logged key. */
export function sameLogged(a: Partial<Settings>, b: Partial<Settings>): boolean {
  return Object.keys(diffLogged(a, b)).length === 0;
}

/**
 * Replay entry point: settings frozen at lastFeed.timestamp (never "now").
 * Returns null when there are no feeds.
 */
export function settingsForReplay(
  entries: HistoryEntry[], current: Settings, feeds: Pick<Feed, "timestamp">[],
): { settings: Settings; approximate: boolean } | null {
  if (feeds.length === 0) return null;
  const lastTs = feeds.reduce((m, f) => (f.timestamp > m ? f.timestamp : m), -Infinity);
  return settingsAt(entries, current, lastTs);
}

/** Per-feed verdicts: settings at the feed's own timestamp. */
export function settingsForFeed(
  entries: HistoryEntry[], current: Settings, feed: Pick<Feed, "timestamp">,
): { settings: Settings; approximate: boolean } {
  return settingsAt(entries, current, feed.timestamp);
}
