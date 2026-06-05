# MilkWise — React Native App

A precision bottle-feeding tracker built with Expo + React Native. Runs on iOS and Android via Expo Go, buildable for App Store / Google Play via EAS.

## Dev Environment

Create `.env.local` with the API URL for the running IDEA App instance:

```
EXPO_PUBLIC_API_URL=http://100.85.108.118:3333
```

(idea02 Tailscale IP — `idea02.tail2d60.ts.net`. In `__DEV__` mode the app fetches feeds from this address.)

## Development

```bash
# Start Metro bundler (LAN mode, for Expo Go on same network)
npx expo start --lan --port 8082

# TypeScript check
npx tsc --noEmit

# Web export (for validation)
npx expo export --platform web
```

Expo project: `@koenswings/milkwise` (ID: `16e4e7d9-35a5-4604-9046-bf630253ab73`)

## Architecture

- **Framework:** Expo SDK 54 / React Native 0.81
- **Navigation:** React Navigation v7 (bottom tabs)
- **Storage:** AsyncStorage (local to device)
- **Charts:** react-native-chart-kit

## Companion repos

- **Web app:** [koenswings/baby-milk-tracker](https://github.com/koenswings/baby-milk-tracker)
- **App Disk wrapper:** [koenswings/app-milkwise](https://github.com/koenswings/app-milkwise)

## Shared Core — Sync Rule ⚠️

The following files are **shared core** between this repo and `baby-milk-tracker`. Any change to either file must be applied to **both repos in the same work session**:

| File | Purpose |
|------|---------|
| `src/types/index.ts` | Shared type definitions |
| `src/lib/calculations.ts` | All business logic (smoothed formula, stats, etc.) |

`src/lib/store.ts` and all UI files are intentionally separate — the RN app uses AsyncStorage; the web app uses server-side API routes.

## UI changes — mirror rule ⚠️

Whenever a UI change is made to the web app, Kit will propose applying the equivalent change to this React Native app as well. The two implementations stay in sync by design.

## Known limitations

- **Notifications** — installed but not wired up; requires physical device or simulator
- **EAS builds** — ARM (Pi) cannot run Hermes compiler; EAS cloud builds required for store submission
- **Expo Go** — requires SDK 54-compatible Expo Go from the App Store
