import type { AppPackage } from "../apk/apk";
import type { Device } from "../adb/device";
import { render, shQuote, type TemplateVars } from "../profile/template";
import type { Profile, Step } from "../profile/types";

export interface StepContext {
  device: Device;
  profile: Profile;
  /** Loaded app files, keyed by the app id in the profile. */
  apps: ReadonlyMap<string, AppPackage>;
  vars: TemplateVars;
  log: (message: string, level?: "info" | "ok" | "warn" | "err") => void;
  progress: (fraction: number) => void;
}

/** What the operator sees for a step, before and while it runs. */
export function describeStep(step: Step, profile: Profile): string {
  if (step.label) return step.label;
  const app = (id: string) => profile.apps.find((a) => a.id === id);
  const appName = (id: string) => app(id)?.label ?? app(id)?.packageName ?? id;
  switch (step.type) {
    case "install": return `Install ${appName(step.app)}`;
    case "setDeviceOwner": return `Make ${appName(profile.deviceOwner?.app ?? "")} the Device Owner`;
    case "verifyDeviceOwner": return "Verify Device Owner";
    case "grantPermissions": return `Grant ${step.permissions.length} permission${step.permissions.length > 1 ? "s" : ""} to ${appName(step.app)}`;
    case "setting": return `Set ${step.key}`;
    case "pushFile": return `Copy file to ${step.path}`;
    case "broadcast": return "Send configuration to the app";
    case "disablePackages": return `Disable ${step.packages.length} app${step.packages.length > 1 ? "s" : ""}`;
    case "shell": return step.label ?? "Run command";
    case "launch": return `Open ${appName(step.app)}`;
    case "reboot": return "Restart the device";
  }
}

/** The exact device commands a step will run, shown in the plan preview. */
export function previewStep(step: Step, profile: Profile, allVars: TemplateVars): string[] {
  // Values not filled in yet stay visible as {{placeholders}}.
  const vars = Object.fromEntries(Object.entries(allVars).filter(([, v]) => v !== ""));
  const t = (s: string) => safeRender(s, vars);
  const pkg = (id: string) => profile.apps.find((a) => a.id === id)?.packageName ?? id;
  switch (step.type) {
    case "install": return [`pm install${step.grantPermissions ? " -g" : ""} -r <${pkg(step.app)}>`];
    case "setDeviceOwner": return [`dpm set-device-owner ${ownerComponent(profile)}`];
    case "verifyDeviceOwner": return ["dumpsys device_policy"];
    case "grantPermissions": return step.permissions.map((p) => `pm grant ${pkg(step.app)} ${p}`);
    case "setting": return [`settings put ${step.namespace} ${step.key} ${t(step.value)}`];
    case "pushFile": return [`push → ${t(step.path)}`];
    case "broadcast": return [broadcastCommand(step, (v) => safeRender(v, vars), (v) => v)];
    case "disablePackages": return step.packages.map((p) => `pm disable-user --user 0 ${p}`);
    case "shell": return [t(step.command)];
    case "launch": return [`launch ${pkg(step.app)}`];
    case "reboot": return ["reboot"];
  }
}

function safeRender(text: string, vars: TemplateVars): string {
  return text.replace(/\{\{\s*([a-zA-Z]+\.[a-zA-Z0-9_-]+)\s*\}\}/g, (m, key: string) => vars[key] ?? m);
}

export function ownerComponent(profile: Profile): string {
  const owner = profile.deviceOwner;
  if (!owner) throw new Error("This profile has no deviceOwner.");
  const pkg = profile.apps.find((a) => a.id === owner.app)?.packageName;
  if (!pkg) throw new Error(`deviceOwner.app "${owner.app}" is not in apps.`);
  return `${pkg}/${owner.receiver}`;
}

function broadcastCommand(
  step: Extract<Step, { type: "broadcast" }>,
  fill: (value: string) => string,
  q: (value: string) => string,
): string {
  const parts = ["am broadcast"];
  if (step.action) parts.push("-a", q(step.action));
  if (step.component) parts.push("-n", q(step.component));
  for (const [key, value] of Object.entries(step.extras ?? {})) {
    if (typeof value === "boolean") parts.push("--ez", q(key), String(value));
    else if (typeof value === "number") parts.push(Number.isInteger(value) ? "--ei" : "--ef", q(key), String(value));
    else parts.push("--es", q(key), q(fill(value)));
  }
  return parts.join(" ");
}

