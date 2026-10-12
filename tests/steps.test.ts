import { describe, expect, it } from "vitest";
import type { Device, ShellResult } from "../src/adb/device";
import type { AppPackage } from "../src/apk/apk";
import type { Profile } from "../src/profile/types";
import { runSteps } from "../src/steps/engine";
import { describeStep, explainDpm, previewStep, runStep, type StepContext } from "../src/steps/steps";

/** A fake device that records commands and answers from a script. */
function fakeDevice(answers: Record<string, ShellResult> = {}) {
  const commands: string[] = [];
  let owner: string | null = null;
  const device = {
    facts: { serial: "SER1", manufacturer: "Acme", model: "K1", androidVersion: "13", sdk: 33, securityPatch: "" },
    commands,
    async shell(cmd: string): Promise<ShellResult> {
      commands.push(cmd);
      if (cmd.startsWith("dpm set-device-owner")) {
        owner = "com.example.app";
        return answers.dpm ?? { output: "Success: Device owner set", exitCode: 0 };
      }
      const hit = Object.entries(answers).find(([k]) => cmd.startsWith(k));
      return hit?.[1] ?? { output: "", exitCode: 0 };
    },
    async run(cmd: string) {
      const r = await device.shell(cmd);
      if (r.exitCode !== 0) throw new Error(r.output || `exit ${r.exitCode}`);
      return r.output;
    },
    async deviceOwnerPackage() { return owner; },
    async isInstalled(pkg: string) { return pkg !== "com.missing"; },
    installed: [] as string[],
    async install(parts: { name: string }[]) { device.installed.push(...parts.map((p) => p.name)); },
    pushed: [] as [string, string][],
    async pushText(path: string, content: string) { device.pushed.push([path, content]); },
    async launch(pkg: string) { commands.push(`launch ${pkg}`); },
    async reboot() { commands.push("reboot"); },
  };
  return device;
}

const profile: Profile = {
  schemaVersion: 1,
  name: "Test",
  apps: [{ id: "app", packageName: "com.example.app", label: "Example" }],
  deviceOwner: { app: "app", receiver: ".Admin" },
  fields: [{ id: "site", label: "Site" }],
  steps: [
    { type: "install", app: "app" },
    { type: "setDeviceOwner" },
    { type: "verifyDeviceOwner" },
    { type: "setting", namespace: "global", key: "stay_on_while_plugged_in", value: "7" },
    { type: "broadcast", component: "com.example.app/.Config", extras: { site: "{{field.site}}", count: 3, on: true } },
    { type: "shell", label: "Say hi", command: "echo {{field.site}}" },
    { type: "pushFile", path: "/sdcard/unit.txt", content: "site={{field.site}} serial={{device.serial}}" },
    { type: "disablePackages", packages: ["com.android.chrome", "com.missing"] },
    { type: "launch", app: "app" },
  ],
};

const appPkg = { packageName: "com.example.app", versionName: "1.0", parts: [{ name: "base.apk", blob: new Blob([]) }] } as unknown as AppPackage;

function ctx(device: ReturnType<typeof fakeDevice>, site = "Lobby 'A'"): Omit<StepContext, "progress"> {
  return {
    device: device as unknown as Device,
    profile,
    apps: new Map([["app", appPkg]]),
    vars: { "field.site": site, "device.serial": "SER1", "device.model": "K1", "device.manufacturer": "Acme", "profile.name": "Test" },
    log: () => {},
  };
}

describe("runSteps", () => {
  it("runs the whole plan with quoted values", async () => {
    const device = fakeDevice();
    const states: string[][] = [];
    const out = await runSteps(profile.steps, ctx(device), { onChange: (s) => states.push(s.map((x) => x.status)) });

    expect(out.ok).toBe(true);
    expect(device.installed).toEqual(["base.apk"]);
    expect(device.commands).toContain("dpm set-device-owner 'com.example.app/.Admin'");
    expect(device.commands).toContain("settings put global 'stay_on_while_plugged_in' '7'");
    expect(device.commands).toContain(`am broadcast -n 'com.example.app/.Config' --es 'site' 'Lobby '\\''A'\\''' --ei 'count' 3 --ez 'on' true`);
    expect(device.commands).toContain(`echo 'Lobby '\\''A'\\'''`);
    expect(device.commands).toContain("pm disable-user --user 0 'com.android.chrome'");
    expect(device.commands.some((c) => c.includes("com.missing"))).toBe(false);
    expect(device.pushed).toEqual([["/sdcard/unit.txt", "site=Lobby 'A' serial=SER1"]]);
    expect(states.at(-1)).toEqual(profile.steps.map(() => "done"));
  });

  it("stops at a failing step and resumes from it without repeating earlier steps", async () => {
    const failing = fakeDevice({ "settings put": { output: "Permission denial", exitCode: 1 } });
    const first = await runSteps(profile.steps, ctx(failing), { onChange: () => {} });
    expect(first.ok).toBe(false);
    expect(first.failedAt).toBe(3);
    expect(first.states[3]).toMatchObject({ status: "failed", error: "Permission denial" });

    const fixed = fakeDevice();
    const second = await runSteps(profile.steps, ctx(fixed), { startAt: 3, previous: first.states, onChange: () => {} });
    expect(second.ok).toBe(true);
    expect(fixed.installed).toEqual([]);
    expect(second.states[0].status).toBe("done");
  });

  it("explains dpm errors in plain words", () => {
    expect(explainDpm("java.lang.IllegalStateException: Not allowed to set the device owner because there are already some accounts on the device")).toMatch(/accounts/);
    expect(explainDpm("Error: Unknown admin: ComponentInfo{x/y}")).toMatch(/receiver/);
  });

  it("refuses to replace another Device Owner", async () => {
    const device = fakeDevice();
    device.deviceOwnerPackage = async () => "com.vendor.mdm";
    await expect(runStep({ type: "setDeviceOwner" }, { ...ctx(device), progress: () => {} })).rejects.toThrow(/com.vendor.mdm/);
  });
});

describe("describe and preview", () => {
  it("labels steps for operators", () => {
    expect(describeStep(profile.steps[0], profile)).toBe("Install Example");
    expect(describeStep(profile.steps[5], profile)).toBe("Say hi");
  });

  it("keeps unfilled placeholders visible in the preview", () => {
    expect(previewStep(profile.steps[5], profile, { "field.site": "" })).toEqual(["echo {{field.site}}"]);
    expect(previewStep(profile.steps[5], profile, { "field.site": "HQ" })).toEqual(["echo HQ"]);
  });
});
