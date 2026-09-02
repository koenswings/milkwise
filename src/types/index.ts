export interface WeightEntry {
  id: string;
  timestamp: number;  // ms — when this weight was recorded
  weightKg: number;
}

export interface Feed {
  id: string;
  timestamp: number; // Unix ms
  volume: number;    // water ml
  // Note: legacy feeds.json entries may contain `targetMlPerDay`; it is ignored in all calculations.
  // The target at any past time is now derived from weights.json via dailyTargetAtTime().
}

export interface Settings {
  weightKg: number;
  mlPerKgPerDay: number;
  preferredBottleWaterMl: number;  // preferred bottle size in water ml (60/90/120/150)
  yellowThresholdPct: number;      // default 5
  redThresholdPct: number;         // default 10
  timeFormat: '24h' | '12h';
  feedingTimelineView?: 'timeline' | 'cards';
  dateOfBirthMs?: number;
  sex?: 'M' | 'F';
}

export interface PredictorResult {
  // Predictor A
  predictorATimestamp: number;
  predictorAVolumeMilk: number;
  predictorAVolumeWater: number;
  predictorACapped: boolean;
  predictorASurplus: boolean;
  predictorACapNote?: string;
  // Predictor B
  predictorBTimestamp: number;
  predictorBStomachLimited: boolean;
  predictorBCapped: boolean;
  predictorBFloorTimestamp: number;
  // Shared
  standardIntervalMs: number;
  stomachCapMilk: number;
}

export interface NextFeedResult {
  timestamp: number;              // suggested next feed time (ms)
  balanceMl: number;              // energy balance ml (+ overfed, - underfed)
  capped: boolean;                // true if cap was applied
}

export interface DerivedSettings {
  dailyTargetMl: number;      // prepared formula ml/day (milk ml)
  hourlyRate: number;         // prepared formula ml/hour (milk ml)
  idealIntervalHours: number; // hours between feeds
  milkPerBottle: number;      // prepared formula ml per preferredBottleWaterMl of water
}

export interface FeedWithCredit extends Feed {
  ageHours: number;
  creditMl: number;
}
