export interface Feed {
  id: string;
  timestamp: number; // Unix ms
  volume: number; // ml
}

export interface Settings {
  weightKg: number;
  mlPerKgPerDay: number;
  standardBottleVolume: number;
}

export interface DerivedSettings {
  dailyTargetMl: number;
  hourlyRate: number;
  idealIntervalHours: number;
}

export interface FeedWithCredit extends Feed {
  ageHours: number;
  creditMl: number;
}
