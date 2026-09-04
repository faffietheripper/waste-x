# Waste X Mobile — Step 11 certification

Step 11 is the Mobile foundation gate. Passing it means the app has a native runtime, encrypted local storage, device-bound authentication, offline authorisation, a driver-scoped working set, a durable sync outbox, and the protocol boundary for handing Mobile events to a paired site Bridge.

## Automated gate

From the repository root run:

```bash
npm run mobile:certify
```

That command must pass all four checks:

1. Mobile TypeScript (`npm run mobile:check`)
2. Web/root TypeScript (`npx tsc --noEmit`)
3. Waste X Bridge Rust compile (`npm run desktop:bridge:check`)
4. Expo public config/assets (`expo config --type public`)

## Runtime proofs already completed

- iOS native development build boots.
- SQLCipher opens and reports a cipher version.
- SecureStore keeps the permanent Mobile device identity.
- Mobile registration/login/logout works against Waste X Cloud.
- Cloud recognises `deviceType = MOBILE`.
- A signed 14-day offline entitlement is issued while online.
- With Cloud unavailable, Mobile enters `OFFLINE READY` and unlocks through iOS device authentication.
- Driver-scoped bootstrap safely returns `NO_DRIVER_MATCH` + zero loads when the signed-in account is not uniquely linked to an active Driver.

## Runtime proofs that require suitable operational data

These are not reasons to weaken the scope rules or manufacture fake production records. Complete them when a real test Driver/load exists:

- Match a Waste X account to one active Driver by email.
- Assign at least one load inside the 14-day horizon.
- Refresh Mobile and verify the same load is persisted in SQLCipher after app restart with Cloud stopped.
- Record one allowed load action locally and verify the Mobile outbox remains durable across restart.
- Restore Cloud and verify the same `SyncEventV1.eventId` is applied once and the Web/Desktop record converges.

## Bridge relay foundation proof

The Bridge admin/runtime API remains bound to `127.0.0.1`. For development, Desktop can create a Mobile pairing through `desktop_bridge_create_mobile_pairing` and the resulting JSON payload can be imported by `storeMobileBridgePairingPayload`.

A successful relay must satisfy all of these rules:

- Mobile and Bridge pairing device IDs match.
- Organisation IDs match.
- Relay secret is device-specific and only its SHA-256 hash is stored by Bridge.
- Bridge accepts a maximum of 100 events per batch.
- Bridge stores original Mobile event/device/user/sequence/timestamps in encrypted SQLCipher storage.
- Mobile marks the event as relayed but keeps it `PENDING` for Cloud.
- A repeated event ID returns `DUPLICATE` rather than creating another relay record.

### Production LAN gate

Do **not** expose the current plain HTTP listener on a site LAN. The production LAN listener must terminate TLS. Waste X Mobile already refuses plain HTTP for any non-localhost Bridge address. TLS service/discovery packaging belongs to the later platform security/distribution hardening step; the Step 11 transport contract is intentionally ready for it without changing the outbox/event model.

## Branding proof

After pulling the Step 11 branding commit, regenerate the native iOS project once:

```bash
cd mobile
npx expo prebuild --clean
cd ..
npm run mobile:ios
```

Verify:

- Waste X icon is shown on the iOS home screen.
- The launch screen uses the Waste X wordmark on the dark background.
- No default Expo icon/splash remains.
- Android adaptive icon config resolves when Android is built later.

## Step 12 gate

Once the automated gate passes and the branded iOS build opens, the repository is ready to begin Step 12 UI/product work. The deferred real-load sync proof should be completed as soon as suitable driver assignment data exists, but it does not justify blocking My Day/Job Detail development or weakening least-privilege Mobile scoping.
