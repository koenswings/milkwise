import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Alert,
  TextInput,
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
  red: '#f87171',
  border: '#334155',
  inputBg: '#0f172a',
};

function formatDateTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) +
    ' ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
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

  const handleEditStart = (id: string, currentVolume: number) => {
    setEditingId(id);
    setEditVolume(String(currentVolume));
  };

  const handleEditSave = async (id: string) => {
    const vol = parseInt(editVolume, 10);
    if (!isNaN(vol) && vol > 0) {
      await updateFeed(id, { volume: vol });
      await load();
    }
    setEditingId(null);
    setEditVolume('');
  };

  const renderItem = ({ item }: { item: FeedWithCredit }) => {
    const isEditing = editingId === item.id;

    return (
      <View style={styles.feedCard}>
        <View style={styles.feedMain}>
          <View style={styles.feedInfo}>
            <Text style={styles.feedTime}>{formatDateTime(item.timestamp)}</Text>
            <Text style={styles.feedMeta}>
              {item.ageHours.toFixed(1)}h old · {item.creditMl.toFixed(0)} ml credit
            </Text>
          </View>
          {isEditing ? (
            <View style={styles.editRow}>
              <TextInput
                style={styles.editInput}
                value={editVolume}
                onChangeText={setEditVolume}
                keyboardType="numeric"
                autoFocus
              />
              <TouchableOpacity style={styles.saveEditBtn} onPress={() => handleEditSave(item.id)}>
                <Text style={styles.saveEditText}>✓</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity onPress={() => handleEditStart(item.id, item.volume)}>
              <Text style={styles.feedVolume}>{item.volume} ml</Text>
            </TouchableOpacity>
          )}
        </View>
        <View style={styles.feedActions}>
          <TouchableOpacity
            style={styles.deleteBtn}
            onPress={() => handleDelete(item.id)}
          >
            <Text style={styles.deleteBtnText}>🗑 Delete</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
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
        />
      )}
    </View>
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
    marginBottom: 8,
  },
  feedInfo: { flex: 1 },
  feedTime: { color: COLORS.textPrimary, fontSize: 15, fontWeight: '500' },
  feedMeta: { color: COLORS.textSecondary, fontSize: 12, marginTop: 2 },
  feedVolume: { color: COLORS.blue, fontSize: 18, fontWeight: '700' },
  feedActions: { flexDirection: 'row', justifyContent: 'flex-end' },
  deleteBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.red,
  },
  deleteBtnText: { color: COLORS.red, fontSize: 13 },
  editRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  editInput: {
    backgroundColor: COLORS.inputBg,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.blue,
    color: COLORS.textPrimary,
    fontSize: 16,
    padding: 6,
    width: 70,
    textAlign: 'center',
  },
  saveEditBtn: {
    backgroundColor: COLORS.blue,
    borderRadius: 8,
    padding: 8,
  },
  saveEditText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});
