// Settings screen save payload. The server writes the whole settings object, so every key the
// form does not edit (feedingTimelineView, feedingTimelineViewMigrated, dateOfBirthMs, sex, …)
// must be carried over from the loaded settings — otherwise a phone save would drop them.
import { Settings } from '../types';

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
