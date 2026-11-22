# DiaRhythm

Local-first desktop companion for diabetes-management routines, with an optional contactless
physiological-sensing experience powered by Presage SmartSpectra.

> **Not a medical device.** DiaRhythm is a self-management and wellness tool. It never infers blood
> glucose, hypoglycaemia, hyperglycaemia or diabetic complications. Glucose values are
> user-entered records only; the app provides no diagnosis or treatment advice.

## Technology stack

- **Shell:** Electron (Node.js + Chromium)
- **UI:** React + TypeScript, Vite
- **Storage:** SQLite (better-sqlite3) in the OS application-data directory; overridable via `APP_DATA_DIR`
- **Tests:** vitest (`npm test`)
- **Optional sensing:** Presage SmartSpectra SDK (`SMARTSPECTRA_ENABLED=false` by default)

## Project structure

```
src/main            Electron main process: window lifecycle, SQLite bridge, narrow IPC handlers
src/main/database   SQLite schema, local persistence and validated data operations
src/main/export     CSV report export from the renderer
src/main/sensor     SmartSpectra sensing service (optional stub)
src/preload         contextBridge exposing only validated operations to the renderer
src/renderer        React renderer: app shell, routes, features, styles
tests               vitest unit / integration tests
```

## Installation

```bash
npm install
```

## Running

### Development (renderer via Vite dev server)

```bash
npm run dev
```

#### Development setup & troubleshooting

**Node.js 22.12+ is required.** `npm install` runs Electron's postinstall script to
download the Electron binary, which fails on Node < 22 (an ESM/CJS mismatch in
`@electron/get`). If you see `Error: Electron uninstall` when running `npm run dev`,
switch to Node 22+ and download the binary once:

```bash
nvm use 22
npx install-electron
```

**`ELECTRON_RUN_AS_NODE` must be unset.** If this variable is set in your shell,
Electron runs as plain Node and `require('electron')` returns a path string instead of
the API, crashing the main process with
`Cannot read properties of undefined (reading 'whenReady')`. Run dev with it unset:

```bash
env -u ELECTRON_RUN_AS_NODE npm run dev
```

The first run builds the main/preload SSR bundles and starts the Vite dev server at
`http://localhost:5173/`.

### Production build

```bash
npm run build
```

The build emits `dist/electron/{main,preload,renderer}`.

### Linux release candidate

On Linux x64 with glibc 2.35 or later, build an AppImage with:

```bash
npm run package:linux
```

The AppImage is written to `release/`. The SmartSpectra Linux x64 runtime is copied
to the AppImage's external resources, while `.env` and local SQLite files are
excluded. Set `SMARTSPECTRA_API_KEY` in the launching environment to enable live
sensing; do not put production credentials in the package.

## Tests

```bash
npm test
```

## Type check

```bash
npm run typecheck
```

## SmartSpectra (live physiological sensing)

DiaRhythm uses the official Presage SmartSpectra Electron integration:

- `npm install @smartspectra/node-sdk` — done (see package.json).
- Electron main: `bindSmartSpectraIpc(window)` from `@smartspectra/node-sdk/main`.
- Preload: `@smartspectra/node-sdk/preload` (exposes `__smartspectraBridge`).
- Renderer: `SmartSpectraSDK` from `@smartspectra/node-sdk/renderer`, metrics decoded with
  `decodeMetrics` from `@smartspectra/node-sdk/messages`.

The SDK requires Node.js 20+ and Electron 28+. For this project's Electron 42 and packaging
toolchain, use Node.js 22.12 or later during development and packaging. The AppImage uses
Electron's embedded Node runtime after launch.

### Configuration

Create `.env` (gitignored) from `.env.example`:

```bash
cp .env.example .env
# edit .env and set SMARTSPECTRA_API_KEY
SMARTSPECTRA_API_KEY=your_api_key_here
```

The API key is read from the environment in the main process and passed to the renderer SDK
through the context-isolated preload bridge — it is never in source control.

### Privacy and safety

- Camera access is gated by an explicit in-app consent screen before `sdk.start()`.
- DiaRhythm never records or saves camera footage; live measurements are held in memory only.
- SDK telemetry is explicitly disabled: `enableTelemetry: false`. Note that disabling telemetry
  does not make the SDK offline — the SDK still authenticates with Presage's service over an
  authenticated TLS channel for measurement processing. This network behavior is disclosed;
  biometric summaries are not persisted in this release. The settings screen records a preference
  for a future summary feature.
- SmartSpectra is for general wellness information only. DiaRhythm never estimates glucose,
  diagnoses diabetes or complications, or recommends medication or treatment changes.

### Verification

Run the app and open the **Check-in** route:

1. Consent granted → camera preview appears, "Starting…" then "Live".
2. Wait ~12 s for pulse → a genuine decoded pulse reading (bpm + confidence) appears.
3. Deny camera permission (or no camera present) → a clear, retryable error appears.
4. Stop measurement → camera indicator off, preview stops, SDK session torn down.

See docs/Plan.md §4, §11 and the daily check-ins for the integration design and acceptance
criteria.

## Current scope and known limitations

- Implemented: local glucose journal (form-based create/edit/delete, date filters, repeat latest),
  medication list and taken/skipped day view, optional desktop reminders while the app is running,
  meal/activity/note logs with repeat-last shortcuts, selectable dashboard cards and a simple
  glucose history trend, CSV export, unit preference, consent preference, and delete-all-data.
- SmartSpectra requests breathing and cardio measurements. Pulse and breathing are shown only for
  stable, non-zero-confidence readings. The breathing orb stays still until a valid breathing
  signal arrives, then follows its measured rate.
- Camera footage and biometric history are not saved by DiaRhythm. SmartSpectra uses authenticated
  service communication; do not assume all frame processing is local without confirmation from
  Presage.
- The Linux x64 AppImage has been packaged and its clean-profile startup verified, but a live
  Presage measurement, camera permission flows, OS notifications, and end-to-end UI workflows
  remain unverified release gates.

See the [RC-1 QA report](docs/RC-1-QA-2026-11-18.md) for verified results and remaining gates.

See [Error.md](Error.md) for review fixes and the remaining validation items.

## Medical disclaimer

DiaRhythm is not a medical device and is not a substitute for professional medical advice,
diagnosis, or treatment. Always consult a qualified healthcare professional about your
diabetes-management routine.
