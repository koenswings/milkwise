// t27 — settings number inputs (design/2026-11-26-live-rules-and-weight-anchor.md §10): the phone
// saves only on the Save button (never mid-keystroke) and refuses out-of-range values (e.g. ml/kg = 1).
import fs from "fs";
import path from "path";
import { SETTING_LIMITS, parseSettingValue, thresholdsError } from "../settingsLimits";
import { validateSettingsForm } from "../settingsForm";

describe("parseSettingValue", () => {
  test("ml/kg = 1 is refused; 80 and 150 accepted; limits inclusive (50–200)", () => {
    expect(parseSettingValue("mlPerKgPerDay", "1").ok).toBe(false);
    expect(parseSettingValue("mlPerKgPerDay", "49").ok).toBe(false);
    expect(parseSettingValue("mlPerKgPerDay", "201").ok).toBe(false);
    expect(parseSettingValue("mlPerKgPerDay", "80")).toEqual({ ok: true, value: 80 });
    expect(parseSettingValue("mlPerKgPerDay", "150")).toEqual({ ok: true, value: 150 });
    expect(parseSettingValue("mlPerKgPerDay", "50")).toEqual({ ok: true, value: 50 });
    expect(parseSettingValue("mlPerKgPerDay", "200")).toEqual({ ok: true, value: 200 });
  });
  test("intermediate keystrokes of 150 → 80 are all refused or harmless", () => {
    // Typing over 150: "" → "8" → "80". Neither "" nor "8" may be committed.
    expect(parseSettingValue("mlPerKgPerDay", "").ok).toBe(false);
    expect(parseSettingValue("mlPerKgPerDay", "8").ok).toBe(false);
  });
  test("empty / non-numeric refused; decimal comma accepted", () => {
    expect(parseSettingValue("weightKg", "").ok).toBe(false);
    expect(parseSettingValue("weightKg", "abc").ok).toBe(false);
    expect(parseSettingValue("weightKg", "9,5")).toEqual({ ok: true, value: 9.5 });
    expect(parseSettingValue("weightKg", "0.4").ok).toBe(false);
    expect(parseSettingValue("weightKg", "31").ok).toBe(false);
  });
  test("thresholds 1–50 and red > yellow", () => {
    expect(parseSettingValue("yellowThresholdPct", "0").ok).toBe(false);
    expect(parseSettingValue("redThresholdPct", "51").ok).toBe(false);
    expect(parseSettingValue("yellowThresholdPct", "5")).toEqual({ ok: true, value: 5 });
    expect(thresholdsError(5, 10)).toBeNull();
    expect(thresholdsError(10, 10)).not.toBeNull();
    expect(thresholdsError(12, 10)).not.toBeNull();
  });
  test("bottle size 30–210 ml water", () => {
    expect(parseSettingValue("preferredBottleWaterMl", "20").ok).toBe(false);
    expect(parseSettingValue("preferredBottleWaterMl", "120")).toEqual({ ok: true, value: 120 });
    expect(SETTING_LIMITS.preferredBottleWaterMl).toMatchObject({ min: 30, max: 210 });
  });
});

describe("mobile settings form", () => {
  const ok = { weightKg: "10", mlPerKgPerDay: "80", preferredBottleWaterMl: "150", yellowThresholdPct: "5", redThresholdPct: "10" };
  test("valid form → numbers", () => {
    expect(validateSettingsForm(ok)).toEqual({ ok: true, values: { weightKg: 10, mlPerKgPerDay: 80, preferredBottleWaterMl: 150, yellowThresholdPct: 5, redThresholdPct: 10 } });
  });
  test("ml/kg = 1 refused; nothing saved", () => {
    const r = validateSettingsForm({ ...ok, mlPerKgPerDay: "1" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join(" ")).toMatch(/ml per kg per day must be between 50 and 200/);
  });
  test("red ≤ yellow refused", () => {
    expect(validateSettingsForm({ ...ok, yellowThresholdPct: "10", redThresholdPct: "10" }).ok).toBe(false);
  });
  test("SettingsScreen validates on Save and never saves from onChangeText", () => {
    const src = fs.readFileSync(path.join(__dirname, "../../screens/SettingsScreen.tsx"), "utf8");
    expect(src).toMatch(/validateSettingsForm\(/);
    const onChanges = src.match(/onChangeText=\{[^}]*\}/g) ?? [];
    expect(onChanges.length).toBeGreaterThan(0);
    for (const c of onChanges) expect(c).not.toMatch(/save/i);
    expect((src.match(/saveSettings\(/g) ?? []).length).toBe(1);   // only in handleSave
    expect(src).not.toMatch(/useEffect\([^]*?saveSettings/);
  });
});
