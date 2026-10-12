import { describe, expect, it } from "vitest";
import { emptyForm, formToProfile, removeApp, type FormState } from "../src/profile/build";
import { validateProfile } from "../src/profile/validate";

const form = (patch: Partial<FormState>): FormState => ({ ...emptyForm(), name: "Lobby", ...patch });
const app = (packageName: string, label = "") => ({ packageName, label });
const types = (p: Record<string, unknown>) => (p.steps as { type: string }[]).map((s) => s.type);

describe("formToProfile", () => {
  it("builds the steps in the documented order and validates", () => {
    const p = formToProfile(form({
      apps: [app("com.example.launcher", "Launcher"), app("com.example.kiosk", "Kiosk")],
      ownerAppIndex: 1,
      ownerReceiver: ".admin.Receiver",
      settings: [{ namespace: "global", key: "stay_on_while_plugged_in", value: "7" }],
      permissions: [{ appIndex: 1, permissions: "android.permission.CAMERA, android.permission.RECORD_AUDIO" }],
      disabledPackages: "com.android.chrome\ncom.google.android.youtube",
    }));
    expect(types(p)).toEqual(["install", "install", "setDeviceOwner", "verifyDeviceOwner", "setting", "grantPermissions", "disablePackages", "launch"]);
    expect((p.steps as { app?: string }[]).at(-1)?.app).toBe("kiosk");
    expect(validateProfile(p).issues).toEqual([]);
  });

  it("omits owner steps and deviceOwner when no owner app is chosen", () => {
    const p = formToProfile(form({ apps: [app("com.example.kiosk", "Kiosk")], ownerAppIndex: null }));
    expect(types(p)).toEqual(["install", "launch"]);
    expect(p.deviceOwner).toBeUndefined();
    expect(validateProfile(p).issues).toEqual([]);
  });

  it("dedupes ids for apps and fields with the same label", () => {
    const p = formToProfile(form({
      apps: [app("com.example.a", "Kiosk"), app("com.example.b", "Kiosk")],
      ownerAppIndex: null,
      fields: [
        { label: "Site", required: true, pattern: "", keep: false },
        { label: "Site", required: false, pattern: "", keep: false },
      ],
    }));
    expect((p.apps as { id: string }[]).map((a) => a.id)).toEqual(["kiosk", "kiosk-2"]);
    expect((p.fields as { id: string }[]).map((f) => f.id)).toEqual(["site", "site-2"]);
    expect(validateProfile(p).issues).toEqual([]);
  });

  it("ids always valid: non-Latin and digit-leading labels", () => {
    const p = formToProfile(form({
      apps: [app("com.example.a", "日本語"), app("com.example.b", "3rd floor")],
      ownerAppIndex: null,
    }));
    expect((p.apps as { id: string }[]).map((a) => a.id)).toEqual(["item", "x3rd-floor"]);
    expect(validateProfile(p).issues).toEqual([]);
  });

  it("falls back to the last package segment when there is no label", () => {
    const p = formToProfile(form({ apps: [app("com.example.kiosk")], ownerAppIndex: null }));
    expect((p.apps as { id: string }[])[0].id).toBe("kiosk");
  });

  it("skips blank rows and keeps owner and permission references on the right app", () => {
    const p = formToProfile(form({
      apps: [app("com.example.a", "A"), app("", ""), app("com.example.c", "C")],
      ownerAppIndex: 2,
      ownerReceiver: ".Admin",
      permissions: [{ appIndex: 2, permissions: "android.permission.CAMERA" }, { appIndex: 1, permissions: "android.permission.CAMERA" }],
      settings: [{ namespace: "system", key: "", value: "" }],
    }));
    expect((p.deviceOwner as { app: string }).app).toBe("c");
    expect(types(p)).toEqual(["install", "install", "setDeviceOwner", "verifyDeviceOwner", "grantPermissions", "launch"]);
    expect((p.steps as { type: string; app?: string }[])[4].app).toBe("c");
    expect(validateProfile(p).issues).toEqual([]);
  });

  it("an empty form yields validation issues instead of throwing", () => {
    const p = formToProfile(emptyForm());
    const { profile, issues } = validateProfile(p);
    expect(profile).toBeUndefined();
    expect(issues.map((i) => i.path)).toEqual(expect.arrayContaining(["name", "steps"]));
  });

  it("lets a setting use a per-unit field placeholder", () => {
    const p = formToProfile(form({
      apps: [app("com.example.kiosk", "Kiosk")],
      ownerAppIndex: null,
      fields: [{ label: "Site", required: true, pattern: "^[A-Z]{3}$", keep: true }],
      settings: [{ namespace: "global", key: "device_name", value: "kiosk-{{field.site}}" }],
    }));
    expect(validateProfile(p).issues).toEqual([]);
    expect((p.fields as { keep?: boolean }[])[0].keep).toBe(true);
  });

  it("only writes branding and checks when something is set", () => {
    const bare = formToProfile(form({ apps: [app("com.example.k")], ownerAppIndex: null }));
    expect(bare.branding).toBeUndefined();
    expect(bare.checks).toBeUndefined();
    const set = formToProfile(form({
      apps: [app("com.example.k")], ownerAppIndex: null, title: "Acme", accent: "#1f7a5a",
      checks: { minSdk: "26", minBatteryPercent: "30", noAccounts: true, singleUser: false, noOtherDeviceOwner: false },
    }));
    expect(set.branding).toEqual({ title: "Acme", accent: "#1f7a5a" });
    expect(set.checks).toEqual({ minSdk: 26, minBatteryPercent: 30, noAccounts: true });
  });
});

describe("removeApp", () => {
  it("shifts the owner index and drops permission rows for the removed app", () => {
    const f = form({
      apps: [app("com.a", "A"), app("com.b", "B"), app("com.c", "C")],
      ownerAppIndex: 2,
      permissions: [{ appIndex: 0, permissions: "x" }, { appIndex: 1, permissions: "y" }, { appIndex: 2, permissions: "z" }],
    });
    removeApp(f, 1);
    expect(f.apps.map((a) => a.label)).toEqual(["A", "C"]);
    expect(f.ownerAppIndex).toBe(1);
    expect(f.permissions).toEqual([{ appIndex: 0, permissions: "x" }, { appIndex: 1, permissions: "z" }]);
  });
  it("clears the owner when the owner app is removed", () => {
    const f = form({ apps: [app("com.a", "A"), app("com.b", "B")], ownerAppIndex: 0 });
    removeApp(f, 0);
    expect(f.ownerAppIndex).toBeNull();
  });
});
