# Security

## What Ownerkit can do to a device

Ownerkit talks to a device over ADB, which the device owner has to approve on screen. Once it's approved, a profile can install apps, set a Device Owner, change settings and run shell commands. Treat profiles like scripts:

- Only load profiles from people you trust. Review them with **Show commands** in the plan before the first run.
- Pin app files with `sha256` in the profile, so operators can't install the wrong build.
- Keep private profiles and APKs out of public repositories. `.gitignore` already excludes `*.apk`, `*.apks` and `profiles.local/`.

## What Ownerkit stores

Everything stays in the browser that runs it:

- **ADB key:** an RSA key in IndexedDB. A device that ticked "Always allow from this computer" trusts this browser profile.
- **Run history:** not stored. Older versions kept it in IndexedDB; the current version deletes that data on first load.
- **Preferences:** language, batch mode, sound and guide visibility in localStorage.

Nothing is sent to a server. The hosted copy loads no third-party scripts or fonts.

## Field devices

- Turn on `DISALLOW_DEBUGGING_FEATURES` from your app for devices in public places, after provisioning is complete.
- Anything provisioned to a device, including secrets sent by a `broadcast` step, can be extracted by someone with root access. Prefer per-device credentials.

## Reporting a vulnerability

Please report it privately with GitHub's "Report a vulnerability" button on the Security tab, rather than in a public issue.
