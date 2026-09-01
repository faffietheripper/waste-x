# Waste X Bridge

Waste X Bridge is the long-running local service boundary for Waste X Desktop.

## V1 process contract

- Executable: `waste-x-bridge`
- Loopback: `127.0.0.1:43127` only
- Public local health: `GET /v1/health`
- Protected runtime status: `GET /v1/runtime`
- Protected endpoints require `X-Waste-X-Bridge-Token`.
- The Bridge token is generated once and stored in the operating-system credential store under `com.wastex.desktop.bridge / bridge-token-v1`.
- The Bridge reads the existing SQLCipher database using the database key already stored in the OS credential store. It never prints either secret.

The React webview never receives the Bridge token. Tauri's native `bridge_client` performs authenticated loopback calls and returns safe status only.

## Development

From the repository root, run Bridge independently:

```bash
npm run desktop:bridge:dev
```

Then start the Desktop UI in a different terminal:

```bash
npm run desktop:dev
```

Open the global status dock. `Bridge UP` should appear with a PID and SQLCipher/schema information.

To prove the process boundary, note the Bridge PID, close Waste X Desktop completely, then relaunch `npm run desktop:dev`. The Bridge terminal and PID must remain alive and unchanged.

## Production service model

The Bridge executable is intentionally independent from Tauri. The production installer will register it as:

- Windows: Windows Service
- macOS: launchd background service

That registration belongs to installer/update work so upgrades, permissions, service recovery, logging, and uninstall are handled atomically. Hardware, printing, weighbridge protocols, evidence transfer and autonomous sync will attach to this process rather than the React webview.
