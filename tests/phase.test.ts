import { describe, expect, it } from "vitest";
import type { Device } from "../src/adb/device";
import { computePhase, fieldProblems, trackItems } from "../src/phase";
import type { Profile } from "../src/profile/types";
import type { State } from "../src/state";

const profile: Profile = {
  schemaVersion: 1,
  name: "P",
  apps: [{ id: "a", packageName: "com.example.a" }],
  fields: [{ id: "tag", label: "Tag", required: true, pattern: "^K-\\d+$" }],
  steps: [{ type: "install", app: "a" }],
};

const state = (patch: Partial<State> = {}): State => ({
  env: null, locale: "en", profile: null, profileFile: "", profileIssues: [], apps: new Map(), appErrors: new Map(),
  fields: {}, device: null, connecting: false, checks: null, steps: [], running: false, outcome: null, failedAt: null,
  batch: false, countdown: null, sound: false, guideOpen: false, log: [], ...patch,
});

const device = {} as Device;
const apps = new Map([["a", {} as never]]);

describe("computePhase", () => {
  it("walks the operator through the flow in order", () => {
    expect(computePhase(state())).toBe("profile");
    expect(computePhase(state({ profile }))).toBe("apps");
    expect(computePhase(state({ profile, apps }))).toBe("device");
    expect(computePhase(state({ profile, apps, device }))).toBe("checks");
    expect(computePhase(state({ profile, apps, device, checks: [{ id: "accounts", status: "fail", values: {} }] }))).toBe("checks");
    expect(computePhase(state({ profile, apps, device, checks: [] }))).toBe("fields");
    expect(computePhase(state({ profile, apps, device, checks: [], fields: { tag: "K-1" } }))).toBe("ready");
    expect(computePhase(state({ profile, apps, device, checks: [], running: true }))).toBe("running");
    expect(computePhase(state({ profile, apps, device, checks: [], outcome: "failed" }))).toBe("failed");
    expect(computePhase(state({ profile, apps, device, checks: [], outcome: "provisioned" }))).toBe("done");
  });

  it("allows a warning check (device already owned by this app)", () => {
    expect(computePhase(state({ profile, apps, device, checks: [{ id: "owner", status: "warn", values: {} }], fields: { tag: "K-2" } }))).toBe("ready");
  });
});

describe("fieldProblems", () => {
  it("flags missing and malformed values", () => {
    expect(fieldProblems(profile, {})).toEqual({ tag: "required" });
    expect(fieldProblems(profile, { tag: "nope" })).toEqual({ tag: "invalid" });
    expect(fieldProblems(profile, { tag: " K-12 " })).toEqual({});
  });
});

describe("trackItems", () => {
  it("marks earlier stages done and the current one now", () => {
    expect(trackItems("device").map((i) => i.state)).toEqual(["done", "done", "now", "todo", "todo"]);
    expect(trackItems("ready").map((i) => i.state)).toEqual(["done", "done", "done", "done", "now"]);
    expect(trackItems("done").map((i) => i.state)).toEqual(["done", "done", "done", "done", "done"]);
  });
});
