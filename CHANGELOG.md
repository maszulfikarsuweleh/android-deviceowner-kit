# Changelog

## Unreleased

- Removed run history and its CSV/JSON export. It stored device serials, models and per-unit field values, which is personal data. History already stored in the browser is deleted on first load.

## 0.1.0

First public release.

- Provisioning profiles with validation, placeholders and a JSON Schema.
- Steps: install (APK and split bundles), set and verify Device Owner, grant permissions, settings, push file, broadcast, disable packages, shell, launch, reboot.
- Retry from a failed step without repeating finished steps.
- Preflight checks: Android version, accounts, users, existing Device Owner, battery.
- Batch mode with auto-connect, countdown and sound.
- Run history with full logs in IndexedDB; CSV and JSON export.
- Operator guide in English and Bahasa Indonesia, replaceable per profile, printable.
- Environment and USB diagnostics in plain language.
- White-label branding from the profile; light and dark themes.
