/**
 * A provisioning profile describes one kind of dedicated device: which apps to install,
 * which app becomes Device Owner, what the operator fills in per unit, and the steps to run.
 * See docs/profiles.md for the full reference.
 */
export interface Profile {
  schemaVersion: 1;
  name: string;
  description?: string;
  branding?: Branding;
  apps: AppSpec[];
  deviceOwner?: DeviceOwnerSpec;
  fields?: FieldSpec[];
  checks?: CheckSpec;
  steps: Step[];
  /** Operator guide in Markdown, keyed by locale (for example "en", "id"). */
  guide?: Record<string, string>;
}

export interface Branding {
  /** Shown in the header and the browser tab. */
  title?: string;
  /** Hex colour such as "#2457d6". */
  accent?: string;
  /** data: URI or https URL of a square logo. */
  logo?: string;
}

export interface AppSpec {
  /** Short id used by steps, for example "kiosk". */
  id: string;
  packageName: string;
  label?: string;
  /** Optional https download link. The server must allow cross-origin requests. */
  url?: string;
  /** Optional SHA-256 of the file. A loaded or downloaded file must match it. */
  sha256?: string;
}

export interface DeviceOwnerSpec {
  /** Id of the app in `apps` that becomes Device Owner. */
  app: string;
  /** Admin receiver class, either ".Receiver" or fully qualified. */
  receiver: string;
}

export interface FieldSpec {
  id: string;
  label: string;
  required?: boolean;
  /** Regular expression the value must match. */
  pattern?: string;
  placeholder?: string;
  help?: string;
  /** Keep the value for the next unit (batch mode). Default false: cleared after each unit. */
  keep?: boolean;
}

export interface CheckSpec {
  minSdk?: number;
  noAccounts?: boolean;
  singleUser?: boolean;
  noOtherDeviceOwner?: boolean;
  minBatteryPercent?: number;
}

interface StepBase {
  /** Overrides the default label shown to the operator. */
  label?: string;
}

export type Step =
  | (StepBase & { type: "install"; app: string; grantPermissions?: boolean })
  | (StepBase & { type: "setDeviceOwner" })
  | (StepBase & { type: "verifyDeviceOwner" })
  | (StepBase & { type: "grantPermissions"; app: string; permissions: string[] })
  | (StepBase & { type: "setting"; namespace: "global" | "secure" | "system"; key: string; value: string })
  | (StepBase & { type: "pushFile"; path: string; content: string })
  | (StepBase & { type: "broadcast"; component?: string; action?: string; extras?: Record<string, string | number | boolean> })
  | (StepBase & { type: "disablePackages"; packages: string[] })
  | (StepBase & { type: "shell"; command: string; allowFailure?: boolean })
  | (StepBase & { type: "launch"; app: string })
  | (StepBase & { type: "reboot" });

export type StepType = Step["type"];

export const STEP_TYPES: readonly StepType[] = [
  "install", "setDeviceOwner", "verifyDeviceOwner", "grantPermissions", "setting",
  "pushFile", "broadcast", "disablePackages", "shell", "launch", "reboot",
];
