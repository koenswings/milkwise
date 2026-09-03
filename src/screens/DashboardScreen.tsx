/**
 * DashboardScreen v2 — matches web app design (MilkWise v1.1.0)
 *
 * Layout (top→bottom):
 *   1. Header: MilkWise + version + settings gear
 *   2. Status card (smoothed intake + stomach vessel)
 *   3. Feeding Timeline (horizontal scrollable SVG, react-native-svg)
 *   4. Next Feed card (Predictor A)
 *   5. Daily Target card
 *   6. Last 3 feeds list
 */

import React, { useState, useCallback, useEffect, useRef } from 'react';
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

import { getFeeds, getSettings, getWeights, saveSettings } from '../lib/store';
import { predictWeightKg } from '../lib/whoGrowth';
import { formatTime, formatDateTime } from '../lib/formatTime';
import {
  deriveSettings,
  strict24hTotal,
  smoothedEffective,
  stomachCapMilk,
  stomachLoad,
  canTakeProgression,
  stomachReadyAtMs,
  ghostIntakeReadyAtMs,
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

function FeedingTimeline({ feeds, preferredBottleWaterMl, now, hourlyRate, dailyTargetMl, timeFormat }: Omit<TimelineProps, 'predictors'>) {
  const lastFeed = feeds.length > 0 ? feeds.reduce((a, b) => a.timestamp > b.timestamp ? a : b) : null;

  const progression = canTakeProgression(feeds, preferredBottleWaterMl, now, hourlyRate, dailyTargetMl);

  // Ghost readyAt: computed from lastFeed.timestamp
  const ghostReadyAt = new Map<number, number>();
  if (lastFeed) {
    for (const e of progression) {
      const sMs = stomachReadyAtMs(feeds, e.waterMl, preferredBottleWaterMl, lastFeed.timestamp, hourlyRate);
      const iMs = ghostIntakeReadyAtMs(feeds, e.waterMl, hourlyRate, dailyTargetMl, lastFeed.timestamp);
      ghostReadyAt.set(e.waterMl, Math.max(sMs, iMs));
    }
  }

  // Build marker list
  interface Marker {
    label: string;
    time: string;
    dotColor: string;
    fillDot: boolean;
    header?: string;
  }

  const markers: Marker[] = [];

  // Last feed marker
  if (lastFeed) {
    markers.push({
      label: `${lastFeed.volume} 🍼`,
      time: fmtTimeStr(lastFeed.timestamp, timeFormat),
      dotColor: '#475569',
      fillDot: true,
      header: 'Last feed',
    });
  }

  // Ghost markers (fitsNow but not advised)
  for (const e of progression) {
    const ghostMs = ghostReadyAt.get(e.waterMl) ?? (lastFeed?.timestamp ?? e.readyAtMs);
    if (e.fitsNow && !e.isAdvised) {
      markers.push({
        label: `${e.waterMl} 🍼`,
        time: fmtTimeStr(ghostMs, timeFormat),
        dotColor: '#475569',
        fillDot: false,
      });
    } else if (e.isAdvised) {
      // Ghost first
      markers.push({
        label: `${e.waterMl} 🍼`,
        time: fmtTimeStr(ghostMs, timeFormat),
        dotColor: '#475569',
        fillDot: false,
      });
      // Then advised at now
      markers.push({
        label: `${e.waterMl} 🍼`,
        time: 'now',
        dotColor: '#4ade80',
        fillDot: true,
        header: 'Give now',
      });
    } else {
      // Future
      const isAbove = e.waterMl > preferredBottleWaterMl;
      markers.push({
        label: `${e.waterMl} 🍼`,
        time: fmtTimeStr(e.readyAtMs, timeFormat),
        dotColor: isAbove ? '#2dd4bf' : '#f43f5e',
        fillDot: false,
      });
    }
  }

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
  const [now, setNow] = useState(Date.now());
  const [effectiveWeightKg, setEffectiveWeightKg] = useState<number>(6.27);
  const [weightSource, setWeightSource] = useState<'manual' | 'who' | 'settings'>('settings');
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    const [f, s, w] = await Promise.all([getFeeds(), getSettings(), getWeights()]);
    setFeeds(f);
    setSettings(s);
    setWeights(w);

    // WHO weight model — mirrors web app page.tsx
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const startOfTodayMs = startOfToday.getTime();

    let newEffectiveWeightKg = s.weightKg;
    let newWeightSource: 'manual' | 'who' | 'settings' = 'settings';

    if (w.length > 0) {
      const latestWeight = [...w].sort((a, b) => b.timestamp - a.timestamp)[0];
      const daysSinceLast = (startOfTodayMs - latestWeight.timestamp) / 86_400_000;
      if (daysSinceLast <= 7) {
        newEffectiveWeightKg = latestWeight.weightKg;
        newWeightSource = 'manual';
      } else if (s.dateOfBirthMs && s.sex) {
        const predicted = predictWeightKg(w, s.dateOfBirthMs, s.sex, startOfTodayMs);
        if (predicted !== null) {
          newEffectiveWeightKg = predicted;
          newWeightSource = 'who';
        } else {
          newEffectiveWeightKg = latestWeight.weightKg;
          newWeightSource = 'manual';
        }
      } else {
        newEffectiveWeightKg = latestWeight.weightKg;
        newWeightSource = 'manual';
      }
    }

    setEffectiveWeightKg(newEffectiveWeightKg);
    setWeightSource(newWeightSource);
    // Don't update 'now' here — only the timer tick updates it so status stays frozen
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
      // Tick every 60s: only updates 'now' for relative time labels
      intervalRef.current = setInterval(() => setNow(Date.now()), 60_000);
      return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
    }, [load])
  );

  const derived = deriveSettings({ ...settings, weightKg: effectiveWeightKg });

  const lastFeed = feeds.length > 0
    ? feeds.reduce((a, b) => (a.timestamp > b.timestamp ? a : b))
    : null;

  // Status is FROZEN at lastFeed.timestamp — not live
  const smoothedAt = lastFeed ? lastFeed.timestamp : now;

  const { totalMl: smoothedMl } = smoothedEffective(
    feeds, derived.hourlyRate, settings.preferredBottleWaterMl, smoothedAt
  );
  const smoothedPct = (smoothedMl / derived.dailyTargetMl) * 100;

  // Stomach at live now (for StatusCard right column)
  const capMilkVal = stomachCapMilk(settings.preferredBottleWaterMl, derived.hourlyRate);
  const loadNow = stomachLoad(feeds, now);

  const recentFeeds = [...feeds]
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, 3);

  const y = settings.yellowThresholdPct;
  const r = settings.redThresholdPct;
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

      {/* 2. Feeding Timeline */}
      <FeedingTimeline
        feeds={feeds}
        preferredBottleWaterMl={settings.preferredBottleWaterMl}
        now={now}
        hourlyRate={derived.hourlyRate}
        dailyTargetMl={derived.dailyTargetMl}
        timeFormat={tf}
      />

      {/* 3. Next Feed card — shows when preferred bottle size is next available */}
      <View style={[styles.card, { marginBottom: 12 }]}>
        <Text style={styles.cardLabel}>⏭ NEXT FEED</Text>
        {(() => {
          const prog = canTakeProgression(feeds, settings.preferredBottleWaterMl, now, derived.hourlyRate, derived.dailyTargetMl);
          // Find the entry for the preferred bottle size specifically
          const preferredEntry = prog.find(e => e.waterMl === settings.preferredBottleWaterMl);

          if (!preferredEntry) {
            return <Text style={styles.cardSub}>No feeds yet</Text>;
          }

          if (preferredEntry.fitsNow || preferredEntry.isAdvised) {
            return (
              <>
                <Text style={[styles.cardValue, { color: C.green }]}>Now · {settings.preferredBottleWaterMl} 🍼</Text>
                <Text style={[styles.cardSub, { color: C.green }]}>available now</Text>
              </>
            );
          } else {
            return (
              <>
                <Text style={[styles.cardValue, { color: C.rose }]}>
                  {fmtTimeStr(preferredEntry.readyAtMs, tf)} · {settings.preferredBottleWaterMl} 🍼
                </Text>
                <Text style={[styles.cardSub, { color: C.rose }]}>{formatRelative(preferredEntry.readyAtMs, now)}</Text>
              </>
            );
          }
        })()}
      </View>

      {/* 4. Daily Target card */}
      <View style={[styles.card, { marginBottom: 12 }]}>
        <Text style={styles.cardLabel}>🎯 DAILY TARGET</Text>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
          <Text style={styles.cardValue}>{Math.round(derived.dailyTargetMl)} ml</Text>
          <Text style={styles.cardMuted}>·</Text>
          <Text style={[styles.cardValue, { fontSize: 15 }]}>
            {settings.preferredBottleWaterMl} ml bottle
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
                saveSettings({ ...settings, weightKg: kg }).then(load);
              }
            },
            'plain-text',
            String(effectiveWeightKg),
          )}
          style={styles.editRow}
        >
          <Text style={styles.editRowText}>⚖️ {effectiveWeightKg} kg</Text>
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
                saveSettings({ ...settings, preferredBottleWaterMl: ml }).then(load);
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
            {effectiveWeightKg.toFixed(2)} kg ({weightSource === 'who' ? 'WHO est.' : weightSource === 'manual' ? 'measured' : 'settings'}) × {settings.mlPerKgPerDay} ml/kg/day
          </Text>
        <Text style={styles.cardMuted}>
          Thresholds: ±{y}% yellow · ±{r}% red
        </Text>
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
