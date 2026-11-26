/**
 * DashboardScreen v2 — matches web app design (MilkWise v1.1.0)
 *
 * Layout (top→bottom):
 *   1. Header: MilkWise + version + settings gear
 *   2. Status card (smoothed intake + stomach vessel)
 *   3. Feeding Timeline (horizontal scrollable native View/ScrollView)
 *   4. Next Feed card (Predictor A)
 *   5. Daily Target card
 *   6. Last 3 feeds list
 */

import React, { useState, useCallback, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
} from 'react-native';
import Constants from 'expo-constants';
import { useFocusEffect } from '@react-navigation/native';

import { getFeeds, getSettings, getWeights, getSettingsHistory, saveSettings, saveErrorMessage } from '../lib/store';
import { buildClassicMarkers } from '../lib/classicMarkers';
import { frozenCalcSettings, highlightSegmentsAt, zoneSegments, ZoneSegment, feedsInWindow, historyWindowStart, segmentsFromMs, visibleSegments } from '../lib/zoneSegments';
import { startDashboardRefresh } from '../lib/dashboardRefresh';
import { sizeColour } from '../lib/sizeColours';
import type { HistoryEntry } from '../lib/settingsHistory';
import { formatTime, formatDateTime } from '../lib/formatTime';
import {
  deriveSettings,
  strict24hTotal,
  smoothedEffective,
  smoothedAtTime,
  stomachCapMilk,
  stomachLoad,
  canTakeProgression,
  statusHexColor,
} from '../lib/calculations';
import { Feed, Settings, WeightEntry } from '../types';

const APP_VERSION = Constants.expoConfig?.version ?? '1.1';

const C = {
  bg:            '#0f172a',
  card:          '#1e293b',
  cardBorder:    '#334155',
  textPrimary:   '#e2e8f0',
  textSecondary: '#94a3b8',
  textMuted:     '#64748b',
  blue:          '#3b82f6',
  green:         '#4ade80',
  yellow:        '#facc15',
  red:           '#f43f5e',
  teal:          '#2dd4bf',
  rose:          '#f43f5e',
  orange:        '#f97316',
};

// ── helpers ───────────────────────────────────────────────────────────────────

function colorForPct(pct: number, y: number, r: number): string {
  const d = Math.abs(pct - 100);
  if (d <= y) return C.green;
  if (d <= r) return C.yellow;
  return C.red;
}

function borderColorForPct(pct: number, y: number, r: number): string {
  const d = Math.abs(pct - 100);
  if (d <= y) return 'rgba(74,222,128,0.4)';
  if (d <= r) return 'rgba(250,204,21,0.4)';
  return 'rgba(244,63,94,0.4)';
}

function statusText(pct: number, y: number, r: number): string {
  const d = Math.abs(pct - 100);
  if (d <= y) return 'on track';
  if (pct > 100) return d <= r ? 'slightly over' : 'overfed ⚠️';
  return d <= r ? 'slightly behind' : 'behind ⚠️';
}

function formatRelative(ts: number, now: number): string {
  const diff = ts - now;
  const absDiff = Math.abs(diff);
  const mins = Math.round(absDiff / 60000);
  const hrs = Math.floor(mins / 60);
  const remMins = mins % 60;
  const timeStr = hrs > 0 ? `${hrs}h ${remMins}m` : `${mins}m`;
  return diff > 0 ? `in ${timeStr}` : `${timeStr} ago`;
}

