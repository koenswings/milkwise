import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { getSettings, saveSettings, saveFeeds } from '../lib/store';
import { deriveSettings } from '../lib/calculations';
import { Feed, Settings } from '../types';

const COLORS = {
  bg: '#0f172a',
  card: '#1e293b',
  textPrimary: '#e2e8f0',
  textSecondary: '#94a3b8',
  blue: '#3b82f6',
  red: '#f87171',
  border: '#334155',
  inputBg: '#0f172a',
};

function generateId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function parseCSV(text: string): Feed[] {
  const lines = text.trim().split('\n');
  const feeds: Feed[] = [];
  for (const line of lines) {
    const parts = line.split(',').map(s => s.trim());
    // Expected: timestamp (ms or ISO), volume
    if (parts.length >= 2) {
      const tsRaw = parts[0];
      const vol = parseFloat(parts[1]);
      if (isNaN(vol)) continue;
      let ts: number;
      const numTs = parseInt(tsRaw, 10);
      if (!isNaN(numTs) && numTs > 1000000000000) {
        ts = numTs;
      } else {
        ts = new Date(tsRaw).getTime();
      }
      if (isNaN(ts)) continue;
      feeds.push({ id: generateId(), timestamp: ts, volume: vol });
    }
  }
  return feeds;
}

