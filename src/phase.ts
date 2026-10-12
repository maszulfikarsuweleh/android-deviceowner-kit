import type { Profile } from "./profile/types";
import type { TemplateVars } from "./profile/template";
import type { Phase, State } from "./state";

/** Apps the plan installs, which must be loaded before running. */
export function requiredAppIds(profile: Profile): string[] {
  return [...new Set(profile.steps.flatMap((s) => (s.type === "install" ? [s.app] : [])))];
}

export type FieldProblem = "required" | "invalid";

export function fieldProblems(profile: Profile | null, values: Record<string, string>): Record<string, FieldProblem> {
  const problems: Record<string, FieldProblem> = {};
  for (const f of profile?.fields ?? []) {
    const v = (values[f.id] ?? "").trim();
    if (!v) { if (f.required) problems[f.id] = "required"; continue; }
    if (f.pattern && !new RegExp(f.pattern).test(v)) problems[f.id] = "invalid";
  }
  return problems;
}

export function templateVars(state: State): TemplateVars {
  const vars: TemplateVars = { "profile.name": state.profile?.name ?? "" };
  if (state.device) {
    vars["device.serial"] = state.device.facts.serial;
    vars["device.model"] = state.device.facts.model;
    vars["device.manufacturer"] = state.device.facts.manufacturer;
  }
  for (const f of state.profile?.fields ?? []) vars[`field.${f.id}`] = (state.fields[f.id] ?? "").trim();
  return vars;
}

/** Where the operator is in the flow. Drives the progress track and the main button. */
export function computePhase(state: State): Phase {
  const { profile } = state;
  if (!profile) return "profile";
  if (state.running) return "running";
  if (requiredAppIds(profile).some((id) => !state.apps.has(id))) return "apps";
  if (!state.device) return "device";
  if (!state.checks || state.checks.some((c) => c.status === "fail")) return "checks";
  if (state.outcome === "provisioned") return "done";
  if (state.outcome === "failed") return "failed";
  if (Object.keys(fieldProblems(profile, state.fields)).length) return "fields";
  return "ready";
}

const ORDER: Phase[] = ["profile", "apps", "device", "checks", "fields", "ready", "running", "done"];

/** Progress track items, each done / current / upcoming. */
export function trackItems(phase: Phase): { key: "profile" | "apps" | "device" | "checks" | "run"; state: "done" | "now" | "todo" }[] {
  const at = ORDER.indexOf(phase === "failed" ? "running" : phase);
  const keys = [["profile", 0], ["apps", 1], ["device", 2], ["checks", 3], ["run", 5]] as const;
  return keys.map(([key, idx]) => {
    const runDone = key === "run" && phase === "done";
    const isNow = key === "run" ? at >= 4 && phase !== "done" : at === idx;
    return { key, state: runDone || (key !== "run" && at > idx) ? "done" : isNow ? "now" : "todo" };
  });
}
