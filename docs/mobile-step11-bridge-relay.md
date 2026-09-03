# Step 11.6 — Mobile ↔ Bridge relay foundation

This slice establishes the secure protocol boundary for Waste X Mobile to hand locally queued `SyncEventV1` events to a paired Waste X Bridge when Cloud is unavailable.

## Security model

- The existing Bridge admin/runtime token remains loopback-only and is never copied to Mobile.
- Each Mobile device receives a separate 256-bit relay secret. Bridge stores only its SHA-256 hash.
- Pairings are device-bound and organisation-bound.
- Mobile requires HTTPS for any non-localhost Bridge URL. Plain HTTP is permitted only for localhost development.
- A Bridge receipt is not treated as Cloud sync. Mobile keeps the original event `PENDING` until Cloud confirms the exact event ID.
- Bridge stores the original Mobile event ID, device ID, actor user ID, device sequence, payload and timestamps in encrypted SQLCipher storage.

## Pairing flow foundation

1. Desktop/Bridge is already provisioned to an organisation/site.
2. Desktop invokes `desktop_bridge_create_mobile_pairing` with the Mobile `deviceId`.
3. Bridge generates a relay secret and stores only the hash in encrypted local storage.
4. Desktop receives a JSON pairing payload suitable for QR/deep-link encoding.
5. Mobile imports the payload through `storeMobileBridgePairingPayload` and stores it in SecureStore.
6. Mobile validates Bridge identity through `/v1/mobile/health` before relaying events.

## Relay flow

`Mobile SQLCipher outbox → LocalBridgeTransport → Bridge encrypted relay inbox`

The phone records `last_relayed_at`, but the event remains pending for Cloud. This gives both the phone and site computer a durable copy without falsely claiming Cloud receipt.

## Production LAN note

The current Bridge executable still binds its HTTP administration listener to `127.0.0.1`. This is deliberate. The production site-LAN listener must terminate TLS before these Mobile relay routes are exposed beyond localhost. The Mobile client already rejects plain HTTP for non-localhost addresses, so an insecure LAN deployment cannot accidentally become the production configuration.