function fmtTimeStr(ms: number, tf: '24h' | '12h'): string {
  const d = new Date(ms);
  let h = d.getHours();
  const m = d.getMinutes();
  const ampm = tf === '12h' ? (h >= 12 ? 'PM' : 'AM') : null;
  if (tf === '12h') h = h % 12 || 12;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}${ampm ? ' ' + ampm : ''}`;
}


// ── StatusCard ─────────────────────────────────────────────────────────────────

interface StatusCardProps {
  smoothedMl: number;
  smoothedPct: number;
  loadNow: number;
  capMilk: number;
  dailyTargetMl: number;
  y: number;
  r: number;
  onExplain: () => void;
}

function StatusCard({ smoothedMl, smoothedPct, loadNow, capMilk, dailyTargetMl, y, r, onExplain }: StatusCardProps) {
  const intakeColor = colorForPct(smoothedPct, y, r);
  const intakeHex = intakeColor;
  const intakeFill = Math.min(Math.max((smoothedPct - 60) / 80 * 100, 0), 100);
  const intakeDiff = smoothedPct - 100;
  const deltaml = Math.abs(Math.round(smoothedPct / 100 * dailyTargetMl - dailyTargetMl));

  const stomachFillPct = Math.min(100, Math.max(0, (loadNow / capMilk) * 100));
  const stomachHex = stomachFillPct > 85 ? '#ef4444' : stomachFillPct > 55 ? '#f97316' : '#fbbf24';
  const roomNow = Math.max(0, capMilk - loadNow);
  const roomColor = stomachFillPct > 85 ? C.red : stomachFillPct > 55 ? C.orange : C.teal;

  const borderColor = borderColorForPct(smoothedPct, y, r);

  // Gauge bar fill width (max 130% maps to full bar)
  const gaugeBarFillPct = Math.min(100, (smoothedPct / 130) * 100);
  const gaugeBarColor = Math.abs(intakeDiff) <= y ? C.green : intakeDiff > 0 ? C.orange : C.blue;

  return (
    <View style={[styles.card, { borderColor, borderWidth: 1, marginBottom: 12 }]}>
      {/* Header */}
      <View style={styles.rowSpaced}>
        <Text style={styles.cardLabel}>STATUS AT LAST FEED</Text>
        <TouchableOpacity onPress={onExplain} style={styles.questionCircle}>
          <Text style={styles.questionCircleText}>?</Text>
        </TouchableOpacity>
      </View>

      {/* Two columns */}
      <View style={styles.statusCols}>
        {/* Left: intake */}
        <View style={styles.statusLeft}>
          <Text style={styles.statusColLabel}>24h intake · at last feed</Text>

          {/* Vertical gauge */}
          <View style={styles.gaugeContainer}>
            <View style={styles.gaugeBar}>
              <View style={[styles.gaugeFill, { height: `${intakeFill}%` as any, backgroundColor: intakeHex }]} />
              <View style={styles.gaugeTargetLine} />
            </View>
          </View>

          <Text style={[styles.statusBigNum, { color: intakeColor }]}>
            {Math.round(smoothedMl)}<Text style={styles.statusBigUnit}> ml</Text>
          </Text>
          <Text style={[styles.statusSmall, { color: intakeColor }]}>{Math.round(smoothedPct)}%</Text>
          <Text style={styles.statusDelta}>
            {Math.abs(intakeDiff) < 1 ? 'on target' : `${intakeDiff > 0 ? '+' : '−'}${deltaml} ml`}
          </Text>
        </View>

        {/* Right: stomach */}
        <View style={styles.statusRight}>
          <Text style={styles.statusColLabel}>stomach room · now</Text>

          {/* Stomach vessel */}
          <View style={styles.stomachVessel}>
            <View style={[styles.stomachEmpty, { bottom: `${stomachFillPct}%` as any }]} />
            <View style={[styles.stomachFill, { height: `${stomachFillPct}%` as any, backgroundColor: stomachHex }]} />
          </View>

          <Text style={[styles.statusBigNum, { color: roomColor }]}>
            {Math.round(roomNow)}<Text style={styles.statusBigUnit}> ml free</Text>
          </Text>
          <Text style={[styles.statusSmall, { color: roomColor }]}>{Math.round(loadNow)} ml digesting</Text>
        </View>
      </View>

      {/* Bottom twin progress bars */}
      <View style={styles.twinBars}>
        <View style={styles.twinBarTrack}>
          <View style={[styles.twinBarFill, { width: `${gaugeBarFillPct}%` as any, backgroundColor: gaugeBarColor }]} />
          <View style={styles.twinBarTarget} />
        </View>
        <View style={styles.twinBarTrack}>
          <View style={[styles.twinBarFill, { width: `${stomachFillPct}%` as any, backgroundColor: stomachHex }]} />
        </View>
      </View>
    </View>
  );
}

// ── FeedingTimeline ────────────────────────────────────────────────────────────

interface TimelineProps {
  feeds: Feed[];
  preferredBottleWaterMl: number;
  now: number;
  hourlyRate: number;
  dailyTargetMl: number;
  timeFormat: '24h' | '12h';
}

function FeedingTimeline({ feeds, preferredBottleWaterMl, now, hourlyRate, dailyTargetMl, timeFormat, windowStartMs }: Omit<TimelineProps, 'predictors'> & { windowStartMs: number }) {

  const progression = canTakeProgression(feeds, preferredBottleWaterMl, now, hourlyRate, dailyTargetMl);

  // Classic view: one marker per size at its single 100 % time (no second, earlier marker per size) — §10.
  interface Marker {
    label: string;
    time: string;
    dotColor: string;
    fillDot: boolean;
    header?: string;
  }
  const markers: Marker[] = buildClassicMarkers(progression, feedsInWindow(feeds, windowStartMs), preferredBottleWaterMl, now)
    .map((m): Marker => {
      switch (m.kind) {
        case 'last-feed':
        case 'past-feed':
          return { label: `${m.waterMl} 🍼`, time: fmtTimeStr(m.ms, timeFormat), dotColor: '#475569', fillDot: true, header: m.kind === 'last-feed' ? 'Last feed' : undefined };
        case 'advised':
          return { label: `${m.waterMl} 🍼`, time: 'now', dotColor: '#4ade80', fillDot: true, header: 'Give now' };
        default:
          return { label: `${m.waterMl} 🍼`, time: fmtTimeStr(m.ms, timeFormat), dotColor: m.aboveBottle ? '#2dd4bf' : '#f43f5e', fillDot: false };
      }
    });

  if (markers.length === 0) {
    return (
      <View style={[styles.card, { borderColor: 'rgba(244,63,94,0.25)', borderWidth: 1, marginBottom: 12, padding: 12 }]}>
        <Text style={styles.cardLabel}>FEEDING TIMELINE</Text>
        <Text style={[styles.cardSub, { marginTop: 8 }]}>No feeds yet</Text>
      </View>
    );
  }

  return (
    <View style={[styles.card, { borderColor: 'rgba(244,63,94,0.25)', borderWidth: 1, marginBottom: 12, padding: 12 }]}>
      <Text style={[styles.cardLabel, { marginBottom: 8 }]}>FEEDING TIMELINE</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ alignItems: 'center', paddingHorizontal: 4 }}>
        {markers.map((m, i) => (
          <React.Fragment key={i}>
            {i > 0 && (
              <View style={{ width: 24, height: 1, backgroundColor: '#334155', alignSelf: 'center', marginTop: 10 }} />
            )}
            <View style={{ alignItems: 'center', paddingHorizontal: 6, minWidth: 56 }}>
              {m.header ? (
                <Text style={{ fontSize: 9, color: '#64748b', marginBottom: 2 }}>{m.header}</Text>
              ) : (
                <View style={{ height: 13 }} />
              )}
              <Text style={{ fontSize: 13, fontWeight: '700', color: m.dotColor, fontFamily: 'monospace', marginBottom: 4 }}>{m.label}</Text>
              <View style={{
                width: 10, height: 10, borderRadius: 5,
                backgroundColor: m.fillDot ? m.dotColor : 'transparent',
                borderWidth: 2, borderColor: m.dotColor,
                marginBottom: 4,
              }} />
              <Text style={{ fontSize: 11, color: m.dotColor, fontFamily: 'monospace' }}>{m.time}</Text>
            </View>
          </React.Fragment>
        ))}
      </ScrollView>
    </View>
  );
}

// ── ZonesTimeline (§10) ───────────────────────────────────────────────────────
// Bars = [open, close) per size; a ring marks only a collapsed size. History from midnight,
// every feed cuts the diagram. Highlighted size full colour, smaller in-zone sizes dimmed.

const PX_PER_HOUR = 44;
const ROW_H = 18;
const LABEL_W = 40;

function ZonesTimeline({ segments, now, windowStartMs, timeFormat }: {
  segments: ZoneSegment[]; now: number; windowStartMs: number; timeFormat: '24h' | '12h';
}) {
  const card = [styles.card, { borderColor: 'rgba(45,212,191,0.25)', borderWidth: 1, marginBottom: 12, padding: 12 }];
  if (segments.length === 0) {
    return (
      <View style={card}>
        <Text style={styles.cardLabel}>FEEDING ZONES</Text>
        <Text style={[styles.cardSub, { marginTop: 8 }]}>No feeds yet</Text>
      </View>
    );
  }
  const current = segments[segments.length - 1];
  const sizes = [...new Set(segments.flatMap(sg => sg.rows.map(r => r.waterMl)))].sort((a, b) => a - b);
  const lastClose = Math.max(now, ...current.rows.map(r => r.closeMs ?? r.openMs).filter(ms => ms - now < 12 * 3_600_000));
  const startMs = windowStartMs;
  const endMs = Math.max(now + 3_600_000, lastClose + 1_800_000);
  const x = (ms: number) => ((ms - startMs) / 3_600_000) * PX_PER_HOUR;
  const width = x(endMs);
  const height = sizes.length * ROW_H + 18;
  const highlighted = current.rows.find(r => r.isHighlighted) ?? null;
  const hours: number[] = [];
  for (let h = Math.ceil(startMs / 3_600_000) * 3_600_000; h <= endMs; h += 3_600_000) hours.push(h);

  return (
    <View style={card}>
      <Text style={[styles.cardLabel, { marginBottom: 4 }]}>FEEDING ZONES</Text>
      <Text style={[styles.cardSub, { marginBottom: 8 }]}>
        {highlighted
          ? highlighted.highlightKind === 'in-zone'
            ? `${highlighted.waterMl} 🍼 now lands at ${Math.round(highlighted.landingNowPct)} %`
            : `${highlighted.waterMl} 🍼 fits now · under target (${Math.round(highlighted.landingNowPct)} %)`
          : 'No size in its zone right now'}
        {current.approximate ? ' · settings approximate' : ''}
      </Text>
      <View style={{ flexDirection: 'row' }}>
        <View style={{ width: LABEL_W }}>
          {sizes.map(w => (
            <Text key={w} style={{ height: ROW_H, fontSize: 10, color: sizeColour(w), fontFamily: 'monospace', fontWeight: w === current.preferredBottleWaterMl ? '700' : '400' }}>
              {w}{w === current.preferredBottleWaterMl ? '★' : ''}
            </Text>
          ))}
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentOffset={{ x: Math.max(0, x(now) - 160), y: 0 }}>
          <View style={{ width, height }}>
            {hours.map(h => (
              <View key={`h${h}`} style={{ position: 'absolute', left: x(h), top: sizes.length * ROW_H, width: 1, height: 4, backgroundColor: '#334155' }}>
                <Text style={{ position: 'absolute', top: 4, left: -12, width: 40, fontSize: 9, color: '#64748b' }}>{fmtTimeStr(h, timeFormat)}</Text>
              </View>
            ))}
            {segments.map((sg, si) => {
              const segEnd = sg.toMs ?? endMs;
              return sg.rows.map(r => {
                const row = sizes.indexOf(r.waterMl);
                const colour = sizeColour(r.waterMl);
                const isHl = sg.isCurrent && r.isHighlighted;
                const dim = sg.isCurrent && highlighted !== null && !isHl && r.waterMl < highlighted.waterMl
                  && r.closeMs !== null && r.openMs <= now && now < r.closeMs;
                const opacity = !sg.isCurrent ? 0.45 : dim ? 0.35 : 1;
                if (r.state === 'beyond-horizon') return null;
                if (r.closeMs === null) {
                  // collapsed: ring at S
                  if (r.openMs < sg.fromMs || r.openMs > segEnd) return null;
                  return (
                    <View key={`${si}-${r.waterMl}`} style={{
                      position: 'absolute', left: x(r.openMs) - 6, top: row * ROW_H + 3, width: 12, height: 12, borderRadius: 6,
                      borderWidth: isHl ? 3 : 2, borderColor: colour, opacity,
                    }} />
                  );
                }
                const a = Math.max(r.openMs, sg.fromMs);
                const b = Math.min(r.closeMs, segEnd);
                if (b <= a) return null;
                return (
                  <View key={`${si}-${r.waterMl}`} style={{
                    position: 'absolute', left: x(a), top: row * ROW_H + 4, width: Math.max(2, x(b) - x(a)), height: ROW_H - 8,
                    borderRadius: 3, backgroundColor: colour, opacity,
                    borderWidth: isHl ? 2 : 0, borderColor: '#e2e8f0',
                  }} />
                );
              });
            })}
            {segments.filter(sg => sg.feed.timestamp >= startMs).map(sg => (
              <View key={`f${sg.feed.id}`} style={{ position: 'absolute', left: x(sg.feed.timestamp), top: 0, width: 1, height: sizes.length * ROW_H, backgroundColor: '#94a3b8' }} />
            ))}
            <View style={{ position: 'absolute', left: x(now), top: 0, width: 2, height: sizes.length * ROW_H, backgroundColor: '#4ade80' }} />
          </View>
        </ScrollView>
      </View>
      <Text style={{ fontSize: 9, color: '#64748b', marginTop: 4 }}>
        Bar = lands 105 %→100 % · ring = fits at that time, already ≤ 100 % · grey line = feed · green = now
      </Text>
    </View>
  );
}

// ── Main Dashboard ─────────────────────────────────────────────────────────────

export default function DashboardScreen({ navigation }: { navigation: any }) {
  const [feeds, setFeeds] = useState<Feed[]>([]);
  const [settings, setSettings] = useState<Settings>({
    weightKg: 6.27,
    mlPerKgPerDay: 150,
    preferredBottleWaterMl: 90,
    yellowThresholdPct: 5,
    redThresholdPct: 10,
    timeFormat: '24h',
  });
  const [weights, setWeights] = useState<WeightEntry[]>([]);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [now, setNow] = useState(Date.now());
  // noFeedRefMs for frozenCalcSettings (only used with no feeds): the load time — data-only, never the tick clock.
  const [loadedAtMs, setLoadedAtMs] = useState(0);

  const load = useCallback(async () => {
    const [f, s, w, h] = await Promise.all([getFeeds(), getSettings(), getWeights(), getSettingsHistory()]);
    setFeeds(f);
    setHistory(h);
    setSettings(s);
    setWeights(w);
    setLoadedAtMs(Date.now());

    // Don't update 'now' here — only the timer tick updates it so status stays frozen
  }, []);

  // Reload on focus and on return to foreground; the 30 s tick only moves 'now' (labels, now
  // line, zone highlight) — never a feed fetch. Cleanup clears the timer and the AppState listener.
  useFocusEffect(
    useCallback(() => startDashboardRefresh(load, () => setNow(Date.now())), [load])
  );

  // Every calculation parameter (ml/kg/day, preferred size, thresholds, weight, …) is frozen at
  // lastFeed.timestamp — the same frozenCalcSettings the current zone segment uses. Live
  // `settings` is only used for display-only keys and the edit controls.
  const fc = useMemo(
    () => frozenCalcSettings(feeds, settings, history, weights, loadedAtMs),
    [feeds, settings, history, weights, loadedAtMs],
  );
  const calc = fc.settings;
  const effectiveWeightKg = fc.weightKg;
  const weightSource = fc.weightSource;
  const derived = deriveSettings(calc);

  // Zones frozen at the last feed: built from lastFeed − 24 h and recomputed only when data
  // changes, never on a clock tick. A tick re-runs only the highlight and the window clip (§10).
  const segFromMs = segmentsFromMs(feeds);                      // lastFeed − 24 h: data only
  const zonesFrozen = useMemo(
    () => zoneSegments(feeds, settings, history, weights, segFromMs),
    [feeds, settings, history, weights, segFromMs],
  );
  const lastFeedMs = feeds.length > 0 ? Math.max(...feeds.map(f => f.timestamp)) : null;
  const windowStartMs = historyWindowStart(now, lastFeedMs);   // rolling 24 h, extended to the last feed
  const zonesShown = useMemo(
    () => visibleSegments(highlightSegmentsAt(zonesFrozen, feeds, now), windowStartMs),
    [zonesFrozen, feeds, now, windowStartMs],
  );

  const lastFeed = feeds.length > 0
    ? feeds.reduce((a, b) => (a.timestamp > b.timestamp ? a : b))
    : null;

  // Status is FROZEN at lastFeed.timestamp — not live
  const smoothedAt = lastFeed ? lastFeed.timestamp : now;

  const { totalMl: smoothedMl } = smoothedEffective(
    feeds, derived.hourlyRate, calc.preferredBottleWaterMl, smoothedAt
  );
  const smoothedPct = (smoothedMl / derived.dailyTargetMl) * 100;

  // Stomach at live now (for StatusCard right column)
  const capMilkVal = stomachCapMilk(calc.preferredBottleWaterMl, derived.hourlyRate);
  const loadNow = stomachLoad(feeds, now);

  const recentFeeds = [...feeds]
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, 3);

  const y = calc.yellowThresholdPct;
  const r = calc.redThresholdPct;
  const tf = settings.timeFormat;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.title}>🍼 MilkWise</Text>
          <Text style={styles.version}>v{APP_VERSION}</Text>
        </View>
        <TouchableOpacity onPress={() => navigation.navigate('Settings')} style={styles.gearBtn}>
          <Text style={styles.gearText}>⚙️</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.subtitle}>
        {effectiveWeightKg.toFixed(2)} kg ({weightSource === 'who' ? 'WHO' : weightSource === 'manual' ? 'measured' : 'settings'}) · Target {Math.round(derived.dailyTargetMl)} ml/day
      </Text>
      {(() => {
        const liveSmoothedMl = smoothedAtTime(feeds, derived.hourlyRate, now);
        const liveSmoothedPct = liveSmoothedMl / derived.dailyTargetMl * 100;
        const diff = Math.abs(liveSmoothedPct - smoothedPct);
        if (diff < 3) return null; // no meaningful difference, don't show
        return (
          <Text style={[styles.subtitle, { color: liveSmoothedPct >= 100 ? '#fb923c' : '#4ade80', marginTop: -4 }]}>
            Live now: {Math.round(liveSmoothedMl)} ml · {Math.round(liveSmoothedPct)}%
          </Text>
        );
      })()}

      {/* 1. Status Card */}
      <StatusCard
        smoothedMl={smoothedMl}
        smoothedPct={smoothedPct}
        loadNow={loadNow}
        capMilk={capMilkVal}
        dailyTargetMl={derived.dailyTargetMl}
        y={y}
        r={r}
        onExplain={() => {}}
      />

      {/* 2. Feeding Timeline — Zones by default; 'cards' is web-only, so it shows Classic here */}
      {(settings.feedingTimelineView ?? 'zones') === 'zones' ? (
        <ZonesTimeline
          segments={zonesShown}
          now={now}
          windowStartMs={windowStartMs}
          timeFormat={tf}
        />
      ) : (
        <FeedingTimeline
          feeds={feeds}
          preferredBottleWaterMl={calc.preferredBottleWaterMl}
          now={now}
          hourlyRate={derived.hourlyRate}
          dailyTargetMl={derived.dailyTargetMl}
          timeFormat={tf}
          windowStartMs={windowStartMs}
        />
      )}

      {/* 3. Daily Target card — directly below the timeline in every view (1.2.13) */}
      <View style={[styles.card, { marginBottom: 12 }]}>
        <Text style={styles.cardLabel}>🎯 DAILY TARGET</Text>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
          <Text style={styles.cardValue}>{Math.round(derived.dailyTargetMl)} ml</Text>
          <Text style={styles.cardMuted}>·</Text>
          <Text style={[styles.cardValue, { fontSize: 15 }]}>
            {calc.preferredBottleWaterMl} ml bottle
            {(() => {
              const h = Math.floor(derived.idealIntervalHours);
              const m = Math.round((derived.idealIntervalHours - h) * 60);
              return h > 0 ? ` every ${h}h ${m}m` : ` every ${m}m`;
            })()}
          </Text>
        </View>
        {/* Weight quick-edit row */}
        <TouchableOpacity
          onPress={() => Alert.prompt(
            'Update weight',
            'Enter new weight in kg:',
            (val) => {
              const kg = parseFloat(val);
              if (!isNaN(kg) && kg > 0) {
                saveSettings({ ...settings, weightKg: kg }).then(load, (e) => Alert.alert('Save failed', saveErrorMessage(e)));
              }
            },
            'plain-text',
            String(effectiveWeightKg),
          )}
          style={styles.editRow}
        >
          <Text style={styles.editRowText}>⚖️ {effectiveWeightKg.toFixed(2)} kg</Text>
          <Text style={styles.editIcon}>✏️</Text>
        </TouchableOpacity>
        {/* Preferred bottle quick-edit row */}
        <TouchableOpacity
          onPress={() => Alert.prompt(
            'Update preferred bottle',
            'Enter preferred bottle water ml:',
            (val) => {
              const ml = parseInt(val, 10);
              if (!isNaN(ml) && ml > 0) {
                saveSettings({ ...settings, preferredBottleWaterMl: ml }).then(load, (e) => Alert.alert('Save failed', saveErrorMessage(e)));
              }
            },
            'plain-text',
            String(settings.preferredBottleWaterMl),
          )}
          style={styles.editRow}
        >
          <Text style={styles.editRowText}>{settings.preferredBottleWaterMl} ml 🍼 preferred</Text>
          <Text style={styles.editIcon}>✏️</Text>
        </TouchableOpacity>
        <Text style={styles.cardMuted}>
            {effectiveWeightKg.toFixed(2)} kg ({weightSource === 'who' ? 'WHO est.' : weightSource === 'manual' ? 'measured' : 'settings'}) × {calc.mlPerKgPerDay} ml/kg/day
          </Text>
        <Text style={styles.cardMuted}>
          Thresholds: ±{y}% yellow · ±{r}% red
        </Text>
      </View>

      {/* 4. Next Feed card — shows when preferred bottle size is next available */}
      <View style={[styles.card, { marginBottom: 12 }]}>
        <Text style={styles.cardLabel}>⏭ NEXT FEED</Text>
        {(() => {
          const prog = canTakeProgression(feeds, calc.preferredBottleWaterMl, now, derived.hourlyRate, derived.dailyTargetMl);
          // Find the entry for the preferred bottle size specifically
          const preferredEntry = prog.find(e => e.waterMl === calc.preferredBottleWaterMl);

          if (!preferredEntry) {
            return <Text style={styles.cardSub}>No feeds yet</Text>;
          }

          if (preferredEntry.fitsNow || preferredEntry.isAdvised) {
            return (
              <>
                <Text style={[styles.cardValue, { color: C.green }]}>Now · {calc.preferredBottleWaterMl} 🍼</Text>
                <Text style={[styles.cardSub, { color: C.green }]}>available now</Text>
              </>
            );
          } else {
            return (
              <>
                <Text style={[styles.cardValue, { color: C.rose }]}>
                  {fmtTimeStr(preferredEntry.readyAtMs, tf)} · {calc.preferredBottleWaterMl} 🍼
                </Text>
                <Text style={[styles.cardSub, { color: C.rose }]}>{formatRelative(preferredEntry.readyAtMs, now)}</Text>
              </>
            );
          }
        })()}
      </View>

      {/* 5. Last 3 feeds */}
      <View style={[styles.card, { marginBottom: 12 }]}>
        <Text style={styles.cardLabel}>🍼 RECENT FEEDS</Text>
        {recentFeeds.length === 0 ? (
          <Text style={styles.cardSub}>No feeds yet</Text>
        ) : (
          recentFeeds.map((f) => (
            <View key={f.id} style={styles.feedRow}>
              <Text style={styles.feedTime}>{fmtTimeStr(f.timestamp, tf)}</Text>
              <Text style={styles.feedRelative}>{formatRelative(f.timestamp, now)}</Text>
              <Text style={styles.feedVol}>{f.volume} ml</Text>
            </View>
          ))
        )}
      </View>

      {/* 6. Action buttons */}
      <View style={styles.actionRow}>
        <TouchableOpacity style={styles.logButton} onPress={() => navigation.navigate('Log')}>
          <Text style={styles.logButtonText}>➕ Log Feed</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container:   { flex: 1, backgroundColor: C.bg },
  content:     { padding: 16, paddingBottom: 40 },

  header:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  headerLeft:  { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  title:       { fontSize: 24, fontWeight: '700', color: C.textPrimary },
  version:     { fontSize: 11, color: C.textMuted },
  gearBtn:     { padding: 4 },
  gearText:    { fontSize: 20 },
  subtitle:    { fontSize: 13, color: C.textSecondary, marginBottom: 12 },

  actionRow:        { marginBottom: 8 },
  logButton:        { backgroundColor: C.blue, borderRadius: 12, paddingVertical: 13, alignItems: 'center', marginBottom: 10 },
  logButtonText:    { color: '#fff', fontSize: 16, fontWeight: '600' },
  editRow:         { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 6, borderTopWidth: 1, borderTopColor: '#334155', marginTop: 4 },
  editRowText:      { fontSize: 14, color: C.textSecondary },
  editIcon:         { fontSize: 14 },

  card:        { backgroundColor: C.card, borderRadius: 12, padding: 14, borderColor: C.cardBorder, borderWidth: 1 },
  cardLabel:   { fontSize: 11, color: C.textSecondary, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.6 },
  cardValue:   { fontSize: 20, fontWeight: '700', color: C.textPrimary },
  cardSub:     { fontSize: 13, color: C.textSecondary, marginTop: 2 },
  cardMuted:   { fontSize: 12, color: C.textMuted, marginTop: 3 },
  rowSpaced:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },

  questionCircle:     { width: 18, height: 18, borderRadius: 9, backgroundColor: '#334155', alignItems: 'center', justifyContent: 'center' },
  questionCircleText: { color: C.textSecondary, fontSize: 11, fontWeight: '700', lineHeight: 14 },

  // StatusCard
  statusCols:     { flexDirection: 'row', gap: 12 },
  statusLeft:     { flex: 1, alignItems: 'center' },
  statusRight:    { flex: 1, alignItems: 'center' },
  statusColLabel: { fontSize: 10, color: C.textSecondary, marginBottom: 6, textAlign: 'center' },
  statusBigNum:   { fontSize: 22, fontWeight: '700', textAlign: 'center', marginTop: 4 },
  statusBigUnit:  { fontSize: 13, fontWeight: '400' },
  statusSmall:    { fontSize: 12, fontWeight: '600', textAlign: 'center', marginTop: 2 },
  statusDelta:    { fontSize: 11, color: C.textMuted, textAlign: 'center' },

  gaugeContainer: { alignItems: 'center', marginVertical: 4 },
  gaugeBar:       { width: 26, height: 60, borderRadius: 6, borderWidth: 2, borderColor: '#475569', overflow: 'hidden', justifyContent: 'flex-end', position: 'relative' },
  gaugeFill:      { position: 'absolute', bottom: 0, left: 0, right: 0 },
  gaugeTargetLine:{ position: 'absolute', left: 0, right: 0, height: 1, backgroundColor: 'rgba(255,255,255,0.4)', bottom: '50%' },

  stomachVessel:  { width: 26, height: 60, borderWidth: 2, borderColor: '#475569', borderRadius: 6, overflow: 'hidden', justifyContent: 'flex-end', position: 'relative', marginVertical: 4, borderBottomLeftRadius: 14, borderBottomRightRadius: 14 },
  stomachEmpty:   { position: 'absolute', top: 0, left: 0, right: 0, backgroundColor: 'rgba(20,184,166,0.13)' },
  stomachFill:    { position: 'absolute', bottom: 0, left: 0, right: 0 },

  twinBars:       { flexDirection: 'row', gap: 12, marginTop: 10 },
  twinBarTrack:   { flex: 1, height: 5, backgroundColor: '#334155', borderRadius: 3, overflow: 'hidden' },
  twinBarFill:    { position: 'absolute', left: 0, top: 0, bottom: 0, borderRadius: 3 },
  twinBarTarget:  { position: 'absolute', top: 0, bottom: 0, width: 1, backgroundColor: 'rgba(255,255,255,0.3)', left: `${(100/130)*100}%` as any },

  // Timeline
  timelineStrip:  { position: 'absolute', top: 0, left: 0, right: 0, height: 2, backgroundColor: C.rose, borderTopLeftRadius: 12, borderTopRightRadius: 12 },
  timelineNote:   { fontSize: 11, marginTop: 6 },

  // Feed rows
  feedRow:        { flexDirection: 'row', alignItems: 'center', paddingVertical: 6, borderTopWidth: 1, borderTopColor: '#1e293b' },
  feedTime:       { fontSize: 14, fontWeight: '600', color: C.textPrimary, width: 60 },
  feedRelative:   { flex: 1, fontSize: 12, color: C.textSecondary },
  feedVol:        { fontSize: 14, fontWeight: '600', color: C.textPrimary },
});
