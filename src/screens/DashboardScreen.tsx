import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Modal,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { getFeeds, getSettings } from '../lib/store';
import { formatDateTime, formatTime } from '../lib/formatTime';
import {
  deriveSettings,
  strict24hTotal,
  smoothedEffective,
  nextFeedTime,
  bottleCredit,
  statusHexColor,
} from '../lib/calculations';
import { Feed, Settings } from '../types';

const COLORS = {
  bg: '#0f172a',
  card: '#1e293b',
  cardAlt: '#263148',
  textPrimary: '#e2e8f0',
  textSecondary: '#94a3b8',
  textMuted: '#64748b',
  blue: '#3b82f6',
  green: '#4ade80',
  yellow: '#facc15',
  red: '#f87171',
  border: '#334155',
};

function statusLabel(pct: number, y = 5, r = 10): string {
  const diff = Math.abs(pct - 100);
  if (diff <= y) return 'on track';
  if (pct > 100) return diff <= r ? 'slightly overfed' : '⚠️ overfed';
  return diff <= r ? 'slightly behind' : '⚠️ behind';
}

function isToday(ts: number): boolean {
  const d = new Date(ts);
  const t = new Date();
  return d.getDate() === t.getDate() && d.getMonth() === t.getMonth() && d.getFullYear() === t.getFullYear();
}

