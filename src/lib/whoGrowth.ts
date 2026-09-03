/**
 * WHO Child Growth Standards — Weight-for-Age LMS method
 * Source: WHO (2006), weight-for-age, 0–24 months
 *
 * Z = [(X/M)^L − 1] / (L × S)
 * X(t) = M(t) × (1 + L(t) × S(t) × Z)^(1/L(t))
 */

interface LMSRow { ageMonths: number; L: number; M: number; S: number; }

const WHO_GIRLS: LMSRow[] = [
  { ageMonths:  0, L: 0.3487, M:  3.2322, S: 0.14171 },
  { ageMonths:  1, L: 0.2297, M:  4.1873, S: 0.13724 },
  { ageMonths:  2, L: 0.1970, M:  5.1282, S: 0.13001 },
  { ageMonths:  3, L: 0.1738, M:  5.8458, S: 0.12576 },
  { ageMonths:  4, L: 0.1553, M:  6.4237, S: 0.12149 },
  { ageMonths:  5, L: 0.1420, M:  6.8985, S: 0.11898 },
  { ageMonths:  6, L: 0.1339, M:  7.2970, S: 0.11633 },
  { ageMonths:  7, L: 0.1264, M:  7.6422, S: 0.11448 },
  { ageMonths:  8, L: 0.1200, M:  7.9487, S: 0.11273 },
  { ageMonths:  9, L: 0.1148, M:  8.2254, S: 0.11127 },
  { ageMonths: 10, L: 0.1101, M:  8.4800, S: 0.10988 },
  { ageMonths: 11, L: 0.1060, M:  8.7192, S: 0.10870 },
  { ageMonths: 12, L: 0.1022, M:  8.9481, S: 0.10760 },
  { ageMonths: 13, L: 0.0986, M:  9.1699, S: 0.10656 },
  { ageMonths: 14, L: 0.0951, M:  9.3881, S: 0.10552 },
  { ageMonths: 15, L: 0.0920, M:  9.6050, S: 0.10452 },
  { ageMonths: 16, L: 0.0890, M:  9.8224, S: 0.10360 },
  { ageMonths: 17, L: 0.0863, M: 10.0423, S: 0.10274 },
  { ageMonths: 18, L: 0.0839, M: 10.2649, S: 0.10194 },
  { ageMonths: 19, L: 0.0819, M: 10.4899, S: 0.10121 },
  { ageMonths: 20, L: 0.0802, M: 10.7166, S: 0.10055 },
  { ageMonths: 21, L: 0.0789, M: 10.9441, S: 0.09994 },
  { ageMonths: 22, L: 0.0780, M: 11.1716, S: 0.09940 },
  { ageMonths: 23, L: 0.0775, M: 11.3975, S: 0.09892 },
  { ageMonths: 24, L: 0.0775, M: 11.6205, S: 0.09850 },
];

const WHO_BOYS: LMSRow[] = [
  { ageMonths:  0, L: 0.3487, M:  3.3464, S: 0.14602 },
  { ageMonths:  1, L: 0.2297, M:  4.4709, S: 0.13395 },
  { ageMonths:  2, L: 0.1970, M:  5.5675, S: 0.12385 },
  { ageMonths:  3, L: 0.1738, M:  6.3762, S: 0.11727 },
  { ageMonths:  4, L: 0.1553, M:  7.0023, S: 0.11316 },
  { ageMonths:  5, L: 0.1420, M:  7.5105, S: 0.10967 },
  { ageMonths:  6, L: 0.1339, M:  7.9340, S: 0.10680 },
  { ageMonths:  7, L: 0.1264, M:  8.2970, S: 0.10446 },
  { ageMonths:  8, L: 0.1200, M:  8.6151, S: 0.10258 },
  { ageMonths:  9, L: 0.1148, M:  8.9014, S: 0.10101 },
  { ageMonths: 10, L: 0.1101, M:  9.1649, S: 0.09981 },
  { ageMonths: 11, L: 0.1060, M:  9.4122, S: 0.09873 },
  { ageMonths: 12, L: 0.1022, M:  9.6479, S: 0.09772 },
  { ageMonths: 13, L: 0.0986, M:  9.8749, S: 0.09677 },
  { ageMonths: 14, L: 0.0951, M: 10.0953, S: 0.09584 },
  { ageMonths: 15, L: 0.0920, M: 10.3108, S: 0.09492 },
  { ageMonths: 16, L: 0.0890, M: 10.5228, S: 0.09408 },
  { ageMonths: 17, L: 0.0863, M: 10.7319, S: 0.09331 },
  { ageMonths: 18, L: 0.0839, M: 10.9385, S: 0.09261 },
  { ageMonths: 19, L: 0.0819, M: 11.1430, S: 0.09196 },
  { ageMonths: 20, L: 0.0802, M: 11.3462, S: 0.09136 },
  { ageMonths: 21, L: 0.0789, M: 11.5486, S: 0.09081 },
  { ageMonths: 22, L: 0.0780, M: 11.7504, S: 0.09031 },
  { ageMonths: 23, L: 0.0775, M: 11.9519, S: 0.08985 },
  { ageMonths: 24, L: 0.0775, M: 12.1490, S: 0.08943 },
];

