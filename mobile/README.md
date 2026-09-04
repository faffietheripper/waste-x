# Waste X Mobile

Waste X Mobile is the local-first iOS/Android field client for drivers, carriers and field operations.

## Foundation contract

- React Native + Expo SDK 57 + TypeScript
- iOS and Android
- Same Waste X shared contracts, validation, API client and operations-core as Desktop/Web
- Permanent device ID stored in the operating-system secure store
- SQLCipher-encrypted SQLite database
- Local sync outbox foundation
- No Cloud database/storage secrets on the phone
- Same logical job/load IDs as Web and Desktop

## Important: development builds, not Expo Go

Waste X enables SQLCipher through the `expo-sqlite` config plugin. SQLCipher is not available in Expo Go, so Mobile is developed and tested with native development builds.

From the repository root:

```bash
npm run mobile:install
npm run mobile:ios
```

or Android:

```bash
npm run mobile:android
```

After the first native build, Metro can be started with:

```bash
npm run mobile:start
```

For a physical phone, copy `.env.example` to `.env.local` and set `EXPO_PUBLIC_WASTE_X_API_BASE_URL` to the LAN-reachable Waste X API address. Do not put secrets in `EXPO_PUBLIC_*` variables.

## Step 11 progression

1. Foundation + encrypted local DB + secure device identity.
2. Cloud Mobile device registration and login.
3. Signed offline entitlement.
4. Driver/user scoped bootstrap.
5. Local assigned job/load cache.
6. Shared SyncEvent V1 outbox/push/pull.
7. Offline action → reconnect → same record visible on Web/Desktop proof.
