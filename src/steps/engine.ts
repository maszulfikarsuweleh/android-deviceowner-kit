import type { Step } from "../profile/types";
import { runStep, type StepContext } from "./steps";

export type StepStatus = "pending" | "running" | "done" | "failed" | "skipped";

export interface StepState {
  status: StepStatus;
  detail?: string;
  error?: string;
  progress?: number;
  durationMs?: number;
}

export interface RunOutcome {
  ok: boolean;
  failedAt: number | null;
  states: StepState[];
}

/**
 * Runs steps in order from `startAt`. Earlier steps keep the state passed in, so a failed
 * run can resume from the step that failed without repeating the ones that worked.
 */
export async function runSteps(
  steps: Step[],
  ctx: Omit<StepContext, "progress">,
  opts: { startAt?: number; previous?: StepState[]; onChange: (states: StepState[]) => void },
): Promise<RunOutcome> {
  const startAt = opts.startAt ?? 0;
  const states: StepState[] = steps.map((_, i) =>
    i < startAt && opts.previous?.[i] ? opts.previous[i] : { status: "pending" });
  const emit = () => opts.onChange(states.map((s) => ({ ...s })));
  emit();

  for (let i = startAt; i < steps.length; i++) {
    const started = performance.now();
    states[i] = { status: "running" };
    emit();
    try {
      const detail = await runStep(steps[i], {
        ...ctx,
        progress: (fraction) => {
          states[i] = { ...states[i], progress: fraction };
          emit();
        },
      });
      states[i] = { status: "done", detail: detail ?? undefined, durationMs: performance.now() - started };
      emit();
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      states[i] = { status: "failed", error, durationMs: performance.now() - started };
      for (let j = i + 1; j < steps.length; j++) states[j] = { status: "pending" };
      emit();
      return { ok: false, failedAt: i, states };
    }
  }
  return { ok: true, failedAt: null, states };
}