export default function SettingsScreen() {
  const [settings, setSettings] = useState<Settings>({
    weightKg: 6.27,
    mlPerKgPerDay: 150,
    preferredBottleWaterMl: 90,
    yellowThresholdPct: 5,
    redThresholdPct: 10,
    timeFormat: '24h',
  });
  const [weightStr, setWeightStr] = useState('6.27');
  const [mlPerKgStr, setMlPerKgStr] = useState('150');
  const [bottleVolStr, setBottleVolStr] = useState('90');
  const [yellowThreshStr, setYellowThreshStr] = useState('5');
  const [redThreshStr, setRedThreshStr] = useState('10');
  const [timeFormat, setTimeFormatState] = useState<'24h' | '12h'>('24h');
  const [csvText, setCsvText] = useState('');

  const load = useCallback(async () => {
    const s = await getSettings();
    setSettings(s);
    setWeightStr(String(s.weightKg));
    setMlPerKgStr(String(s.mlPerKgPerDay));
    setBottleVolStr(String(s.preferredBottleWaterMl));
    setYellowThreshStr(String(s.yellowThresholdPct));
    setRedThreshStr(String(s.redThresholdPct));
    setTimeFormatState(s.timeFormat ?? '24h');
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const handleSave = async () => {
    const weightKg = parseFloat(weightStr);
    const mlPerKgPerDay = parseFloat(mlPerKgStr);
    const preferredBottleWaterMl = parseFloat(bottleVolStr);
    const yellowThresholdPct = parseFloat(yellowThreshStr);
    const redThresholdPct = parseFloat(redThreshStr);

    if (isNaN(weightKg) || isNaN(mlPerKgPerDay) || isNaN(preferredBottleWaterMl) || isNaN(yellowThresholdPct) || isNaN(redThresholdPct)) {
      Alert.alert('Invalid values', 'Please enter valid numbers for all fields.');
      return;
    }

    const newSettings: Settings = { weightKg, mlPerKgPerDay, preferredBottleWaterMl, yellowThresholdPct, redThresholdPct, timeFormat };
    await saveSettings(newSettings);
    setSettings(newSettings);
    Alert.alert('Saved', 'Settings saved successfully.');
  };

  const handleClearFeeds = () => {
    Alert.alert(
      'Clear All Feeds',
      'This will permanently delete all feed records. Are you sure?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear All',
          style: 'destructive',
          onPress: async () => {
            await saveFeeds([]);
            Alert.alert('Done', 'All feeds cleared.');
          },
        },
      ]
    );
  };

  const handleImportCSV = async () => {
    if (!csvText.trim()) {
      Alert.alert('No data', 'Paste CSV data first.');
      return;
    }
    try {
      const feeds = parseCSV(csvText);
      if (feeds.length === 0) {
        Alert.alert('No valid rows', 'Could not parse any feeds. Format: timestamp_ms,volume_ml');
        return;
      }
      await saveFeeds(feeds);
      setCsvText('');
      Alert.alert('Imported', `${feeds.length} feeds imported.`);
    } catch {
      Alert.alert('Error', 'Failed to parse CSV.');
    }
  };

  const derived = deriveSettings(settings);

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: COLORS.bg }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        {/* Settings inputs */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Baby Settings</Text>

          <Text style={styles.label}>Weight (kg)</Text>
          <TextInput
            style={styles.input}
            value={weightStr}
            onChangeText={setWeightStr}
            keyboardType="decimal-pad"
            placeholderTextColor={COLORS.textSecondary}
          />

          <Text style={styles.label}>ml / kg / day</Text>
          <TextInput
            style={styles.input}
            value={mlPerKgStr}
            onChangeText={setMlPerKgStr}
            keyboardType="numeric"
            placeholderTextColor={COLORS.textSecondary}
          />

          <Text style={styles.label}>Standard Bottle Volume (ml)</Text>
          <TextInput
            style={styles.input}
            value={bottleVolStr}
            onChangeText={setBottleVolStr}
            keyboardType="numeric"
            placeholderTextColor={COLORS.textSecondary}
          />

          <Text style={styles.label}>On-track zone (±%)</Text>
          <TextInput
            style={styles.input}
            value={yellowThreshStr}
            onChangeText={setYellowThreshStr}
            keyboardType="numeric"
            placeholderTextColor={COLORS.textSecondary}
          />

          <Text style={styles.label}>Seriously off threshold (±%)</Text>
          <TextInput
            style={styles.input}
            value={redThreshStr}
            onChangeText={setRedThreshStr}
            keyboardType="numeric"
            placeholderTextColor={COLORS.textSecondary}
          />
          <Text style={styles.hint}>
            Within ±{yellowThreshStr}% of target = on track. Beyond ±{redThreshStr}% = seriously off.
          </Text>

          <Text style={[styles.label, { marginTop: 16 }]}>Time format</Text>
          <View style={styles.toggleRow}>
            {(['24h', '12h'] as const).map((fmt) => (
              <TouchableOpacity
                key={fmt}
                style={[styles.quickBtn, timeFormat === fmt && styles.quickBtnActive]}
                onPress={() => setTimeFormatState(fmt)}
              >
                <Text style={[styles.quickBtnText, timeFormat === fmt && styles.quickBtnTextActive]}>
                  {fmt}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <TouchableOpacity style={styles.saveButton} onPress={handleSave}>
            <Text style={styles.saveButtonText}>💾 Save Settings</Text>
          </TouchableOpacity>
        </View>

        {/* Derived values */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Derived Values</Text>
          <View style={styles.derivedRow}>
            <Text style={styles.derivedLabel}>Daily Target</Text>
            <Text style={styles.derivedValue}>{derived.dailyTargetMl.toFixed(0)} ml</Text>
          </View>
          <View style={styles.derivedRow}>
            <Text style={styles.derivedLabel}>Hourly Rate</Text>
            <Text style={styles.derivedValue}>{derived.hourlyRate.toFixed(1)} ml/h</Text>
          </View>
          <View style={styles.derivedRow}>
            <Text style={styles.derivedLabel}>Ideal Interval</Text>
            <Text style={styles.derivedValue}>{derived.idealIntervalHours.toFixed(1)} h</Text>
          </View>
        </View>

        {/* CSV Import */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Import CSV</Text>
          <Text style={styles.hint}>Format: timestamp_ms,volume_ml (one per line)</Text>
          <TextInput
            style={styles.csvInput}
            value={csvText}
            onChangeText={setCsvText}
            multiline
            numberOfLines={5}
            placeholder="1700000000000,90&#10;1700003600000,120"
            placeholderTextColor={COLORS.textSecondary}
          />
          <TouchableOpacity style={styles.importButton} onPress={handleImportCSV}>
            <Text style={styles.importButtonText}>📥 Import</Text>
          </TouchableOpacity>
        </View>

        {/* Danger zone */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Danger Zone</Text>
          <TouchableOpacity style={styles.clearButton} onPress={handleClearFeeds}>
            <Text style={styles.clearButtonText}>🗑 Clear All Feeds</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  content: { padding: 16, paddingBottom: 40 },
  card: {
    backgroundColor: COLORS.card,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  sectionTitle: { color: COLORS.textPrimary, fontWeight: '600', fontSize: 15, marginBottom: 12 },
  label: { fontSize: 13, color: COLORS.textSecondary, marginBottom: 6, marginTop: 10 },
  input: {
    backgroundColor: COLORS.inputBg,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    color: COLORS.textPrimary,
    fontSize: 16,
    padding: 12,
  },
  saveButton: {
    backgroundColor: COLORS.blue,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 16,
  },
  saveButtonText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  derivedRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  derivedLabel: { color: COLORS.textSecondary, fontSize: 14 },
  derivedValue: { color: COLORS.textPrimary, fontSize: 14, fontWeight: '600' },
  hint: { color: COLORS.textSecondary, fontSize: 12, marginBottom: 8 },
  csvInput: {
    backgroundColor: COLORS.inputBg,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    color: COLORS.textPrimary,
    fontSize: 13,
    padding: 12,
    height: 120,
    textAlignVertical: 'top',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  importButton: {
    backgroundColor: COLORS.blue,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
    marginTop: 10,
  },
  importButtonText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  clearButton: {
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.red,
  },
  clearButtonText: { color: COLORS.red, fontSize: 15, fontWeight: '600' },
  toggleRow: { flexDirection: 'row', gap: 10, marginTop: 6 },
  quickBtn: {
    flex: 1,
    backgroundColor: COLORS.inputBg,
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  quickBtnActive: {
    backgroundColor: COLORS.blue,
    borderColor: COLORS.blue,
  },
  quickBtnText: { fontSize: 15, color: COLORS.textSecondary, fontWeight: '600' },
  quickBtnTextActive: { color: '#fff' },
});
