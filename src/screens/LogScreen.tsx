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
import { getFeeds, addFeed, generateId } from '../lib/store';
import { Feed } from '../types';

const COLORS = {
  bg: '#0f172a',
  card: '#1e293b',
  textPrimary: '#e2e8f0',
  textSecondary: '#94a3b8',
  blue: '#3b82f6',
  green: '#4ade80',
  border: '#334155',
  inputBg: '#0f172a',
};

const QUICK_VOLUMES = [60, 90, 120];

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function nowTimeStr(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function formatDateTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) +
    ' ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
}

export default function LogScreen({ navigation }: any) {
  const [volume, setVolume] = useState('90');
  const [date, setDate] = useState(todayStr());
  const [time, setTime] = useState(nowTimeStr());
  const [recentFeeds, setRecentFeeds] = useState<Feed[]>([]);

  const load = useCallback(async () => {
    const feeds = await getFeeds();
    const sorted = [...feeds].sort((a, b) => b.timestamp - a.timestamp);
    setRecentFeeds(sorted.slice(0, 3));
    // Reset time to now
    setDate(todayStr());
    setTime(nowTimeStr());
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const handleSave = async () => {
    const vol = parseInt(volume, 10);
    if (isNaN(vol) || vol <= 0) {
      Alert.alert('Invalid volume', 'Please enter a valid volume in ml.');
      return;
    }

    // Parse date + time into timestamp
    const dateTimeStr = `${date}T${time}:00`;
    const ts = new Date(dateTimeStr).getTime();
    if (isNaN(ts)) {
      Alert.alert('Invalid date/time', 'Use YYYY-MM-DD and HH:MM format.');
      return;
    }

    const feed: Feed = {
      id: generateId(),
      timestamp: ts,
      volume: vol,
    };

    await addFeed(feed);
    navigation.navigate('Dashboard');
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: COLORS.bg }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <Text style={styles.sectionTitle}>Quick Volume</Text>
        <View style={styles.quickRow}>
          {QUICK_VOLUMES.map((v) => (
            <TouchableOpacity
              key={v}
              style={[styles.quickBtn, volume === String(v) && styles.quickBtnActive]}
              onPress={() => setVolume(String(v))}
            >
              <Text style={[styles.quickBtnText, volume === String(v) && styles.quickBtnTextActive]}>
                {v} ml
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.card}>
          <Text style={styles.label}>Custom Volume (ml)</Text>
          <TextInput
            style={styles.input}
            value={volume}
            onChangeText={setVolume}
            keyboardType="numeric"
            placeholder="e.g. 75"
            placeholderTextColor={COLORS.textSecondary}
          />

          <Text style={styles.label}>Date (YYYY-MM-DD)</Text>
          <TextInput
            style={styles.input}
            value={date}
            onChangeText={setDate}
            placeholder="2024-01-01"
            placeholderTextColor={COLORS.textSecondary}
          />

          <Text style={styles.label}>Time (HH:MM)</Text>
          <TextInput
            style={styles.input}
            value={time}
            onChangeText={setTime}
            placeholder="14:30"
            placeholderTextColor={COLORS.textSecondary}
          />
        </View>

        <TouchableOpacity style={styles.saveButton} onPress={handleSave}>
          <Text style={styles.saveButtonText}>💾 Save Feed</Text>
        </TouchableOpacity>

        {recentFeeds.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Recent Feeds</Text>
            <View style={styles.card}>
              {recentFeeds.map((f, i) => (
                <View key={f.id} style={[styles.feedRow, i < recentFeeds.length - 1 && styles.feedRowBorder]}>
                  <Text style={styles.feedTime}>{formatDateTime(f.timestamp)}</Text>
                  <Text style={styles.feedVolume}>{f.volume} ml</Text>
                </View>
              ))}
            </View>
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  content: { padding: 16, paddingBottom: 40 },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 10,
    marginTop: 8,
  },
  quickRow: { flexDirection: 'row', gap: 10, marginBottom: 20 },
  quickBtn: {
    flex: 1,
    backgroundColor: COLORS.card,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  quickBtnActive: {
    backgroundColor: COLORS.blue,
    borderColor: COLORS.blue,
  },
  quickBtnText: { fontSize: 16, color: COLORS.textSecondary, fontWeight: '600' },
  quickBtnTextActive: { color: '#fff' },
  card: {
    backgroundColor: COLORS.card,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  label: {
    fontSize: 13,
    color: COLORS.textSecondary,
    marginBottom: 6,
    marginTop: 12,
  },
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
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 24,
  },
  saveButtonText: { color: '#fff', fontSize: 17, fontWeight: '600' },
  feedRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  feedRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  feedTime: { color: COLORS.textPrimary, fontSize: 14 },
  feedVolume: { color: COLORS.blue, fontSize: 14, fontWeight: '600' },
});
