import { describe, expect, it } from "vitest";
import demo from "../examples/profiles/testdpc-demo.json";
import kiosk from "../examples/profiles/kiosk-app.json";
import { placeholders, render, shQuote } from "../src/profile/template";
import { validateProfile } from "../src/profile/validate";

const base = () => ({
  schemaVersion: 1,
  name: "Test",
  apps: [{ id: "app", packageName: "com.example.app" }],
  deviceOwner: { app: "app", receiver: ".Admin" },
  steps: [{ type: "install", app: "app" }, { type: "setDeviceOwner" }],
});

describe("validateProfile", () => {
  it("accepts the bundled examples", () => {
    expect(validateProfile(demo).issues).toEqual([]);
    expect(validateProfile(kiosk).issues).toEqual([]);
  });

  it("returns a typed profile when valid", () => {
    expect(validateProfile(base()).profile?.name).toBe("Test");
  });

  it.each([
    ["unknown step type", (p: any) => (p.steps = [{ type: "format" }]), "steps[0].type"],
    ["step referencing a missing app", (p: any) => (p.steps = [{ type: "install", app: "nope" }]), "steps[0].app"],
    ["owner app not in apps", (p: any) => (p.deviceOwner.app = "nope"), "deviceOwner.app"],
    ["bad package name", (p: any) => (p.apps[0].packageName = "not a package"), "apps[0].packageName"],
    ["http download", (p: any) => (p.apps[0].url = "http://example.com/a.apk"), "apps[0].url"],
    ["shell step without a label", (p: any) => (p.steps = [{ type: "shell", command: "id" }]), "steps[0].label"],
    ["unknown placeholder", (p: any) => (p.steps = [{ type: "shell", label: "x", command: "echo {{field.missing}}" }]), "steps[0].command"],
    ["bad accent colour", (p: any) => (p.branding = { accent: "blue" }), "branding.accent"],
    ["owner step without deviceOwner", (p: any) => delete p.deviceOwner, "steps[1]"],
    ["invalid field pattern", (p: any) => (p.fields = [{ id: "f", label: "F", pattern: "(" }]), "fields[0].pattern"],
  ])("reports %s", (_, mutate, path) => {
    const p = base();
    mutate(p);
    const { profile, issues } = validateProfile(p);
    expect(profile).toBeUndefined();
    expect(issues.map((i) => i.path)).toContain(path);
  });

  it("rejects non-objects", () => {
    expect(validateProfile([]).issues[0].message).toMatch(/JSON object/);
  });
});

describe("templates", () => {
  it("fills placeholders and lists them", () => {
    expect(render("Site {{field.site}} on {{ device.serial }}", { "field.site": "A1", "device.serial": "XYZ" })).toBe("Site A1 on XYZ");
    expect(placeholders("{{field.a}} and {{device.model}}")).toEqual(["field.a", "device.model"]);
  });

  it("throws on unknown placeholders so typos never reach a device", () => {
    expect(() => render("{{field.nope}}", {})).toThrow(/Unknown placeholder/);
  });

  it("quotes values for the shell, including single quotes", () => {
    expect(shQuote("it's; rm -rf /")).toBe(`'it'\\''s; rm -rf /'`);
    expect(render("echo {{field.x}}", { "field.x": "$(reboot)" }, shQuote)).toBe("echo '$(reboot)'");
  });
});