/** Runs one step. Throws with a message the operator can act on. */
export async function runStep(step: Step, ctx: StepContext): Promise<string | void> {
  const { device, profile, vars } = ctx;
  const pkgOf = (id: string) => {
    const spec = profile.apps.find((a) => a.id === id);
    if (!spec) throw new Error(`App "${id}" is not in the profile.`);
    return spec.packageName;
  };

  switch (step.type) {
    case "install": {
      const app = ctx.apps.get(step.app);
      if (!app) throw new Error(`Load the file for ${pkgOf(step.app)} first.`);
      await device.install(app.parts, { grantPermissions: step.grantPermissions ?? true, onProgress: ctx.progress });
      return `${app.packageName} ${app.versionName}`;
    }

    case "setDeviceOwner": {
      const component = ownerComponent(profile);
      const ownerPkg = component.split("/")[0];
      const current = await device.deviceOwnerPackage();
      if (current === ownerPkg) return "already set";
      if (current) throw new Error(`${current} is already the Device Owner. It must be removed first.`);
      const { output, exitCode } = await device.shell(`dpm set-device-owner ${shQuote(component)}`);
      if (exitCode !== 0 || !/Success|Active admin/i.test(output)) throw new Error(explainDpm(output));
      return "set";
    }

    case "verifyDeviceOwner": {
      const expected = ownerComponent(profile).split("/")[0];
      const current = await device.deviceOwnerPackage();
      if (current !== expected) throw new Error(`Device Owner is ${current ?? "not set"}, expected ${expected}.`);
      return current;
    }

    case "grantPermissions": {
      const pkg = pkgOf(step.app);
      for (const permission of step.permissions) await device.run(`pm grant ${shQuote(pkg)} ${shQuote(permission)}`);
      return `${step.permissions.length} granted`;
    }

    case "setting": {
      const value = render(step.value, vars);
      await device.run(`settings put ${step.namespace} ${shQuote(step.key)} ${shQuote(value)}`);
      return value;
    }

    case "pushFile": {
      const path = render(step.path, vars);
      await device.pushText(path, render(step.content, vars));
      return path;
    }

    case "broadcast": {
      const output = await device.run(broadcastCommand(step, (v) => render(v, vars), shQuote));
      const result = output.match(/result=(-?\d+)/)?.[1];
      // Activity.RESULT_OK is -1: the app's receiver accepted the configuration.
      return result === "-1" ? "accepted" : result !== undefined ? `result ${result}` : undefined;
    }

    case "disablePackages": {
      let disabled = 0;
      for (const pkg of step.packages) {
        if (!(await device.isInstalled(pkg))) { ctx.log(`${pkg} is not installed, skipped.`, "warn"); continue; }
        await device.run(`pm disable-user --user 0 ${shQuote(pkg)}`);
        disabled++;
      }
      return `${disabled} disabled`;
    }

    case "shell": {
      const command = render(step.command, vars, shQuote);
      const { output, exitCode } = await device.shell(command);
      if (output) ctx.log(output);
      if (exitCode !== 0 && !step.allowFailure) throw new Error(`Exited with code ${exitCode}.`);
      return exitCode === 0 ? undefined : `exit code ${exitCode}, allowed`;
    }

    case "launch":
      await device.launch(pkgOf(step.app));
      return;

    case "reboot":
      await device.reboot();
      return;
  }
}

export function explainDpm(output: string): string {
  if (/accounts on the device/i.test(output)) return "The device still has accounts. Remove them or factory reset, then try again.";
  if (/already (provisioned|set)|device owner is already set/i.test(output)) return "A Device Owner is already set on this device.";
  if (/several users|multiple users/i.test(output)) return "The device has more than one user. Remove the extra users first.";
  if (/Unknown admin|not found|does not exist/i.test(output)) return "The admin receiver wasn't found in the app. Check deviceOwner.receiver in the profile.";
  return output || "dpm set-device-owner failed.";
}