function isTomorrow(ts: number): boolean {
  const d = new Date(ts);
  const t = new Date();
  t.setDate(t.getDate() + 1);
  return d.getDate() === t.getDate() && d.getMonth() === t.getMonth() && d.getFullYear() === t.getFullYear();
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

interface SmoothedExplainerProps {
  visible: boolean;
  onClose: () => void;
  hourlyRate: number;
  standardBottleVolume: number;
  dailyTargetMl: number;
  feeds: Feed[];
  now: number;
  yellowThresholdPct: number;
  redThresholdPct: number;
}

function SmoothedExplainerModal({ visible, onClose, hourlyRate, standardBottleVolume, dailyTargetMl, feeds, now, yellowThresholdPct, redThresholdPct }: SmoothedExplainerProps) {
  const targetBottles = (dailyTargetMl / standardBottleVolume).toFixed(1);

  const sorted = [...feeds].sort((a, b) => b.timestamp - a.timestamp);
  const withCredit = sorted.map((f) => {
    const ageHours = (now - f.timestamp) / (1000 * 60 * 60);
    const credit = bottleCredit(ageHours, f.volume, hourlyRate);
    return { ...f, ageHours, credit };
  });

  const withSomeCredit = withCredit.filter((f) => f.credit > 0.1);
  const noCredit = withCredit.filter((f) => f.credit <= 0.1);
  const totalSmoothedMl = withCredit.reduce((sum, f) => sum + f.credit, 0);
  const smoothedBottles = totalSmoothedMl / standardBottleVolume;
  const smoothedPct = (totalSmoothedMl / dailyTargetMl) * 100;

  const pctColor = smoothedPct >= 100 ? COLORS.green : smoothedPct >= 90 ? COLORS.yellow : COLORS.red;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity activeOpacity={1} style={styles.modalSheet}>
          <ScrollView showsVerticalScrollIndicator={false}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>How is Smoothed % calculated?</Text>
              <TouchableOpacity onPress={onClose}>
                <Text style={styles.modalClose}>✕</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.explainerSection}>
              <Text style={styles.explainerHeading}>The core idea</Text>
              <Text style={styles.explainerText}>
                A bottle your baby drank <Text style={styles.bold}>1 hour ago</Text> fully counts toward today's intake.
                A bottle from <Text style={styles.bold}>30 hours ago</Text> barely counts — most of that nutrition is already
                in the past. The Smoothed calculation gives each bottle a <Text style={styles.italic}>credit score</Text> based on
                how long ago it was given.
              </Text>
            </View>

            <View style={styles.explainerSection}>
              <Text style={styles.explainerHeading}>Step 1 — score each bottle</Text>
              <Text style={styles.explainerText}>
                Every bottle starts with full credit equal to its volume (e.g. {standardBottleVolume} ml).
              </Text>
              <Text style={[styles.explainerText, { marginTop: 6 }]}>
                If a bottle was given <Text style={styles.bold}>less than 24 hours ago</Text>, it keeps its full credit.
              </Text>
              <Text style={[styles.explainerText, { marginTop: 6 }]}>
                If a bottle was given <Text style={styles.bold}>more than 24 hours ago</Text>, credit decays at{' '}
                <Text style={styles.bold}>{hourlyRate.toFixed(1)} ml per hour</Text> until it hits zero.
              </Text>
              <View style={styles.exampleBox}>
                <Text style={styles.exampleText}>
                  <Text style={styles.bold}>Example:</Text> A {standardBottleVolume} ml bottle given 26 hours ago.{'\n'}
                  Hours beyond 24: 2h → credit lost: {(2 * hourlyRate).toFixed(0)} ml{'\n'}
                  Remaining credit: {Math.max(0, standardBottleVolume - 2 * hourlyRate).toFixed(0)} ml
                </Text>
              </View>
            </View>

            <View style={styles.explainerSection}>
              <Text style={styles.explainerHeading}>Step 2 — add it all up</Text>
              <Text style={styles.explainerText}>
                We add credits from every bottle ever logged, divide by the bottle size ({standardBottleVolume} ml)
                to get a bottle count, then divide by your daily target ({dailyTargetMl.toFixed(0)} ml / {targetBottles} bottles) × 100 for the percentage.
              </Text>
            </View>

            <View style={styles.explainerSection}>
              <Text style={styles.explainerHeading}>What the % means</Text>
              <Text style={styles.explainerText}>The goal is to stay close to 100% — not just above it. Both underfeeding and overfeeding carry risks:</Text>
              <View style={{ marginTop: 8 }}>
                <Text style={[styles.explainerText, { color: COLORS.red }]}>⚠️ {'>'} {100 + redThresholdPct}% — significantly overfed 🔴</Text>
                <Text style={[styles.explainerText, { color: COLORS.yellow }]}>🟡 {'>'} {100 + yellowThresholdPct}% — slightly overfed, just watch</Text>
                <Text style={[styles.explainerText, { color: COLORS.green }]}>🟢 {100 - yellowThresholdPct}–{100 + yellowThresholdPct}% — good zone, on track</Text>
                <Text style={[styles.explainerText, { color: COLORS.yellow }]}>🟡 {100 - redThresholdPct}–{100 - yellowThresholdPct - 1}% — slightly behind, offer a feed soon</Text>
                <Text style={[styles.explainerText, { color: COLORS.red }]}>⚠️ {'<'} {100 - redThresholdPct}% — significantly behind, feed now 🔴</Text>
              </View>
            </View>

            <View style={styles.explainerSection}>
              <Text style={styles.explainerHeading}>Why does credit decay after 24 hours?</Text>
              <Text style={styles.explainerText}>
                The decay is based on <Text style={styles.bold}>energy balance</Text>. Your baby burns through energy
                continuously at roughly <Text style={styles.bold}>{hourlyRate.toFixed(1)} ml-equivalent per hour</Text> —
                your daily target spread evenly across 24 hours. A bottle given 30 hours ago contributed its energy then, but in the 6 hours
                beyond the 24h window your baby burned through {(hourlyRate * 6).toFixed(0)} ml-worth of energy.
                Subtracting that gives a better model of how much of that bottle’s energy is still
                “in effect” — sustaining the baby right now. This is why the Smoothed number tracks the
                running energy balance, not just a fixed window.
              </Text>
            </View>

            {feeds.length > 0 && (
              <View style={styles.explainerSection}>
                <Text style={styles.explainerHeading}>Your actual feeds right now</Text>

                {withSomeCredit.length === 0 ? (
                  <Text style={styles.explainerText}>No feeds with remaining credit.</Text>
                ) : (
                  <View style={styles.feedTable}>
                    <View style={[styles.feedTableRow, styles.feedTableHeader]}>
                      <Text style={[styles.feedTableCell, { flex: 2, color: COLORS.textSecondary }]}>Feed time</Text>
                      <Text style={[styles.feedTableCell, { color: COLORS.textSecondary, textAlign: 'right' }]}>Vol</Text>
                      <Text style={[styles.feedTableCell, { color: COLORS.textSecondary, textAlign: 'right' }]}>Age</Text>
                      <Text style={[styles.feedTableCell, { color: COLORS.textSecondary, textAlign: 'right' }]}>Credit</Text>
                    </View>
                    {withSomeCredit.map((f) => (
                      <View key={f.id} style={[styles.feedTableRow, styles.feedTableRowBorder]}>
                        <Text style={[styles.feedTableCell, { flex: 2, color: COLORS.textSecondary, fontSize: 11 }]}>{formatDateTime(f.timestamp)}</Text>
                        <Text style={[styles.feedTableCell, { textAlign: 'right' }]}>{f.volume}</Text>
                        <Text style={[styles.feedTableCell, { textAlign: 'right', color: f.ageHours < 24 ? COLORS.green : COLORS.yellow }]}>
                          {f.ageHours.toFixed(1)}h
                        </Text>
                        <Text style={[styles.feedTableCell, { textAlign: 'right', color: f.credit >= f.volume - 0.1 ? COLORS.green : COLORS.yellow }]}>
                          {f.credit.toFixed(0)} ml
                        </Text>
                      </View>
                    ))}
                    {noCredit.length > 0 && (
                      <View style={[styles.feedTableRow, styles.feedTableRowBorder]}>
                        <Text style={{ color: COLORS.textMuted, fontSize: 11, fontStyle: 'italic', padding: 8 }}>
                          + {noCredit.length} older feed{noCredit.length > 1 ? 's' : ''} with no remaining credit
                        </Text>
                      </View>
                    )}
                  </View>
                )}

                <View style={styles.totalsBox}>
                  <View style={styles.totalsRow}>
                    <Text style={styles.totalsLabel}>Total credit</Text>
                    <Text style={styles.totalsValue}>{totalSmoothedMl.toFixed(0)} ml</Text>
                  </View>
                  <View style={styles.totalsRow}>
                    <Text style={styles.totalsLabel}>÷ bottle size ({standardBottleVolume} ml)</Text>
                    <Text style={styles.totalsValue}>= {smoothedBottles.toFixed(2)} bottles</Text>
                  </View>
                  <View style={styles.totalsRow}>
                    <Text style={styles.totalsLabel}>÷ daily target × 100</Text>
                    <Text style={[styles.totalsValue, { color: pctColor, fontWeight: '700' }]}>= {smoothedPct.toFixed(1)}%</Text>
                  </View>
                </View>
              </View>
            )}

            <TouchableOpacity style={styles.modalDismissBtn} onPress={onClose}>
              <Text style={styles.modalDismissBtnText}>Got it</Text>
            </TouchableOpacity>
          </ScrollView>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

export default function DashboardScreen({ navigation }: any) {
  const [feeds, setFeeds] = useState<Feed[]>([]);
  const [settings, setSettings] = useState<Settings>({
    weightKg: 6.27,
    mlPerKgPerDay: 150,
    standardBottleVolume: 90,
    yellowThresholdPct: 5,
    redThresholdPct: 10,
    timeFormat: '24h',
  });
  const [showSmoothedExplainer, setShowSmoothedExplainer] = useState(false);
  const [now, setNow] = useState(Date.now());
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    const [f, s] = await Promise.all([getFeeds(), getSettings()]);
    setFeeds(f);
    setSettings(s);
    setNow(Date.now());
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
      intervalRef.current = setInterval(() => {
        load();
      }, 60000);
      return () => {
        if (intervalRef.current) clearInterval(intervalRef.current);
      };
    }, [load])
  );

  const derived = deriveSettings(settings);


  const lastFeed = feeds.length > 0
    ? feeds.reduce((a, b) => (a.timestamp > b.timestamp ? a : b))
    : null;

  // Smoothed frozen at last-feed time — only changes when a new feed is logged
  const smoothedAt = lastFeed ? lastFeed.timestamp : now;
  const strict24 = strict24hTotal(feeds, smoothedAt);
  const strictPct = (strict24 / derived.dailyTargetMl) * 100;
  const smoothed = smoothedEffective(feeds, derived.hourlyRate, settings.standardBottleVolume, smoothedAt);
  const smoothedPct = (smoothed.totalMl / derived.dailyTargetMl) * 100;

  const nextTs = nextFeedTime(feeds, derived.idealIntervalHours);

  const feeds24h = feeds.filter(f => f.timestamp >= now - 86400000);
  const mlPerHour = (derived.hourlyRate).toFixed(1);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={styles.title}>🍼 MilkWise</Text>
        <Text style={styles.subtitle}>
          {settings.weightKg} kg · Target {derived.dailyTargetMl.toFixed(0)} ml/day
        </Text>
      </View>

      <TouchableOpacity
        style={styles.logButton}
        onPress={() => navigation.navigate('Log')}
      >
        <Text style={styles.logButtonText}>+ Log Feed</Text>
      </TouchableOpacity>

      {/* Status Cards */}
      <View style={styles.row}>
        {/* Strict 24h */}
        <View style={[styles.card, styles.halfCard]}>
          <Text style={styles.cardLabel}>Strict 24h</Text>
          <Text style={[styles.cardValue, { color: statusHexColor(strictPct, settings.yellowThresholdPct, settings.redThresholdPct) }]}>
            {strict24.toFixed(0)} ml
          </Text>
          <Text style={[styles.cardPct, { color: statusHexColor(strictPct, settings.yellowThresholdPct, settings.redThresholdPct) }]}>
            {strictPct.toFixed(0)}%
          </Text>
          <Text style={[styles.cardMuted, { color: statusHexColor(strictPct, settings.yellowThresholdPct, settings.redThresholdPct) }]}>{statusLabel(strictPct, settings.yellowThresholdPct, settings.redThresholdPct)}</Text>
        </View>

        {/* Smoothed */}
        <View style={[styles.card, styles.halfCard]}>
          <View style={styles.rowSpaced}>
            <Text style={styles.cardLabel}>Smoothed</Text>
            <TouchableOpacity onPress={() => setShowSmoothedExplainer(true)}>
              <Text style={styles.questionBtn}>?</Text>
            </TouchableOpacity>
          </View>
          <Text style={[styles.cardValue, { color: statusHexColor(smoothedPct, settings.yellowThresholdPct, settings.redThresholdPct) }]}>
            {smoothed.bottles.toFixed(1)} bottles
          </Text>
          <Text style={[styles.cardPct, { color: statusHexColor(smoothedPct, settings.yellowThresholdPct, settings.redThresholdPct) }]}>
            {smoothedPct.toFixed(0)}%
          </Text>
          <Text style={[styles.cardMuted, { color: statusHexColor(smoothedPct, settings.yellowThresholdPct, settings.redThresholdPct) }]}>{statusLabel(smoothedPct, settings.yellowThresholdPct, settings.redThresholdPct)}</Text>
        </View>
      </View>

      {/* Next / Last feed */}
      <View style={styles.row}>
        <View style={[styles.card, styles.halfCard]}>
          <Text style={styles.cardLabel}>⏭ Next Feed</Text>
          {nextTs ? (
            <>
              <Text style={styles.cardValue}>{formatDateTime(nextTs, settings.timeFormat)}</Text>
              <Text style={styles.cardSub}>{formatRelative(nextTs, now)}</Text>
              <Text style={styles.cardMuted}>ideal: {derived.idealIntervalHours.toFixed(1)}h</Text>
            </>
          ) : (
            <Text style={styles.cardSub}>No feeds yet</Text>
          )}
        </View>

        <View style={[styles.card, styles.halfCard]}>
          <Text style={styles.cardLabel}>🕐 Last Feed</Text>
          {lastFeed ? (
            <>
              <Text style={styles.cardValue}>{formatDateTime(lastFeed.timestamp, settings.timeFormat)}</Text>
              <Text style={styles.cardSub}>{lastFeed.volume} ml</Text>
              <Text style={styles.cardMuted}>{formatRelative(lastFeed.timestamp, now)}</Text>
            </>
          ) : (
            <Text style={styles.cardSub}>No feeds yet</Text>
          )}
        </View>
      </View>

      {/* Daily target */}
      <View style={[styles.card, { marginBottom: 12 }]}>
        <Text style={styles.cardLabel}>🎯 Daily Target</Text>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8, marginTop: 4 }}>
          <Text style={styles.cardValue}>{Math.round(derived.dailyTargetMl)} ml</Text>
          <Text style={styles.cardMuted}>·</Text>
          <Text style={[styles.cardValue, { fontSize: 16 }]}>{(derived.dailyTargetMl / settings.standardBottleVolume).toFixed(1)} × {settings.standardBottleVolume} ml bottles</Text>
        </View>
        <Text style={styles.cardMuted}>{settings.weightKg} kg × {settings.mlPerKgPerDay} ml/kg/day</Text>
      </View>

      {/* Summary row */}
      <View style={styles.card}>
        <View style={styles.summaryRow}>
          <View style={styles.summaryItem}>
            <Text style={styles.summaryValue}>{feeds.length}</Text>
            <Text style={styles.summaryLabel}>Total feeds</Text>
          </View>
          <View style={styles.summaryItem}>
            <Text style={styles.summaryValue}>{feeds24h.length}</Text>
            <Text style={styles.summaryLabel}>Last 24h</Text>
          </View>
          <View style={styles.summaryItem}>
            <Text style={styles.summaryValue}>{mlPerHour}</Text>
            <Text style={styles.summaryLabel}>ml/hour</Text>
          </View>
        </View>
      </View>

      <SmoothedExplainerModal
        visible={showSmoothedExplainer}
        onClose={() => setShowSmoothedExplainer(false)}
        hourlyRate={derived.hourlyRate}
        standardBottleVolume={settings.standardBottleVolume}
        dailyTargetMl={derived.dailyTargetMl}
        feeds={feeds}
        now={smoothedAt}
        yellowThresholdPct={settings.yellowThresholdPct}
        redThresholdPct={settings.redThresholdPct}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  content: { padding: 16, paddingBottom: 32 },
  header: { marginBottom: 20, alignItems: 'center' },
  title: { fontSize: 28, fontWeight: '700', color: COLORS.textPrimary },
  subtitle: { fontSize: 14, color: COLORS.textSecondary, marginTop: 4 },
  logButton: {
    backgroundColor: COLORS.blue,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 16,
  },
  logButtonText: { color: '#fff', fontSize: 17, fontWeight: '600' },
  row: { flexDirection: 'row', gap: 12, marginBottom: 12 },
  card: {
    backgroundColor: COLORS.card,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  halfCard: { flex: 1, marginBottom: 0 },
  cardLabel: { fontSize: 12, color: COLORS.textSecondary, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 },
  cardValue: { fontSize: 20, fontWeight: '700', color: COLORS.textPrimary },
  cardPct: { fontSize: 16, fontWeight: '600', marginTop: 2 },
  cardSub: { fontSize: 12, color: COLORS.textSecondary, marginTop: 4 },
  cardMuted: { fontSize: 11, color: COLORS.textMuted, marginTop: 2 },
  rowSpaced: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  questionBtn: {
    color: COLORS.blue,
    fontSize: 14,
    fontWeight: '700',
    borderWidth: 1,
    borderColor: COLORS.blue,
    borderRadius: 10,
    width: 20,
    height: 20,
    textAlign: 'center',
    lineHeight: 18,
  },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-around' },
  summaryItem: { alignItems: 'center' },
  summaryValue: { fontSize: 20, fontWeight: '700', color: COLORS.textPrimary },
  summaryLabel: { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: COLORS.card,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
    maxHeight: '90%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  modalTitle: { fontSize: 17, fontWeight: '700', color: COLORS.textPrimary, flex: 1, marginRight: 12 },
  modalClose: { fontSize: 22, color: COLORS.textSecondary },
  explainerSection: { marginBottom: 20 },
  explainerHeading: { fontSize: 14, fontWeight: '600', color: COLORS.textPrimary, marginBottom: 6 },
  explainerText: { fontSize: 13, color: '#cbd5e1', lineHeight: 20 },
  bold: { fontWeight: '700', color: COLORS.textPrimary },
  italic: { fontStyle: 'italic' },
  exampleBox: {
    backgroundColor: 'rgba(100,116,139,0.25)',
    borderRadius: 8,
    padding: 12,
    marginTop: 8,
  },
  exampleText: { fontSize: 12, color: COLORS.textSecondary, lineHeight: 18 },
  feedTable: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    overflow: 'hidden',
    marginBottom: 12,
  },
  feedTableRow: {
    flexDirection: 'row',
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  feedTableHeader: { backgroundColor: 'rgba(100,116,139,0.2)' },
  feedTableRowBorder: { borderTopWidth: 1, borderTopColor: 'rgba(51,65,85,0.5)' },
  feedTableCell: { flex: 1, fontSize: 12, color: COLORS.textPrimary },
  totalsBox: {
    backgroundColor: 'rgba(100,116,139,0.15)',
    borderRadius: 8,
    padding: 12,
  },
  totalsRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  totalsLabel: { fontSize: 12, color: COLORS.textSecondary },
  totalsValue: { fontSize: 12, color: COLORS.textPrimary, fontWeight: '600' },
  modalDismissBtn: {
    backgroundColor: COLORS.border,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 20,
    marginBottom: 8,
  },
  modalDismissBtnText: { color: COLORS.textPrimary, fontSize: 15, fontWeight: '600' },
});
