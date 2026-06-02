import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { getFeeds, getSettings } from '../lib/store';
import {
  deriveSettings,
  strict24hTotal,
  smoothedEffective,
  nextFeedTime,
} from '../lib/calculations';
import { Feed, Settings } from '../types';

const COLORS = {
  bg: '#0f172a',
  card: '#1e293b',
  textPrimary: '#e2e8f0',
  textSecondary: '#94a3b8',
  blue: '#3b82f6',
  green: '#4ade80',
  yellow: '#facc15',
  red: '#f87171',
  border: '#334155',
};

function statusHexColor(pct: number): string {
  if (pct >= 100) return COLORS.green;
  if (pct >= 90) return COLORS.yellow;
  return COLORS.red;
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

function formatDateTime(ts: number): string {
  const d = new Date(ts);
  const date = d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
  return `${date} ${formatTime(ts)}`;
}

function timeDiff(ts: number): string {
  const diffMs = Date.now() - ts;
  const h = Math.floor(diffMs / 3600000);
  const m = Math.floor((diffMs % 3600000) / 60000);
  if (h > 0) return `${h}h ${m}m ago`;
  return `${m}m ago`;
}

export default function DashboardScreen({ navigation }: any) {
  const [feeds, setFeeds] = useState<Feed[]>([]);
  const [settings, setSettings] = useState<Settings>({
    weightKg: 6.27,
    mlPerKgPerDay: 150,
    standardBottleVolume: 90,
  });

  const load = useCallback(async () => {
    const [f, s] = await Promise.all([getFeeds(), getSettings()]);
    setFeeds(f);
    setSettings(s);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const derived = deriveSettings(settings);
  const now = Date.now();

  const strict24 = strict24hTotal(feeds, now);
  const strictPct = (strict24 / derived.dailyTargetMl) * 100;

  const smoothed = smoothedEffective(feeds, derived.hourlyRate, settings.standardBottleVolume, now);
  const smoothedPct = (smoothed.totalMl / derived.dailyTargetMl) * 100;

  const nextTs = nextFeedTime(feeds, derived.idealIntervalHours);
  const lastFeed = feeds.length > 0
    ? feeds.reduce((a, b) => (a.timestamp > b.timestamp ? a : b))
    : null;

  const feeds24h = feeds.filter(f => f.timestamp >= now - 86400000);
  const mlPerHour = feeds24h.length > 0
    ? (feeds24h.reduce((s, f) => s + f.volume, 0) / 24).toFixed(1)
    : '0.0';

  const smoothedExplanation =
    'The Smoothed tracker uses a sliding window that goes beyond 24 hours. ' +
    'Each feed counts its full volume while it\'s under 24 hours old. ' +
    'After 24 hours, the credit decays at the hourly rate until it reaches zero. ' +
    'This means a feed given 30 hours ago still counts partially — rewarding consistent feeding even if the strict 24h window missed some. ' +
    `Your hourly rate is ${derived.hourlyRate.toFixed(1)} ml/h.`;

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
          <Text style={[styles.cardValue, { color: statusHexColor(strictPct) }]}>
            {strict24.toFixed(0)} ml
          </Text>
          <Text style={[styles.cardPct, { color: statusHexColor(strictPct) }]}>
            {strictPct.toFixed(0)}%
          </Text>
          <Text style={styles.cardSub}>of {derived.dailyTargetMl.toFixed(0)} ml</Text>
        </View>

        {/* Smoothed */}
        <View style={[styles.card, styles.halfCard]}>
          <View style={styles.rowSpaced}>
            <Text style={styles.cardLabel}>Smoothed</Text>
            <TouchableOpacity onPress={() => Alert.alert('Smoothed Formula', smoothedExplanation)}>
              <Text style={styles.questionBtn}>?</Text>
            </TouchableOpacity>
          </View>
          <Text style={[styles.cardValue, { color: statusHexColor(smoothedPct) }]}>
            {smoothed.totalMl.toFixed(0)} ml
          </Text>
          <Text style={[styles.cardPct, { color: statusHexColor(smoothedPct) }]}>
            {smoothedPct.toFixed(0)}%
          </Text>
          <Text style={styles.cardSub}>{smoothed.bottles.toFixed(1)} bottles</Text>
        </View>
      </View>

      {/* Next / Last feed */}
      <View style={styles.row}>
        <View style={[styles.card, styles.halfCard]}>
          <Text style={styles.cardLabel}>⏭ Next Feed</Text>
          {nextTs ? (
            <>
              <Text style={styles.cardValue}>{formatTime(nextTs)}</Text>
              <Text style={styles.cardSub}>
                {nextTs < now ? 'Overdue' : `in ${Math.round((nextTs - now) / 60000)}m`}
              </Text>
            </>
          ) : (
            <Text style={styles.cardSub}>No feeds yet</Text>
          )}
        </View>

        <View style={[styles.card, styles.halfCard]}>
          <Text style={styles.cardLabel}>🕐 Last Feed</Text>
          {lastFeed ? (
            <>
              <Text style={styles.cardValue}>{formatDateTime(lastFeed.timestamp)}</Text>
              <Text style={styles.cardSub}>{timeDiff(lastFeed.timestamp)} · {lastFeed.volume} ml</Text>
            </>
          ) : (
            <Text style={styles.cardSub}>No feeds yet</Text>
          )}
        </View>
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
  cardValue: { fontSize: 22, fontWeight: '700', color: COLORS.textPrimary },
  cardPct: { fontSize: 16, fontWeight: '600', marginTop: 2 },
  cardSub: { fontSize: 12, color: COLORS.textSecondary, marginTop: 4 },
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
});
