// SettingsScreen save payload (SettingsScreen.tsx: spread `...settings` first) — a phone save must
// not drop keys the form does not edit, in particular the display view and its migration marker.
import { settingsToSave } from '../settingsForm';
import { Settings } from '../../types';

const loaded: Settings = {
  weightKg: 6.5, mlPerKgPerDay: 150, preferredBottleWaterMl: 120, yellowThresholdPct: 5, redThresholdPct: 10,
  timeFormat: '24h', feedingTimelineView: 'cards', feedingTimelineViewMigrated: true, dateOfBirthMs: 1_750_000_000_000, sex: 'F',
};
const form = { weightKg: 6.6, mlPerKgPerDay: 150, preferredBottleWaterMl: 90, yellowThresholdPct: 5, redThresholdPct: 10, timeFormat: '12h' as const };

test('keeps view, marker, DOB and sex; applies edited fields', () => {
  const out = settingsToSave(loaded, form);
  expect(out).toEqual({ ...loaded, ...form });
  expect(out.feedingTimelineView).toBe('cards');
  expect(out.feedingTimelineViewMigrated).toBe(true);
});

test('view chosen in the form wins; marker still kept', () => {
  const out = settingsToSave(loaded, { ...form, feedingTimelineView: 'zones' });
  expect(out.feedingTimelineView).toBe('zones');
  expect(out.feedingTimelineViewMigrated).toBe(true);
});

test('explicit undefined view does not erase the stored one', () => {
  expect(settingsToSave(loaded, { ...form, feedingTimelineView: undefined }).feedingTimelineView).toBe('cards');
});
