import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Modal,
  Dimensions,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { BarChart } from 'react-native-chart-kit';
import { getFeeds, getSettings, migrateAsyncStorageFeeds } from '../lib/store';
import {
  deriveSettings,
  dailyTotals,
  avgIntervalHours,
  consistencyScore,
  periodTotal,
} from '../lib/calculations';
import { Feed, Settings } from '../types';

const COLORS = {
  bg: '#0f172a',
  card: '#1e293b',
  textPrimary: '#e2e8f0',
  textSecondary: '#94a3b8',
  textMuted: '#64748b',
  blue: '#3b82f6',
  green: '#4ade80',
  yellow: '#facc15',
  red: '#f87171',
  border: '#334155',
};

const screenWidth = Dimensions.get('window').width;

// Aligned with web app thresholds: < 0.5h green, 0.5–1.5h yellow, > 1.5h red
function consistencyColor(score: number | null): string {
  if (score === null) return COLORS.textSecondary;
  if (score < 0.5) return COLORS.green;
  if (score < 1.5) return COLORS.yellow;
  return COLORS.red;
}

interface ConsistencyExplainerProps {
  visible: boolean;
  onClose: () => void;
  avgInterval: number | null;
  consistency: number | null;
  idealIntervalHours: number;
}

function ConsistencyExplainerModal({ visible, onClose, avgInterval, consistency, idealIntervalHours }: ConsistencyExplainerProps) {
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity activeOpacity={1} style={styles.modalSheet}>
          <ScrollView showsVerticalScrollIndicator={false}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>What is Consistency (σ)?</Text>
              <TouchableOpacity onPress={onClose}>
                <Text style={styles.modalClose}>✕</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.explainerSection}>
              <Text style={styles.explainerHeading}>What it measures</Text>
              <Text style={styles.explainerText}>
                Consistency tells you how <Text style={styles.bold}>regular</Text> the gaps between feeds are.
                A low number means feeds happen at roughly the same intervals — predictable and steady.
                A high number means the gaps vary a lot — sometimes very short, sometimes very long.
              </Text>
            </View>

            <View style={styles.explainerSection}>
              <Text style={styles.explainerHeading}>How it's calculated</Text>
              <Text style={styles.explainerText}>
                We look at the time gap between each pair of feeds. Then we measure how much those gaps{' '}
                <Text style={styles.italic}>vary</Text> from the average gap. The more they spread out, the higher the number.
              </Text>
              <View style={styles.exampleBox}>
                <Text style={styles.exampleText}>
                  <Text style={styles.bold}>Example:{'\n'}</Text>
                  Gaps: 2.0h, 2.1h, 1.9h, 2.0h → very consistent → low σ (e.g. 0.07h){'\n'}
                  Gaps: 1.0h, 3.5h, 1.2h, 4.0h → irregular → high σ (e.g. 1.3h)
                </Text>
              </View>
            </View>

            <View style={styles.explainerSection}>
              <Text style={styles.explainerHeading}>What's a good score?</Text>
              <Text style={[styles.explainerText, { marginBottom: 8 }]}>
                There's no strict rule — every baby is different. As a rough guide:
              </Text>
              <View style={styles.scoreRow}>
                <Text style={[styles.scoreRange, { color: COLORS.green }]}>&lt; 0.5h</Text>
                <Text style={styles.scoreDesc}>Very regular feeding rhythm 🟢</Text>
              </View>
              <View style={styles.scoreRow}>
                <Text style={[styles.scoreRange, { color: COLORS.yellow }]}>0.5–1.5h</Text>
                <Text style={styles.scoreDesc}>Normal variation, nothing to worry about 🟡</Text>
              </View>
              <View style={styles.scoreRow}>
                <Text style={[styles.scoreRange, { color: COLORS.red }]}>&gt; 1.5h</Text>
                <Text style={styles.scoreDesc}>Wide variation — some feeds very close, some very far apart 🔴</Text>
              </View>
            </View>

            {avgInterval !== null && consistency !== null && (
              <View style={styles.explainerSection}>
                <Text style={styles.explainerHeading}>Your numbers</Text>
                <View style={styles.totalsBox}>
                  <View style={styles.totalsRow}>
                    <Text style={styles.totalsLabel}>Average gap between feeds</Text>
                    <Text style={styles.totalsValue}>{avgInterval.toFixed(2)}h</Text>
                  </View>
                  <View style={styles.totalsRow}>
                    <Text style={styles.totalsLabel}>Consistency score (σ)</Text>
                    <Text style={[styles.totalsValue, { color: consistencyColor(consistency), fontWeight: '700' }]}>
                      {consistency.toFixed(2)}h
                    </Text>
                  </View>
                  <View style={styles.totalsRow}>
                    <Text style={styles.totalsLabel}>Ideal interval</Text>
                    <Text style={styles.totalsValue}>{idealIntervalHours.toFixed(2)}h</Text>
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

export default function AnalyticsScreen() {
  const [feeds, setFeeds] = useState<Feed[]>([]);
  const [settings, setSettings] = useState<Settings>({
    weightKg: 6.27,
    mlPerKgPerDay: 150,
    standardBottleVolume: 90,
  });
  const [period, setPeriod] = useState<7 | 30>(7);
  const [showConsistencyExplainer, setShowConsistencyExplainer] = useState(false);

  const load = useCallback(async () => {
    const [f, s] = await Promise.all([getFeeds(), getSettings()]);
    setFeeds(f);
    setSettings(s);
    const derivedForMigration = deriveSettings(s);
    await migrateAsyncStorageFeeds(derivedForMigration.dailyTargetMl);
    // Re-fetch feeds after migration in case they were updated
    const migratedFeeds = await getFeeds();
    setFeeds(migratedFeeds);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const derived = deriveSettings(settings);
  const totals = dailyTotals(feeds, period, derived.dailyTargetMl);

  const chartLabels = totals.map((t, i) => {
    if (period === 7) {
      const d = new Date(t.date);
      return ['Su','Mo','Tu','We','Th','Fr','Sa'][d.getDay()];
    }
    return i % 5 === 0 ? t.date.slice(5) : '';
  });

  const chartData = totals.map(t => t.totalMl);
  const todayStr = new Date().toISOString().slice(0, 10);

  const avgInterval = avgIntervalHours(feeds);
  const consistency = consistencyScore(feeds);
  const targetBottlesPerDay = derived.dailyTargetMl / settings.standardBottleVolume;

  const p3 = periodTotal(feeds, 3);
  const p7 = periodTotal(feeds, 7);
  const p14 = periodTotal(feeds, 14);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Period toggle */}
      <View style={styles.toggleRow}>
        <TouchableOpacity
          style={[styles.toggleBtn, period === 7 && styles.toggleBtnActive]}
          onPress={() => setPeriod(7)}
        >
          <Text style={[styles.toggleText, period === 7 && styles.toggleTextActive]}>7 days</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.toggleBtn, period === 30 && styles.toggleBtnActive]}
          onPress={() => setPeriod(30)}
        >
          <Text style={[styles.toggleText, period === 30 && styles.toggleTextActive]}>30 days</Text>
        </TouchableOpacity>
      </View>

      {/* Bar chart */}
      <View style={styles.chartCard}>
        <View style={styles.chartHeader}>
          <Text style={styles.chartTitle}>Daily Totals (ml)</Text>
          <View style={styles.targetBadge}>
            <Text style={styles.targetBadgeText}>
              ― target {derived.dailyTargetMl.toFixed(0)} ml
            </Text>
          </View>
        </View>
        {chartData.some(v => v > 0) ? (
          <BarChart
            data={{
              labels: chartLabels,
              datasets: [
                {
                  data: chartData.length > 0 ? chartData : [0],
                  // Color each bar based on day-specific target.
                  // Today is always grey — the day is not finished yet.
                  colors: totals.map((t, i) => (opacity: number) => {
                    if (t.date === todayStr) return `rgba(100, 116, 139, ${opacity})`; // grey - in progress
                    if (t.totalMl === 0) return `rgba(51, 65, 85, ${opacity})`;        // dark grey - empty
                    const pct = (t.totalMl / t.targetMl) * 100;
                    if (pct > 110) return `rgba(248, 113, 113, ${opacity})`; // red - overfed
                    if (pct >= 80) return `rgba(74, 222, 128, ${opacity})`;  // green - on track
                    if (pct >= 70) return `rgba(250, 204, 21, ${opacity})`;  // yellow - slightly behind
                    return `rgba(248, 113, 113, ${opacity})`;                // red - significantly behind
                  }),
                },
              ],
            }}
            width={screenWidth - 64}
            height={200}
            yAxisLabel=""
            yAxisSuffix=""
            withCustomBarColorFromData
            chartConfig={{
              backgroundGradientFrom: COLORS.card,
              backgroundGradientTo: COLORS.card,
              decimalPlaces: 0,
              color: (opacity = 1) => `rgba(74, 222, 128, ${opacity})`,
              labelColor: () => COLORS.textSecondary,
              propsForBackgroundLines: { stroke: COLORS.border },
            }}
            style={{ borderRadius: 8, marginLeft: -16 }}
            showValuesOnTopOfBars={false}
            fromZero
          />
        ) : (
          <View style={styles.noData}>
            <Text style={styles.noDataText}>No feed data for this period</Text>
          </View>
        )}
        <View style={styles.legendRow}>
          <Text style={styles.chartLegend}>■ <Text style={{color: COLORS.green}}>on track</Text>  ■ <Text style={{color: COLORS.yellow}}>slightly off</Text>  ■ <Text style={{color: COLORS.red}}>overfed / behind</Text>  ■ <Text style={{color: '#64748b'}}>today / no data</Text></Text>
        </View>
      </View>

      {/* Stats grid */}
      <View style={styles.statsGrid}>
        {/* Avg Interval */}
        <View style={[styles.statCard, styles.halfCard]}>
          <Text style={styles.statLabel}>Avg Interval</Text>
          <Text style={styles.statValue}>
            {avgInterval !== null ? `${avgInterval.toFixed(1)}h` : '—'}
          </Text>
          <Text style={styles.statSub}>
            {derived ? `ideal: ${derived.idealIntervalHours.toFixed(1)}h` : ''}
          </Text>
        </View>

        {/* Consistency */}
        <View style={[styles.statCard, styles.halfCard]}>
          <View style={styles.rowSpaced}>
            <Text style={styles.statLabel}>Consistency</Text>
            <TouchableOpacity onPress={() => setShowConsistencyExplainer(true)}>
              <Text style={styles.questionBtn}>?</Text>
            </TouchableOpacity>
          </View>
          <Text style={[styles.statValue, { color: consistencyColor(consistency) }]}>
            {consistency !== null ? `±${consistency.toFixed(2)}h` : '—'}
          </Text>
          <Text style={styles.statSub}>lower = more consistent</Text>
        </View>

        {/* Target bottles */}
        <View style={[styles.statCard, styles.halfCard]}>
          <Text style={styles.statLabel}>Target Bottles/day</Text>
          <Text style={styles.statValue}>{targetBottlesPerDay.toFixed(1)}</Text>
          <Text style={styles.statSub}>{settings.standardBottleVolume} ml each</Text>
        </View>

        {/* Total feeds */}
        <View style={[styles.statCard, styles.halfCard]}>
          <Text style={styles.statLabel}>Total Feeds</Text>
          <Text style={styles.statValue}>{feeds.length}</Text>
          <Text style={styles.statSub}>all time</Text>
        </View>
      </View>

      {/* Period totals */}
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Period Totals</Text>
        {[{ label: 'Last 3 days', ml: p3 }, { label: 'Last 7 days', ml: p7 }, { label: 'Last 14 days', ml: p14 }].map(({ label, ml }) => (
          <View key={label} style={styles.periodRow}>
            <Text style={styles.periodLabel}>{label}</Text>
            <Text style={styles.periodValue}>{Math.round(ml)} ml</Text>
          </View>
        ))}
      </View>

      <ConsistencyExplainerModal
        visible={showConsistencyExplainer}
        onClose={() => setShowConsistencyExplainer(false)}
        avgInterval={avgInterval}
        consistency={consistency}
        idealIntervalHours={derived.idealIntervalHours}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  content: { padding: 16, paddingBottom: 32 },
  toggleRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  toggleBtn: {
    flex: 1,
    backgroundColor: COLORS.card,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  toggleBtnActive: { backgroundColor: COLORS.blue, borderColor: COLORS.blue },
  toggleText: { color: COLORS.textSecondary, fontWeight: '600' },
  toggleTextActive: { color: '#fff' },
  chartCard: {
    backgroundColor: COLORS.card,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    alignItems: 'center',
  },
  chartHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    alignSelf: 'stretch',
    marginBottom: 12,
  },
  chartTitle: { color: COLORS.textPrimary, fontWeight: '600' },
  targetBadge: {
    backgroundColor: 'rgba(74, 222, 128, 0.15)',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: 'rgba(74, 222, 128, 0.4)',
  },
  targetBadgeText: { color: COLORS.green, fontSize: 11, fontWeight: '600' },
  legendRow: {
    alignSelf: 'stretch',
    marginTop: 8,
  },
  chartLegend: {
    color: COLORS.textMuted,
    fontSize: 10,
    lineHeight: 16,
  },
  noData: { height: 200, alignItems: 'center', justifyContent: 'center' },
  noDataText: { color: COLORS.textSecondary },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 16 },
  statCard: {
    backgroundColor: COLORS.card,
    borderRadius: 12,
    padding: 14,
  },
  halfCard: { flex: 1, minWidth: '45%' },
  statLabel: { fontSize: 11, color: COLORS.textSecondary, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 },
  statValue: { fontSize: 22, fontWeight: '700', color: COLORS.textPrimary },
  statSub: { fontSize: 11, color: COLORS.textMuted, marginTop: 3 },
  rowSpaced: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  questionBtn: {
    color: COLORS.blue,
    fontSize: 12,
    fontWeight: '700',
    borderWidth: 1,
    borderColor: COLORS.blue,
    borderRadius: 9,
    width: 18,
    height: 18,
    textAlign: 'center',
    lineHeight: 16,
  },
  card: {
    backgroundColor: COLORS.card,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  sectionTitle: { color: COLORS.textPrimary, fontWeight: '600', marginBottom: 12 },
  periodRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  periodLabel: { color: COLORS.textSecondary, fontSize: 14 },
  periodValue: { color: COLORS.textPrimary, fontSize: 14, fontWeight: '600' },
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
    maxHeight: '85%',
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
  scoreRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 6 },
  scoreRange: { fontSize: 12, fontWeight: '700', width: 56, marginRight: 8 },
  scoreDesc: { fontSize: 12, color: COLORS.textSecondary, flex: 1 },
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
