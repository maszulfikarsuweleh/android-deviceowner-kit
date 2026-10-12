import type { Device } from "../adb/device";
import type { Profile } from "../profile/types";

export type CheckId = "sdk" | "accounts" | "users" | "owner" | "battery";

export interface CheckResult {
  id: CheckId;
  status: "ok" | "warn" | "fail";
  /** Values for the localized label and hint. */
  values: Record<string, string | number>;
}

/** Preflight checks that decide whether provisioning can start. Defaults suit Device Owner setup. */
export async function runChecks(device: Device, profile: Profile): Promise<CheckResult[]> {
  const spec = {
    minSdk: 24,
    noAccounts: !!profile.deviceOwner,
    singleUser: !!profile.deviceOwner,
    noOtherDeviceOwner: !!profile.deviceOwner,
    ...profile.checks,
  };
  const ownerPkg = profile.deviceOwner
    ? profile.apps.find((a) => a.id === profile.deviceOwner?.app)?.packageName ?? null
    : null;
  const results: CheckResult[] = [];

  const sdk = device.facts.sdk;
  results.push({ id: "sdk", status: sdk >= spec.minSdk ? "ok" : "fail", values: { sdk, min: spec.minSdk } });

  const [accounts, users, owner, battery] = await Promise.all([
    spec.noAccounts ? device.accountCount() : Promise.resolve(null),
    spec.singleUser ? device.userCount() : Promise.resolve(null),
    spec.noOtherDeviceOwner ? device.deviceOwnerPackage() : Promise.resolve(undefined),
    spec.minBatteryPercent ? device.batteryPercent() : Promise.resolve(null),
  ]);

  if (accounts !== null) results.push({ id: "accounts", status: accounts === 0 ? "ok" : "fail", values: { count: accounts } });
  if (users !== null) results.push({ id: "users", status: users <= 1 ? "ok" : "fail", values: { count: users } });
  if (owner !== undefined) {
    results.push({
      id: "owner",
      status: !owner ? "ok" : owner === ownerPkg ? "warn" : "fail",
      values: { owner: owner ?? "", expected: ownerPkg ?? "" },
    });
  }
  if (spec.minBatteryPercent && battery !== null) {
    results.push({ id: "battery", status: battery >= spec.minBatteryPercent ? "ok" : "fail", values: { level: battery, min: spec.minBatteryPercent } });
  }
  return results;
}
