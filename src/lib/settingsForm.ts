// Settings screen save payload. The server writes the whole settings object, so every key the
// form does not edit (feedingTimelineView, feedingTimelineViewMigrated, dateOfBirthMs, sex, …)
// must be carried over from the loaded settings — otherwise a phone save would drop them.
import { Settings } from '../types';
import { NumericSettingKey, parseSettingValue, thresholdsError } from './settingsLimits';

export type SettingsFormValues = Pick<
  Settings,
  'weightKg' | 'mlPerKgPerDay' | 'preferredBottleWaterMl' | 'yellowThresholdPct' | 'redThresholdPct' | 'timeFormat'
> & Partial<Pick<Settings, 'feedingTimelineView'>>;

export function settingsToSave(loaded: Settings, form: SettingsFormValues): Settings {
  const out: Settings = { ...loaded, ...form };
  if (form.feedingTimelineView === undefined && loaded.feedingTimelineView !== undefined) {
    out.feedingTimelineView = loaded.feedingTimelineView;
  }
  return out;
}

export type SettingsFormStrings = Record<NumericSettingKey, string>;

/**
 * Validate the typed number fields on Save (design/2026-11-26-live-rules-and-weight-anchor.md §10).
 * The phone saves only on the Save button — never mid-keystroke — and refuses out-of-range values
 * (e.g. ml/kg = 1), so no junk value reaches settings-history.jsonl. Returns the parsed numbers or
 * every error found.
 */
export function validateSettingsForm(
  strs: SettingsFormStrings,
): { ok: true; values: Record<NumericSettingKey, number> } | { ok: false; errors: string[] } {
  const keys: NumericSettingKey[] = ['weightKg', 'mlPerKgPerDay', 'preferredBottleWaterMl', 'yellowThresholdPct', 'redThresholdPct'];
  const values = {} as Record<NumericSettingKey, number>;
  const errors: string[] = [];
  for (const k of keys) {
    const r = parseSettingValue(k, strs[k]);
    if (r.ok) values[k] = r.value; else errors.push(r.error);
  }
  if (errors.length === 0) {
    const t = thresholdsError(values.yellowThresholdPct, values.redThresholdPct);
    if (t) errors.push(t);
  }
  return errors.length === 0 ? { ok: true, values } : { ok: false, errors };
}
