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
  Dimensions,
  Alert,
} from 'react-native';
import Constants from 'expo-constants';
import { useFocusEffect } from '@react-navigation/native';
import Svg, { Line, Circle, Rect, G, Text as SvgText, Polygon } from 'react-native-svg';
import { getFeeds, getSettings, getWeights, saveSettings } from '../lib/store';
import { formatTime, formatDateTime } from '../lib/formatTime';
import {
  deriveSettings,
  strict24hTotal,
  smoothedAtTime,
  smoothedEffective,
  waterToMilk,
  FORMULA_TABLE,
  computePredictors,
  stomachCapMilk,
  stomachLoad,
  canTakeProgression,
  stomachReadyAtMs,
  ghostIntakeReadyAtMs,
  STOMACH_K,
  statusHexColor,
} from '../lib/calculations';
import { Feed, Settings, WeightEntry, PredictorResult } from '../types';

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

const SCREEN_W = Dimensions.get('window').width;
const STANDARD_SIZES = new Set(FORMULA_TABLE.map(e => e.water));
const NEAR_ZERO_ML = 5;

function gastricClearMs(feedTs: number, volumeWaterMl: number): number {
  const milkMl = waterToMilk(volumeWaterMl);
  const hours = Math.log(Math.max(milkMl, NEAR_ZERO_ML + 0.1) / NEAR_ZERO_ML) / STOMACH_K;
  return feedTs + hours * 3_600_000;
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
  predictors: PredictorResult;
  preferredBottleWaterMl: number;
  now: number;
  hourlyRate: number;
  dailyTargetMl: number;
  timeFormat: '24h' | '12h';
}

const TIMELINE_PAD = 24;
const TRACK_Y      = 82;
const LABEL_BASE_Y = TRACK_Y - 28;
const LABEL_LIFT_Y = TRACK_Y - 50;
const TIME_BASE_Y  = TRACK_Y + 18;
const TIME_DROP_Y  = TRACK_Y + 34;
const HOUR_TICK_Y  = TRACK_Y + 4;
const HOUR_LABEL_Y = TRACK_Y + 22;
const SVG_H        = TRACK_Y + 60;
const HALF_HOUR_MS = 30 * 60_000;
const HOUR_MS      = 60 * 60_000;

function fmtHour(ms: number, tf: '24h' | '12h'): string {
  const d = new Date(ms);
  let h = d.getHours();
  if (tf === '12h') {
    const sfx = h >= 12 ? 'p' : 'a';
    h = h % 12 || 12;
    return `${h}${sfx}`;
  }
  return `${String(h).padStart(2, '0')}:00`;
}

