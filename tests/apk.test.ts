import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { inspectAppFile, sha256Hex } from "../src/apk/apk";
import { parseAxml } from "../src/apk/axml";

const here = dirname(fileURLToPath(import.meta.url));
const manifest = new Uint8Array(readFileSync(join(here, "fixtures/appium-settings.AndroidManifest.xml.bin")));

const fileOf = (bytes: Uint8Array, name: string) => new File([bytes as BlobPart], name);
const apkWith = (m: Uint8Array) => zipSync({ "AndroidManifest.xml": m, "classes.dex": new Uint8Array([1, 2, 3]) });

describe("parseAxml", () => {
  it("reads elements and resolves framework attribute names", () => {
    const els = parseAxml(manifest);
    const root = els.find((e) => e.tag === "manifest")!;
    expect(root.attrs.package).toBe("io.appium.settings");
    expect(root.attrs.versionName).toBe("8.4.1");
    expect(root.attrs.versionCode).toBe(199);
    const services = els.filter((e) => e.tag === "service").map((e) => e.attrs.name);
    expect(services).toContain("io.appium.settings.LocationService");
  });

  it("rejects text that isn't binary XML", () => {
    expect(() => parseAxml(new TextEncoder().encode("<manifest/>"))).toThrow(/binary AndroidManifest/);
  });
});

describe("inspectAppFile", () => {
  it("reads package details from an APK", async () => {
    const pkg = await inspectAppFile(fileOf(apkWith(manifest), "settings.apk"));
    expect(pkg).toMatchObject({ packageName: "io.appium.settings", versionName: "8.4.1", versionCode: 199, testOnly: false, adminReceivers: [] });
    expect(pkg.parts).toHaveLength(1);
  });

  it("reads a split bundle and keeps every APK as a part", async () => {
    const bundle = zipSync({ "splits/base-master.apk": apkWith(manifest), "splits/base-arm64_v8a.apk": new Uint8Array([9]) });
    const pkg = await inspectAppFile(fileOf(bundle, "app.apks"));
    expect(pkg.packageName).toBe("io.appium.settings");
    expect(pkg.parts.map((p) => p.name).sort()).toEqual(["base-arm64_v8a.apk", "base-master.apk"]);
  });

  it("explains when the file is not an APK", async () => {
    await expect(inspectAppFile(fileOf(zipSync({ "readme.txt": new Uint8Array([1]) }), "x.apk"))).rejects.toThrow(/AndroidManifest/);
  });

  it("hashes files with SHA-256", async () => {
    expect(await sha256Hex(new Blob(["abc"]))).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });
});
