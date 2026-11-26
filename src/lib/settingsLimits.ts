// Settings number-input limits and parsing (design/2026-11-26-live-rules-and-weight-anchor.md §10).
// Pure, no imports: byte-identical in koenswings/baby-milk-tracker and koenswings/milkwise.
// Number fields commit on blur / Enter (web) or Save (mobile) — never mid-keystroke — and an
// out-of-range value is refused, so no junk value (e.g. ml/kg = 1) reaches settings-history.jsonl.

export type NumericSettingKey =
  | 'weightKg'
  | 'mlPerKgPerDay'
  | 'preferredBottleWaterMl'
  | 'yellowThresholdPct'
  | 'redThresholdPct';

export interface SettingLimit { min: number; max: number; label: string; unit: string }

/** Inclusive limits. A value outside is never valid for a baby bottle-feeding rule. */
export const SETTING_LIMITS: Record<NumericSettingKey, SettingLimit> = {
  weightKg:               { min: 0.5, max: 30,  label: 'Baby weight',              unit: 'kg' },
  mlPerKgPerDay:          { min: 50,  max: 200, label: 'ml per kg per day',        unit: 'ml/kg/day' },
  preferredBottleWaterMl: { min: 30,  max: 210, label: 'Preferred bottle size',    unit: 'ml water' },
  yellowThresholdPct:     { min: 1,   max: 50,  label: 'On-track zone',            unit: '%' },
  redThresholdPct:        { min: 1,   max: 50,  label: 'Seriously off threshold',  unit: '%' },
};

export type ParsedSetting = { ok: true; value: number } | { ok: false; error: string };

/** Parse one typed value; refuse empty, non-numeric and out-of-range input. */
export function parseSettingValue(key: NumericSettingKey, raw: string): ParsedSetting {
  const lim = SETTING_LIMITS[key];
  const text = raw.trim().replace(',', '.');
  const value = text === '' ? NaN : Number(text);
  if (!Number.isFinite(value)) return { ok: false, error: `${lim.label}: enter a number` };
  if (value < lim.min || value > lim.max) {
    return { ok: false, error: `${lim.label} must be between ${lim.min} and ${lim.max} ${lim.unit}` };
  }
  return { ok: true, value };
}

/** Cross-field rule: the "seriously off" threshold must be above the on-track zone. */
export function thresholdsError(yellowThresholdPct: number, redThresholdPct: number): string | null {
  return redThresholdPct > yellowThresholdPct
    ? null
    : 'Seriously off threshold must be larger than the on-track zone';
}
