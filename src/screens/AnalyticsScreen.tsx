import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Dimensions,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { BarChart } from 'react-native-chart-kit';
import { getFeeds, getSettings } from '../lib/store';
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
  blue: '#3b82f6',
  green: '#4ade80',
  yellow: '#facc15',
  red: '#f87171',
  border: '#334155',
};

const screenWidth = Dimensions.get('window').width;

function consistencyColor(score: number | null): string {
  if (score === null) return COLORS.textSecondary;
  if (score < 1) return COLORS.green;
  if (score < 2) return COLORS.yellow;
  return COLORS.red;
}

export default function AnalyticsScreen() {
  const [feeds, setFeeds] = useState<Feed[]>([]);
  const [settings, setSettings] = useState<Settings>({
    weightKg: 6.27,
    mlPerKgPerDay: 150,
    standardBottleVolume: 90,
  });
  const [period, setPeriod] = useState<7 | 30>(7);

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
  const totals = dailyTotals(feeds, period);

  const chartLabels = totals.map((t, i) => {
    if (period === 7) {
      const d = new Date(t.date);
      return ['Su','Mo','Tu','We','Th','Fr','Sa'][d.getDay()];
    }
    // for 30 days, show every 5th date
    return i % 5 === 0 ? t.date.slice(5) : '';
  });

  const chartData = totals.map(t => t.totalMl);

  const avgInterval = avgIntervalHours(feeds);
  const consistency = consistencyScore(feeds);
  const targetBottlesPerDay = derived.dailyTargetMl / settings.standardBottleVolume;

  const consistencyExplanation =
    'Consistency score is the standard deviation of your feed intervals in hours. ' +
    'A lower score means more regular timing. ' +
    'Green < 1h, Yellow 1–2h, Red > 2h deviation.';

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
        <Text style={styles.chartTitle}>Daily Totals (ml)</Text>
        {chartData.some(v => v > 0) ? (
          <BarChart
            data={{
              labels: chartLabels,
              datasets: [{ data: chartData.length > 0 ? chartData : [0] }],
            }}
            width={screenWidth - 64}
            height={200}
            yAxisLabel=""
            yAxisSuffix=""
            chartConfig={{
              backgroundGradientFrom: COLORS.card,
              backgroundGradientTo: COLORS.card,
              decimalPlaces: 0,
              color: (opacity = 1) => `rgba(59, 130, 246, ${opacity})`,
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
      </View>

      {/* Stats grid */}
      <View style={styles.statsGrid}>
        <View style={[styles.statCard, styles.halfCard]}>
          <Text style={styles.statLabel}>Avg Interval</Text>
          <Text style={styles.statValue}>
            {avgInterval !== null ? `${avgInterval.toFixed(1)}h` : '—'}
          </Text>
        </View>
        <View style={[styles.statCard, styles.halfCard]}>
          <View style={styles.rowSpaced}>
            <Text style={styles.statLabel}>Consistency</Text>
            <TouchableOpacity onPress={() => Alert.alert('Consistency Score', consistencyExplanation)}>
              <Text style={styles.questionBtn}>?</Text>
            </TouchableOpacity>
          </View>
          <Text style={[styles.statValue, { color: consistencyColor(consistency) }]}>
            {consistency !== null ? `±${consistency.toFixed(1)}h` : '—'}
          </Text>
        </View>
        <View style={[styles.statCard, styles.halfCard]}>
          <Text style={styles.statLabel}>Target Bottles/day</Text>
          <Text style={styles.statValue}>{targetBottlesPerDay.toFixed(1)}</Text>
        </View>
        <View style={[styles.statCard, styles.halfCard]}>
          <Text style={styles.statLabel}>Total Feeds</Text>
          <Text style={styles.statValue}>{feeds.length}</Text>
        </View>
      </View>

      {/* Period totals */}
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Period Totals</Text>
        <View style={styles.periodRow}>
          <View style={styles.periodItem}>
            <Text style={styles.periodValue}>{(p3 / 1000).toFixed(2)} L</Text>
            <Text style={styles.periodLabel}>3 days</Text>
          </View>
          <View style={styles.periodItem}>
            <Text style={styles.periodValue}>{(p7 / 1000).toFixed(2)} L</Text>
            <Text style={styles.periodLabel}>7 days</Text>
          </View>
          <View style={styles.periodItem}>
            <Text style={styles.periodValue}>{(p14 / 1000).toFixed(2)} L</Text>
            <Text style={styles.periodLabel}>14 days</Text>
          </View>
        </View>
      </View>
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
  chartTitle: { color: COLORS.textPrimary, fontWeight: '600', marginBottom: 12, alignSelf: 'flex-start' },
  noData: { height: 200, alignItems: 'center', justifyContent: 'center' },
  noDataText: { color: COLORS.textSecondary },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 16 },
  statCard: {
    backgroundColor: COLORS.card,
    borderRadius: 12,
    padding: 14,
  },
  halfCard: { flex: 1, minWidth: '45%' },
  statLabel: { fontSize: 12, color: COLORS.textSecondary, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 },
  statValue: { fontSize: 22, fontWeight: '700', color: COLORS.textPrimary },
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
  periodRow: { flexDirection: 'row', justifyContent: 'space-around' },
  periodItem: { alignItems: 'center' },
  periodValue: { fontSize: 18, fontWeight: '700', color: COLORS.textPrimary },
  periodLabel: { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },
});