function FeedingTimeline({ feeds, predictors, preferredBottleWaterMl, now, hourlyRate, dailyTargetMl, timeFormat }: TimelineProps) {
  const cardW = SCREEN_W - 32; // account for screen padding

  const progression = canTakeProgression(feeds, preferredBottleWaterMl, now, hourlyRate, dailyTargetMl);
  const lastFeed = feeds.length > 0 ? feeds.reduce((a, b) => a.timestamp > b.timestamp ? a : b) : null;
  const lastFeedIsNonStandard = lastFeed ? !STANDARD_SIZES.has(lastFeed.volume) : false;

  // Ghost readyAt: use lastFeed.timestamp as reference (CRITICAL)
  const ghostReadyAt = new Map<number, number>();
  if (lastFeed) {
    const sizes = [...new Set([...progression.map(e => e.waterMl), ...FORMULA_TABLE.map(e => e.water)])];
    for (const wml of sizes) {
      const sMs = stomachReadyAtMs(feeds, wml, preferredBottleWaterMl, lastFeed.timestamp, hourlyRate);
      const iMs = ghostIntakeReadyAtMs(feeds, wml, hourlyRate, dailyTargetMl, lastFeed.timestamp);
      ghostReadyAt.set(wml, Math.max(sMs, iMs));
    }
  } else {
    progression.forEach(e => ghostReadyAt.set(e.waterMl, e.readyAtMs));
  }

  const allFuture = progression.length > 0 && !progression.some(e => e.fitsNow);

  // Timeline bounds
  const LOOKBACK_MS = 12 * 3_600_000;
  const earliestFeed = feeds.length > 0 ? Math.min(...feeds.map(f => f.timestamp)) : now - LOOKBACK_MS;
  const T_START = Math.min(earliestFeed, now - LOOKBACK_MS) - 20 * 60_000;

  const latestProg = progression.length > 0 ? Math.max(...progression.map(e => e.readyAtMs)) : now + 60 * 60_000;
  const lastGastricEnd = lastFeed ? gastricClearMs(lastFeed.timestamp, lastFeed.volume) : now;
  const T_END = Math.max(latestProg, lastGastricEnd) + 25 * 60_000;
  const spanMs = T_END - T_START;

  // Scale: at minimum show a 96px gap between 30-min markers
  const capMilkVal = predictors.stomachCapMilk;
  const t30DecayMs = capMilkVal > 30 ? (-Math.log(1 - 30 / capMilkVal) / STOMACH_K) * 3_600_000 : 20 * 60_000;
  const LABEL_MIN_GAP_PX = 96;
  const minScale = LABEL_MIN_GAP_PX / t30DecayMs;
  const autoScale = (cardW - TIMELINE_PAD) / spanMs;
  const scale = Math.max(autoScale, minScale);

  const SCROLL_W = Math.ceil(spanMs * scale) + TIMELINE_PAD;

  function px(ms: number): number {
    return TIMELINE_PAD / 2 + Math.round((ms - T_START) * scale);
  }

  // Hour ticks
  const hourTicks: { ms: number; isHour: boolean }[] = [];
  const tickStart = Math.ceil(T_START / HALF_HOUR_MS) * HALF_HOUR_MS;
  for (let t = tickStart; t <= T_END; t += HALF_HOUR_MS) {
    hourTicks.push({ ms: t, isHour: t % HOUR_MS === 0 });
  }
  const showHourLabels = HOUR_MS * scale >= 28;
  const showHalfTicks  = HALF_HOUR_MS * scale >= 6;

  // Sorted feeds for band computation
  const sortedFeeds = [...feeds].filter(f => f.timestamp <= now + 60_000).sort((a, b) => a.timestamp - b.timestamp);
  interface GastricBand { feedMs: number; gastricEndMs: number; epochEndMs: number; index: number; }
  const gastricBands: GastricBand[] = sortedFeeds.map((f, i) => ({
    feedMs: f.timestamp,
    gastricEndMs: gastricClearMs(f.timestamp, f.volume),
    epochEndMs: sortedFeeds[i + 1] ? sortedFeeds[i + 1].timestamp : T_END,
    index: i,
  }));

  const EPOCH_BG   = ['rgba(45,212,191,0.06)', 'rgba(148,163,184,0.05)'];
  const GASTRIC_BG = ['rgba(45,212,191,0.15)', 'rgba(100,116,139,0.13)'];

  // Build markers
  interface Marker { ms: number; x: number; numStr: string; showBottle: boolean; header: string; time: string; dotColor: string; labelColor: string; fillDot: boolean; }
  const allMarkers: Marker[] = [];

  // Past feeds (not lastFeed)
  [...feeds].filter(f => f !== lastFeed).sort((a, b) => a.timestamp - b.timestamp).forEach(f => {
    const isNS = !STANDARD_SIZES.has(f.volume);
    allMarkers.push({
      ms: f.timestamp, x: px(f.timestamp),
      numStr: isNS ? `${Math.round(waterToMilk(f.volume))}` : `${f.volume}`,
      showBottle: !isNS, header: '', time: fmtTimeStr(f.timestamp, timeFormat),
      dotColor: '#475569', labelColor: '#94a3b8', fillDot: true,
    });
  });

  // Last feed
  if (lastFeed) {
    const isNS = lastFeedIsNonStandard;
    allMarkers.push({
      ms: lastFeed.timestamp, x: px(lastFeed.timestamp),
      numStr: isNS ? `${Math.round(waterToMilk(lastFeed.volume))}` : `${lastFeed.volume}`,
      showBottle: !isNS, header: 'Last Feed', time: fmtTimeStr(lastFeed.timestamp, timeFormat),
      dotColor: '#475569', labelColor: '#94a3b8', fillDot: true,
    });
  }

  // Progression markers
  progression.forEach(e => {
    if (e.isAdvised) {
      // Ghost marker (from lastFeed.timestamp reference)
      const ghostMs = ghostReadyAt.get(e.waterMl) ?? (lastFeed?.timestamp ?? e.readyAtMs);
      allMarkers.push({
        ms: ghostMs, x: px(ghostMs),
        numStr: `${e.waterMl}`, showBottle: true, header: '', time: fmtTimeStr(ghostMs, timeFormat),
        dotColor: '#475569', labelColor: '#64748b', fillDot: false,
      });
      // Advised marker at now (green)
      allMarkers.push({
        ms: now, x: px(now),
        numStr: `${e.waterMl}`, showBottle: true, header: 'Give now', time: 'now',
        dotColor: C.green, labelColor: C.green, fillDot: true,
      });
    } else if (e.fitsNow) {
      const ghostMs = ghostReadyAt.get(e.waterMl) ?? (lastFeed?.timestamp ?? e.readyAtMs);
      allMarkers.push({
        ms: ghostMs, x: px(ghostMs),
        numStr: `${e.waterMl}`, showBottle: true, header: '', time: fmtTimeStr(ghostMs, timeFormat),
        dotColor: '#475569', labelColor: '#64748b', fillDot: false,
      });
    } else {
      const isAbove = e.waterMl > preferredBottleWaterMl;
      allMarkers.push({
        ms: e.readyAtMs, x: px(e.readyAtMs),
        numStr: `${e.waterMl}`, showBottle: true, header: '', time: fmtTimeStr(e.readyAtMs, timeFormat),
        dotColor: isAbove ? C.teal : C.rose, labelColor: isAbove ? C.teal : C.rose, fillDot: false,
      });
    }
  });

  allMarkers.sort((a, b) => a.ms - b.ms);

  // Collision lifting
  const FS_LABEL  = 15;
  const FS_TIME   = 12;
  const FS_HEADER = 11;
  const FS_HOUR   = 9;

  function approxW(text: string, fs: number): number { return text.length * fs * 0.62; }
  const halfW = allMarkers.map(m => approxW(m.numStr, FS_LABEL) / 2 + (m.showBottle ? FS_LABEL * 0.7 : 0));
  const timeHW = allMarkers.map(m => approxW(m.time, FS_TIME) / 2);

  const lifted = allMarkers.map(() => false);
  for (let i = 1; i < allMarkers.length; i++) {
    if (allMarkers[i].x - halfW[i] < allMarkers[i-1].x + halfW[i-1] + 6) {
      lifted[i] = !lifted[i-1];
      if (lifted[i-1]) lifted[i] = false;
    }
  }
  const timeDrop = allMarkers.map(() => false);
  for (let i = 1; i < allMarkers.length; i++) {
    if (allMarkers[i].x - timeHW[i] < allMarkers[i-1].x + timeHW[i-1] + 6) {
      timeDrop[i] = !timeDrop[i-1];
    }
  }

  const nowX = px(now);

  if (!lastFeed && progression.length === 0) {
    return (
      <View style={[styles.card, { borderColor: 'rgba(244,63,94,0.25)', borderWidth: 1, marginBottom: 12, padding: 12 }]}>
        <View style={styles.timelineStrip} />
        <Text style={styles.cardLabel}>FEEDING TIMELINE</Text>
        <Text style={[styles.cardSub, { marginTop: 8 }]}>No feeds yet</Text>
      </View>
    );
  }

  return (
    <View style={[styles.card, { borderColor: 'rgba(244,63,94,0.25)', borderWidth: 1, marginBottom: 12, padding: 12, minHeight: 160 }]}>
      {/* Gradient top strip via View */}
      <View style={styles.timelineStrip} />

      <View style={styles.rowSpaced}>
        <Text style={styles.cardLabel}>FEEDING TIMELINE</Text>
        <View style={styles.questionCircle}><Text style={styles.questionCircleText}>?</Text></View>
      </View>

      <View style={{ height: 160 }}>
      <ScrollView horizontal={true} scrollEnabled={true} showsHorizontalScrollIndicator={false} nestedScrollEnabled style={{ marginTop: 4 }}>
        <Svg width={SCROLL_W} height={SVG_H} viewBox={`0 0 ${SCROLL_W} ${SVG_H}`}>
          {/* Epoch bands */}
          {gastricBands.map((b, i) => {
            const x1 = Math.max(0, px(b.feedMs));
            const x2 = Math.min(SCROLL_W, px(b.epochEndMs));
            if (x2 <= x1) return null;
            return <Rect key={`ep-${i}`} x={x1} y={0} width={x2-x1} height={SVG_H} fill={EPOCH_BG[i%2]} />;
          })}

          {/* Gastric active zone */}
          {gastricBands.map((b, i) => {
            const x1 = Math.max(0, px(b.feedMs));
            const x2 = Math.min(SCROLL_W, px(Math.min(b.gastricEndMs, b.epochEndMs)));
            if (x2 <= x1) return null;
            return <Rect key={`ga-${i}`} x={x1} y={0} width={x2-x1} height={SVG_H} fill={GASTRIC_BG[i%2]} />;
          })}

          {/* Hour ticks */}
          {hourTicks.map((tick, i) => {
            if (!tick.isHour && !showHalfTicks) return null;
            const x = px(tick.ms);
            if (x < 0 || x > SCROLL_W) return null;
            return (
              <G key={`ht-${i}`}>
                <Line
                  x1={x} y1={HOUR_TICK_Y}
                  x2={x} y2={tick.isHour ? HOUR_TICK_Y + 9 : HOUR_TICK_Y + 5}
                  stroke={tick.isHour ? '#334155' : '#293548'}
                  strokeWidth={tick.isHour ? 1.5 : 1}
                />
                {tick.isHour && showHourLabels && (
                  <SvgText x={x} y={HOUR_LABEL_Y}
                    textAnchor="middle" fontSize={FS_HOUR}
                    fill="#475569" fontFamily="monospace">
                    {fmtHour(tick.ms, timeFormat)}
                  </SvgText>
                )}
              </G>
            );
          })}

          {/* Main track line */}
          <Line x1={0} y1={TRACK_Y} x2={SCROLL_W} y2={TRACK_Y} stroke="#334155" strokeWidth={1.5} />

          {/* "Now" dashed reference */}
          <G>
            <Line x1={nowX} y1={0} x2={nowX} y2={SVG_H}
              stroke="#475569" strokeWidth={1} strokeDasharray="3,3" opacity={0.28} />
            <SvgText x={nowX} y={12}
              textAnchor="middle" fontSize={9} fill="#475569" fontFamily="monospace">
              now
            </SvgText>
          </G>

          {/* Feed markers */}
          {allMarkers.map((m, i) => {
            const isLift = lifted[i];
            const isDrop = timeDrop[i];
            const labelY = isLift ? LABEL_LIFT_Y : LABEL_BASE_Y;
            const headerY = labelY - 16;
            const timeY = isDrop ? TIME_DROP_Y : TIME_BASE_Y;
            const nHW = approxW(m.numStr, FS_LABEL) / 2;

            return (
              <G key={`m-${i}`}>
                {isLift && (
                  <Line x1={m.x} y1={labelY+4} x2={m.x} y2={TRACK_Y-10}
                    stroke={m.dotColor} strokeWidth={1} strokeDasharray="3,2" opacity={0.55} />
                )}
                {isDrop && (
                  <Line x1={m.x} y1={TRACK_Y+8} x2={m.x} y2={timeY-4}
                    stroke={m.dotColor} strokeWidth={1} strokeDasharray="3,2" opacity={0.45} />
                )}
                {!isLift && (
                  <Line x1={m.x} y1={TRACK_Y-8} x2={m.x} y2={TRACK_Y+8}
                    stroke={m.dotColor} strokeWidth={1.5} />
                )}
                <Circle cx={m.x} cy={TRACK_Y} r={6}
                  fill={m.fillDot ? m.dotColor : '#1e293b'}
                  stroke={m.dotColor} strokeWidth={2.5} />
                {!!m.header && (
                  <SvgText x={m.x} y={headerY} textAnchor="middle"
                    fontSize={FS_HEADER} fill="#64748b" fontFamily="system-ui,sans-serif">
                    {m.header}
                  </SvgText>
                )}
                <SvgText x={m.x} y={labelY} textAnchor="middle"
                  fontSize={FS_LABEL} fontWeight="bold"
                  fill={m.labelColor} fontFamily="monospace">
                  {m.numStr}
                </SvgText>
                {m.showBottle && (
                  <SvgText x={m.x + nHW + 2} y={labelY}
                    textAnchor="start" fontSize={FS_LABEL} fill={m.labelColor}>
                    🍼
                  </SvgText>
                )}
                <SvgText x={m.x} y={timeY} textAnchor="middle"
                  fontSize={FS_TIME} fontWeight="600"
                  fill={m.labelColor} fontFamily="monospace">
                  {m.time}
                </SvgText>
              </G>
            );
          })}
        </Svg>
      </ScrollView>
      </View>

      {allFuture && (() => {
        const currentSmoothed = smoothedAtTime(feeds, hourlyRate, now);
        const isStomachLimited = currentSmoothed < dailyTargetMl;
        return (
          <Text style={[styles.timelineNote, { color: isStomachLimited ? C.textSecondary : C.orange }]}>
            {isStomachLimited
              ? `Stomach full — next feed at ${progression.length > 0 ? fmtTimeStr(progression[0].readyAtMs, timeFormat) : '?'}`
              : 'Well fed — all sizes available later'}
          </Text>
        );
      })()}
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
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    const [f, s, w] = await Promise.all([getFeeds(), getSettings(), getWeights()]);
    setFeeds(f);
    setSettings(s);
    setWeights(w);
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

  // Issue 6: Effective weight from most recent weight entry (≤7 days old)
  const SEVEN_DAYS_MS = 7 * 24 * 3_600_000;
  const sortedWeights = [...weights].sort((a, b) => b.timestamp - a.timestamp);
  const latestWeight = sortedWeights[0];
  const effectiveWeightKg =
    latestWeight && (now - latestWeight.timestamp) <= SEVEN_DAYS_MS
      ? latestWeight.weightKg
      : settings.weightKg;

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

  const predictors: PredictorResult | null = computePredictors(
    feeds, derived.hourlyRate, derived.dailyTargetMl, settings.preferredBottleWaterMl
  );

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
        {settings.weightKg} kg · Target {Math.round(derived.dailyTargetMl)} ml/day
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
      {predictors && (
        <FeedingTimeline
          feeds={feeds}
          predictors={predictors}
          preferredBottleWaterMl={settings.preferredBottleWaterMl}
          now={now}
          hourlyRate={derived.hourlyRate}
          dailyTargetMl={derived.dailyTargetMl}
          timeFormat={tf}
        />
      )}

      {/* 3. Next Feed card (advised from canTakeProgression) */}
      <View style={[styles.card, { marginBottom: 12 }]}>
        <Text style={styles.cardLabel}>⏭ NEXT FEED</Text>
        {(() => {
          const prog = canTakeProgression(feeds, settings.preferredBottleWaterMl, now, derived.hourlyRate, derived.dailyTargetMl);
          const advised = prog.find(e => e.isAdvised);
          const fitsNowList = prog.filter(e => e.fitsNow);
          const nextFuture = prog.filter(e => !e.fitsNow).sort((a, b) => a.readyAtMs - b.readyAtMs)[0];

          if (advised) {
            return (
              <>
                <Text style={[styles.cardValue, { color: C.green }]}>{fmtTimeStr(now, tf)}</Text>
                <Text style={[styles.cardSub, { color: C.green }]}>now</Text>
                <Text style={styles.cardMuted}>{advised.waterMl} ml water 🍼</Text>
              </>
            );
          } else if (fitsNowList.length > 0) {
            const entry = fitsNowList[fitsNowList.length - 1];
            return (
              <>
                <Text style={styles.cardValue}>{fmtTimeStr(now, tf)}</Text>
                <Text style={styles.cardSub}>now</Text>
                <Text style={styles.cardMuted}>{entry.waterMl} ml water 🍼</Text>
              </>
            );
          } else if (nextFuture) {
            return (
              <>
                <Text style={styles.cardValue}>{fmtTimeStr(nextFuture.readyAtMs, tf)}</Text>
                <Text style={styles.cardSub}>{formatRelative(nextFuture.readyAtMs, now)}</Text>
                <Text style={styles.cardMuted}>{nextFuture.waterMl} ml water 🍼</Text>
              </>
            );
          } else {
            return <Text style={styles.cardSub}>No feeds yet</Text>;
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
        <Text style={styles.cardMuted}>{effectiveWeightKg} kg × {settings.mlPerKgPerDay} ml/kg/day</Text>
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
