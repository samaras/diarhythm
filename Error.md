# Known issues to address

These findings came from the project review and are recorded here for follow-up.

## Fixed in the roadmap implementation

- **SDK startup failure prevented a retry.** `SensingSession.start()` kept the SDK instance when `sdk.start()` rejected, so later starts returned early. Startup failure now stops/destroys the instance and clears it.
- **macOS reactivation bound SmartSpectra twice.** `createWindow()` already binds the bridge; the `activate` handler no longer binds it a second time.
- **A custom database directory could prevent startup.** The database opener now creates its parent directory before opening SQLite.

## Remaining external validation

- Validate SmartSpectra authentication, camera permission, live metrics, teardown and native runtime on the target operating systems with a valid Presage API key and camera. These cannot be confirmed from this development environment alone.
- Confirm the SDK's complete camera-frame processing and retention behavior with Presage before making any claim that frames remain on-device.
- Add and run integration and UI coverage for database persistence, permission denial, delete-all-data, and the full journal workflows before release.
- Medication reminders are opt-in and only fire while DiaRhythm is running; validate notification delivery and behavior across supported operating systems before relying on them.
