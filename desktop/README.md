# Waste X Desktop

Cross-platform Waste X operational desktop client built with Tauri 2, React and TypeScript.

## Supported targets

- macOS
- Windows
- Linux can be enabled later if required

The desktop frontend is intentionally separate from the existing Next.js application. Shared Waste X logic lives in `../packages`.

## Local development

Install JavaScript dependencies:

```bash
npm install
```

Install the Tauri platform prerequisites for your operating system, including Rust.

Run the React frontend only:

```bash
npm run dev
```

Run the Tauri desktop application:

```bash
npm run tauri:dev
```

Build the frontend:

```bash
npm run build
```

Build the native desktop bundle:

```bash
npm run tauri:build
```

## Architecture rule

The UI must not connect directly to PostgreSQL/RDS or contain AWS/database credentials. Offline data, hardware integration and synchronisation will be provided through the local Waste X Bridge layer.
