import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Alert,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { getFeeds, deleteFeed, updateFeed, getSettings } from '../lib/store';
import { feedsWithCredit, deriveSettings } from '../lib/calculations';
import { FeedWithCredit, Settings } from '../types';

const COLORS = {
  bg: '#0f172a',
  card: '#1e293b',
  textPrimary: '#e2e8f0',
  textSecondary: '#94a3b8',
  blue: '#3b82f6',
  green: '#4ade80',
  red: '#f87171',
  border: '#334155',
  inputBg: '#0f172a',
};

function formatDateTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) +
    ' ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
}

function toDateStr(ts: number): string {
  return new Date(ts).toISOString().slice(0, 10);
}

function toTimeStr(ts: number): string {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export default function HistoryScreen() {
  const [feeds, setFeeds] = useState<FeedWithCredit[]>([]);
  const [settings, setSettings] = useState<Settings>({
    weightKg: 6.27,
    mlPerKgPerDay: 150,
    standardBottleVolume: 90,
  });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editVolume, setEditVolume] = useState('');
  const [editDate, setEditDate] = useState('');
  const [editTime, setEditTime] = useState('');

  const load = useCallback(async () => {
    const [rawFeeds, s] = await Promise.all([getFeeds(), getSettings()]);
    setSettings(s);
    const derived = deriveSettings(s);
    setFeeds(feedsWithCredit(rawFeeds, derived.hourlyRate));
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const handleDelete = (id: string) => {
    Alert.alert(
      'Delete Feed',
      'Are you sure you want to delete this feed?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await deleteFeed(id);
            load();
          },
        },
      ]
    );
  };

  const handleEditStart = (item: FeedWithCredit) => {
    setEditingId(item.id);
    setEditVolume(String(item.volume));
    setEditDate(toDateStr(item.timestamp));
    setEditTime(toTimeStr(item.timestamp));
  };

  const handleEditSave = async (id: string) => {
    const vol = parseInt(editVolume, 10);
    if (isNaN(vol) || vol <= 0) {
      Alert.alert('Invalid volume', 'Please enter a valid volume.');
      return;
    }
    const ts = new Date(`${editDate}T${editTime}:00`).getTime();
    if (isNaN(ts)) {
      Alert.alert('Invalid date/time', 'Use YYYY-MM-DD and HH:MM format.');
      return;
    }
    await updateFeed(id, { volume: vol, timestamp: ts });
    await load();
    setEditingId(null);
  };

  const renderItem = ({ item }: { item: FeedWithCredit }) => {
    const isEditing = editingId === item.id;

    return (
      <View style={styles.feedCard}>
        {isEditing ? (
          <View>
            <Text style={styles.editLabel}>Volume (ml)</Text>
            <TextInput
              style={styles.editInput}
              value={editVolume}
              onChangeText={setEditVolume}
              keyboardType="numeric"
              autoFocus
            />
            <Text style={styles.editLabel}>Date (YYYY-MM-DD)</Text>
            <TextInput
              style={styles.editInput}
              value={editDate}
              onChangeText={setEditDate}
              placeholder="2024-01-15"
              placeholderTextColor={COLORS.textSecondary}
            />
            <Text style={styles.editLabel}>Time (HH:MM)</Text>
            <TextInput
              style={styles.editInput}
              value={editTime}
              onChangeText={setEditTime}
              placeholder="14:30"
              placeholderTextColor={COLORS.textSecondary}
            />
            <View style={styles.editActions}>
              <TouchableOpacity style={styles.saveBtn} onPress={() => handleEditSave(item.id)}>
                <Text style={styles.saveBtnText}>✓ Save</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setEditingId(null)}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <View style={styles.feedMain}>
            <View style={styles.feedInfo}>
              <Text style={styles.feedTime}>{formatDateTime(item.timestamp)}</Text>
              <Text style={styles.feedMeta}>
                {item.ageHours.toFixed(1)}h old · {item.creditMl.toFixed(0)} ml credit
              </Text>
            </View>
            <View style={styles.feedRight}>
              <Text style={styles.feedVolume}>{item.volume} ml</Text>
              <View style={styles.feedActions}>
                <TouchableOpacity
                  style={styles.editBtn}
                  onPress={() => handleEditStart(item)}
                >
                  <Text style={styles.editBtnText}>Edit</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.deleteBtn}
                  onPress={() => handleDelete(item.id)}
                >
                  <Text style={styles.deleteBtnText}>🗑</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}
      </View>
    );
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {feeds.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>No feeds yet. Log your first feed!</Text>
        </View>
      ) : (
        <FlatList
          data={feeds}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
          keyboardShouldPersistTaps="handled"
        />
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  list: { padding: 16, paddingBottom: 32 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyText: { color: COLORS.textSecondary, fontSize: 16 },
  feedCard: {
    backgroundColor: COLORS.card,
    borderRadius: 12,
    padding: 14,
  },
  feedMain: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  feedInfo: { flex: 1 },
  feedTime: { color: COLORS.textPrimary, fontSize: 15, fontWeight: '500' },
  feedMeta: { color: COLORS.textSecondary, fontSize: 12, marginTop: 2 },
  feedRight: { alignItems: 'flex-end', gap: 6 },
  feedVolume: { color: COLORS.blue, fontSize: 18, fontWeight: '700' },
  feedActions: { flexDirection: 'row', gap: 8 },
  editBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  editBtnText: { color: COLORS.textSecondary, fontSize: 12 },
  deleteBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: COLORS.red,
  },
  deleteBtnText: { color: COLORS.red, fontSize: 12 },
  // Edit form
  editLabel: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 10,
    marginBottom: 4,
  },
  editInput: {
    backgroundColor: COLORS.inputBg,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.blue,
    color: COLORS.textPrimary,
    fontSize: 15,
    padding: 10,
  },
  editActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
  },
  saveBtn: {
    flex: 1,
    backgroundColor: COLORS.blue,
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
  },
  saveBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  cancelBtn: {
    flex: 1,
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  cancelBtnText: { color: COLORS.textSecondary, fontSize: 14 },
});
