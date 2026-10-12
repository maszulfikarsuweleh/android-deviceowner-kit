# Preparing your Android app

This page shows what an app needs so Ownerkit can make it the **Device Owner**, and how the app can then act as a locked-down kiosk. The code is Kotlin and targets Android 7.0 (API 24) or later.

## 1. Device admin receiver (required)

`dpm set-device-owner` needs a `DeviceAdminReceiver` in your app. Its component is what goes in the profile's `deviceOwner.receiver`.

```xml
<!-- AndroidManifest.xml -->
<receiver
    android:name=".admin.AdminReceiver"
    android:exported="true"
    android:permission="android.permission.BIND_DEVICE_ADMIN">
    <meta-data android:name="android.app.device_admin" android:resource="@xml/device_admin" />
    <intent-filter>
        <action android:name="android.app.action.DEVICE_ADMIN_ENABLED" />
    </intent-filter>
</receiver>
```

```xml
<!-- res/xml/device_admin.xml -->
<device-admin>
    <uses-policies>
        <force-lock />
    </uses-policies>
</device-admin>
```

```kotlin
class AdminReceiver : DeviceAdminReceiver() {
    override fun onEnabled(context: Context, intent: Intent) {
        KioskPolicy(context).apply()
    }

    companion object {
        fun component(context: Context) = ComponentName(context, AdminReceiver::class.java)
    }
}
```

The matching profile entry is `"deviceOwner": { "app": "kiosk", "receiver": ".admin.AdminReceiver" }`.

> **During development**, add `android:testOnly="true"` to `<application>` in `src/debug/AndroidManifest.xml`. A test-only Device Owner can be removed with `adb shell dpm remove-active-admin`. A release build can only give up ownership itself, or by factory reset.

## 2. Kiosk policies

Once the app is Device Owner, it can pin itself to the screen and become the home app, so it starts on boot and comes back after a crash or update.

```kotlin
class KioskPolicy(context: Context) {
    private val app = context.applicationContext
    private val dpm = app.getSystemService(DevicePolicyManager::class.java)
    private val admin = AdminReceiver.component(app)

    val isOwner get() = dpm.isDeviceOwnerApp(app.packageName)

    /** Safe to call on every start: each call re-asserts the same policies. */
    fun apply() {
        if (!isOwner) return

        // Lock Task (pinning): only this app may run, with no Home, Recents or notifications.
        dpm.setLockTaskPackages(admin, arrayOf(app.packageName))
        if (Build.VERSION.SDK_INT >= 28) dpm.setLockTaskFeatures(admin, DevicePolicyManager.LOCK_TASK_FEATURE_NONE)

        // Be the home app: boot, crashes and updates all return here.
        val home = IntentFilter(Intent.ACTION_MAIN).apply {
            addCategory(Intent.CATEGORY_HOME); addCategory(Intent.CATEGORY_DEFAULT)
        }
        dpm.addPersistentPreferredActivity(admin, home, ComponentName(app, MainActivity::class.java))

        // Harden a public device.
        listOf(
            UserManager.DISALLOW_FACTORY_RESET, UserManager.DISALLOW_SAFE_BOOT, UserManager.DISALLOW_ADD_USER,
            UserManager.DISALLOW_MOUNT_PHYSICAL_MEDIA, UserManager.DISALLOW_INSTALL_UNKNOWN_SOURCES,
        ).forEach { dpm.addUserRestriction(admin, it) }
        dpm.setKeyguardDisabled(admin, true)
        dpm.setStatusBarDisabled(admin, true)

        // Install OS updates only between 02:00 and 05:00.
        dpm.setSystemUpdatePolicy(admin, SystemUpdatePolicy.createWindowedInstallPolicy(120, 300))
    }
}
```

> Add `UserManager.DISALLOW_DEBUGGING_FEATURES` only for field units. After that, USB debugging (and Ownerkit) no longer reaches the device.

In the manifest, make the main activity a launcher and home activity that pins itself:

```xml
<activity
    android:name=".MainActivity"
    android:exported="true"
    android:launchMode="singleTask"
    android:lockTaskMode="if_whitelisted">
    <intent-filter>
        <action android:name="android.intent.action.MAIN" />
        <category android:name="android.intent.category.LAUNCHER" />
    </intent-filter>
    <intent-filter>
        <action android:name="android.intent.action.MAIN" />
        <category android:name="android.intent.category.HOME" />
        <category android:name="android.intent.category.DEFAULT" />
    </intent-filter>
</activity>
```

```kotlin
class MainActivity : ComponentActivity() {
    override fun onResume() {
        super.onResume()
        val dpm = getSystemService(DevicePolicyManager::class.java)
        val am = getSystemService(ActivityManager::class.java)
        if (dpm.isLockTaskPermitted(packageName) && am.lockTaskModeState == ActivityManager.LOCK_TASK_MODE_NONE) {
            startLockTask()
        }
    }
}
```

## 3. Start on boot and after an update

Being the home app covers most cases. This receiver is a backup, and it re-applies policies that a new version of the app may add. Device Owner apps are allowed to start activities from the background.

```xml
<uses-permission android:name="android.permission.RECEIVE_BOOT_COMPLETED" />
<receiver android:name=".admin.StartReceiver" android:exported="false">
    <intent-filter>
        <action android:name="android.intent.action.BOOT_COMPLETED" />
        <action android:name="android.intent.action.MY_PACKAGE_REPLACED" />
    </intent-filter>
</receiver>
```

```kotlin
class StartReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        KioskPolicy(context).apply()
        context.packageManager.getLaunchIntentForPackage(context.packageName)
            ?.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            ?.let(context::startActivity)
    }
}
```

## 4. Receive per-unit configuration from Ownerkit

Don't bake per-unit values (site codes, station IDs, server environment) into the APK: editing an APK breaks its signature. Ship **one** signed build, and let Ownerkit send the values at provisioning time with a `broadcast` step.

Protect the receiver with the `DUMP` permission. Only the ADB shell and the system hold it, so other apps on the device can't send fake configuration.

```xml
<receiver
    android:name=".admin.ProvisioningReceiver"
    android:exported="true"
    android:permission="android.permission.DUMP" />
```

```kotlin
class ProvisioningReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val site = intent.getStringExtra("site")
        if (site.isNullOrBlank()) {
            resultCode = 2           // Ownerkit shows "result 2" next to the step
            return
        }
        // Store securely, for example with Tink AEAD and a key in the Android Keystore.
        Config(context).save(site = site, unit = intent.getStringExtra("unit"))
        resultCode = Activity.RESULT_OK  // -1
    }
}
```

```json
{ "type": "broadcast", "component": "com.example.kiosk/.admin.ProvisioningReceiver",
  "extras": { "site": "{{field.site}}", "unit": "{{field.unit}}" }, "label": "Send site and unit to the app" }
```

Consider accepting configuration only while the app isn't configured yet, or after an on-device technician check, so a person with a cable can't re-point a unit later. Secrets delivered this way can still be read from the device by someone with root access; per-device keys issued by your backend are safer than one shared secret.

## 5. Updating the app later

There are two options:

- **With Ownerkit:** load the new APK and run the same profile. The owner check passes with a warning ("Already managed by this profile's app"), `install` updates the app, and `setDeviceOwner` is skipped.
- **Over the air:** a Device Owner can install updates without a prompt using `PackageInstaller`. Set `setRequireUserAction(USER_ACTION_NOT_REQUIRED)` on API 31+, verify a SHA-256 before installing, and never update during a transaction.

Every update must be signed with the **same key**. If you lose the signing key, every unit has to be factory reset and provisioned again, so keep it backed up.
