import { unzipSync } from "fflate";
import { parseAxml } from "./axml";

/** One installable file: a plain APK, or the APKs inside a split bundle (.apks). */
export interface ApkPart {
  name: string;
  blob: Blob;
}

export interface AppPackage {
  fileName: string;
  packageName: string;
  versionName: string;
  versionCode: number | null;
  minSdk: number | null;
  testOnly: boolean;
  /** Fully qualified classes of receivers protected by BIND_DEVICE_ADMIN. */
  adminReceivers: string[];
  parts: ApkPart[];
  size: number;
}

const BIND_DEVICE_ADMIN = "android.permission.BIND_DEVICE_ADMIN";

function readManifest(apkBytes: Uint8Array) {
  const files = unzipSync(apkBytes, { filter: (f) => f.name === "AndroidManifest.xml" });
  const manifest = files["AndroidManifest.xml"];
  if (!manifest) throw new Error("This file has no AndroidManifest.xml. Is it an APK?");
  const elements = parseAxml(manifest);
  const find = (tag: string) => elements.find((e) => e.tag === tag)?.attrs ?? {};

  const pkg = String(find("manifest").package ?? "");
  if (!pkg) throw new Error("The APK manifest has no package name.");
  const qualify = (name: unknown) => {
    const n = String(name ?? "");
    return n.startsWith(".") ? pkg + n : n.includes(".") ? n : `${pkg}.${n}`;
  };
  const num = (v: unknown) => (typeof v === "number" ? v : v != null && v !== "" ? Number(v) : null);

  return {
    packageName: pkg,
    versionName: String(find("manifest").versionName ?? "unknown"),
    versionCode: num(find("manifest").versionCode),
    minSdk: num(find("uses-sdk").minSdkVersion),
    testOnly: find("application").testOnly === true,
    adminReceivers: elements
      .filter((e) => e.tag === "receiver" && e.attrs.permission === BIND_DEVICE_ADMIN)
      .map((e) => qualify(e.attrs.name)),
  };
}

/** Reads package details from an .apk, or from base.apk inside an .apks split bundle. */
export async function inspectAppFile(file: Blob & { name: string }): Promise<AppPackage> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const isBundle = /\.apks$/i.test(file.name);

  if (!isBundle) {
    return { fileName: file.name, ...readManifest(bytes), parts: [{ name: "base.apk", blob: file }], size: file.size };
  }

  const entries = unzipSync(bytes, { filter: (f) => /\.apk$/i.test(f.name) });
  const names = Object.keys(entries);
  const baseName = names.find((n) => /(^|\/)base(-master)?\.apk$/i.test(n)) ?? names.find((n) => !/split/i.test(n));
  if (!baseName) throw new Error("This .apks bundle has no base APK.");

  const parts: ApkPart[] = names.map((n) => ({
    name: n.split("/").pop() ?? n,
    blob: new Blob([entries[n] as BlobPart], { type: "application/vnd.android.package-archive" }),
  }));
  return { fileName: file.name, ...readManifest(entries[baseName]), parts, size: file.size };
}

export async function sha256Hex(blob: Blob): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
