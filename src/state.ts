import type { AppPackage } from "./apk/apk";
import type { Device } from "./adb/device";
import type { EnvReport } from "./adb/env";
import type { Locale } from "./i18n";
import type { ValidationIssue } from "./profile/validate";
import type { Profile } from "./profile/types";
import type { CheckResult } from "./steps/checks";
import type { StepState } from "./steps/engine";

export type LogLevel = "info" | "ok" | "warn" | "err";
export interface LogLine { time: string; level: LogLevel; text: string }

export type Phase = "profile" | "apps" | "device" | "checks" | "fields" | "ready" | "running" | "done" | "failed";

export interface State {
  env: EnvReport | null;
  locale: Locale;
  profile: Profile | null;
  profileFile: string;
  profileIssues: ValidationIssue[];
  apps: ReadonlyMap<string, AppPackage>;
  appErrors: ReadonlyMap<string, string>;
  fields: Readonly<Record<string, string>>;
  device: Device | null;
  connecting: boolean;
  checks: CheckResult[] | null;
  steps: StepState[];
  running: boolean;
  outcome: "provisioned" | "failed" | null;
  failedAt: number | null;
  batch: boolean;
  /** Seconds left before batch mode starts the next device, or null. */
  countdown: number | null;
  sound: boolean;
  guideOpen: boolean;
  builderOpen: boolean;
  log: LogLine[];
}

type Listener = (state: State, prev: State) => void;

export function createStore(initial: State) {
  let state = initial;
  const listeners = new Set<Listener>();
  return {
    get: () => state,
    set(patch: Partial<State> | ((s: State) => Partial<State>)) {
      const prev = state;
      state = { ...state, ...(typeof patch === "function" ? patch(state) : patch) };
      for (const l of listeners) l(state, prev);
    },
    /** Calls `fn` when any selected value changes (compared by identity). */
    watch<T extends readonly unknown[]>(select: (s: State) => T, fn: (state: State) => void) {
      let last = select(state);
      fn(state);
      listeners.add((s) => {
        const next = select(s);
        if (next.length !== last.length || next.some((v, i) => v !== last[i])) {
          last = next;
          fn(s);
        }
      });
    },
  };
}

export type Store = ReturnType<typeof createStore>;