/** Linearly interpolate LMS parameters at a fractional age in months */
function lmsAt(ageMonths: number, sex: 'M' | 'F'): LMSRow {
  const table = sex === 'F' ? WHO_GIRLS : WHO_BOYS;
  const clamped = Math.max(0, Math.min(24, ageMonths));
  const lo = Math.floor(clamped);
  const hi = Math.min(24, lo + 1);
  const frac = clamped - lo;
  const a = table[lo];
  const b = table[hi];
  return {
    ageMonths: clamped,
    L: a.L + frac * (b.L - a.L),
    M: a.M + frac * (b.M - a.M),
    S: a.S + frac * (b.S - a.S),
  };
}

/** Compute WHO z-score for a given weight and age */
export function computeZScore(weightKg: number, ageMonths: number, sex: 'M' | 'F'): number {
  const { L, M, S } = lmsAt(ageMonths, sex);
  return (Math.pow(weightKg / M, L) - 1) / (L * S);
}

/** Predict weight at ageMonths given a z-score */
export function predictWeightFromZ(z: number, ageMonths: number, sex: 'M' | 'F'): number {
  const { L, M, S } = lmsAt(ageMonths, sex);
  return M * Math.pow(1 + L * S * z, 1 / L);
}

/** Estimate the baby's z-score channel from all weight measurements */
export function estimateZChannel(
  weights: Array<{ timestamp: number; weightKg: number }>,
  dateOfBirthMs: number,
  sex: 'M' | 'F'
): number | null {
  if (weights.length === 0) return null;
  const zScores = weights.map(w => {
    const ageMonths = (w.timestamp - dateOfBirthMs) / (365.25 / 12 * 86_400_000);
    if (ageMonths < 0 || ageMonths > 24) return null;
    return computeZScore(w.weightKg, ageMonths, sex);
  }).filter((z): z is number => z !== null);
  if (zScores.length === 0) return null;
  return zScores.reduce((a, b) => a + b, 0) / zScores.length;
}

/** Predict baby's weight at a given timestamp */
export function predictWeightKg(
  weights: Array<{ timestamp: number; weightKg: number }>,
  dateOfBirthMs: number,
  sex: 'M' | 'F',
  atMs: number
): number | null {
  const z = estimateZChannel(weights, dateOfBirthMs, sex);
  if (z === null) return null;
  const ageMonths = (atMs - dateOfBirthMs) / (365.25 / 12 * 86_400_000);
  if (ageMonths < 0 || ageMonths > 24) return null;
  return predictWeightFromZ(z, ageMonths, sex);
}

/** Generate WHO reference curve points for the analytics weight chart.
 *  Returns points for each z-value at each whole month from startMonth to endMonth.
 */
export function whoReferenceCurves(
  sex: 'M' | 'F',
  startMonth: number,
  endMonth: number,
  zValues: number[] = [-2, -1, 0, 1, 2]
): Array<{ z: number; points: Array<{ ageMonths: number; weightKg: number }> }> {
  const clampedStart = Math.max(0, Math.floor(startMonth));
  const clampedEnd = Math.min(24, Math.ceil(endMonth));
  return zValues.map(z => ({
    z,
    points: Array.from({ length: clampedEnd - clampedStart + 1 }, (_, i) => {
      const ageMonths = clampedStart + i;
      return { ageMonths, weightKg: predictWeightFromZ(z, ageMonths, sex) };
    }),
  }));
}
