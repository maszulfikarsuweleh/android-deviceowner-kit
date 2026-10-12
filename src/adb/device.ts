import type { Adb } from "@yume-chan/adb";
import { PackageManager } from "@yume-chan/android-bin";
import type { ApkPart } from "../apk/apk";
import { shQuote } from "../profile/template";

export interface DeviceFacts {
  serial: string;
  manufacturer: string;
  model: string;
  androidVersion: string;
  sdk: number;
  securityPatch: string;
}

export interface ShellResult {
  output: string;
  exitCode: number;
}

const EXIT_MARKER = "__OWNERKIT_EXIT__";

/** The ADB library declares its own (structurally equal) stream type; browser streams work as-is. */
type AdbByteStream = Parameters<PackageManager["installStream"]>[1];
const toAdbStream = (stream: ReadableStream<Uint8Array>) => stream as unknown as AdbByteStream;

/** The commands Ownerkit runs on a connected device. Every shell value is quoted by the caller or here. */
export class Device {
  constructor(readonly adb: Adb, readonly facts: DeviceFacts) {}

  static async open(adb: Adb, serial: string): Promise<Device> {
    const [manufacturer, model, androidVersion, sdk, securityPatch] = await Promise.all([
      adb.getProp("ro.product.manufacturer"),
      adb.getProp("ro.product.model"),
      adb.getProp("ro.build.version.release"),
      adb.getProp("ro.build.version.sdk"),
      adb.getProp("ro.build.version.security_patch"),
    ]);
    return new Device(adb, { serial, manufacturer, model, androidVersion, sdk: Number(sdk) || 0, securityPatch });
  }

  /** Runs a command and returns its output and exit code (works on every Android version). */
  async shell(command: string): Promise<ShellResult> {
    const raw = await this.adb.subprocess.noneProtocol.spawnWaitText(`${command} 2>&1; echo ${EXIT_MARKER}$?`);
    const text = raw.replace(/\r/g, "");
    const at = text.lastIndexOf(EXIT_MARKER);
    if (at < 0) return { output: text.trim(), exitCode: 0 };
    return { output: text.slice(0, at).trim(), exitCode: Number(text.slice(at + EXIT_MARKER.length).trim()) || 0 };
  }

  /** Like shell(), but throws with the command's own output when it fails. */
  async run(command: string): Promise<string> {
    const { output, exitCode } = await this.shell(command);
    if (exitCode !== 0) throw new Error(output || `Command failed with exit code ${exitCode}`);
    return output;
  }

  async deviceOwnerPackage(): Promise<string | null> {
    const { output } = await this.shell("dumpsys device_policy");
    return output.match(/Device Owner:[\s\S]*?package=([\w.]+)/)?.[1] ?? null;
  }

  async accountCount(): Promise<number> {
    const { output } = await this.shell("dumpsys account");
    return (output.match(/Account \{name=/g) ?? []).length;
  }

  async userCount(): Promise<number> {
    const { output } = await this.shell("pm list users");
    return (output.match(/UserInfo\{/g) ?? []).length;
  }

  async batteryPercent(): Promise<number | null> {
    const { output } = await this.shell("dumpsys battery");
    const level = output.match(/level:\s*(\d+)/)?.[1];
    return level ? Number(level) : null;
  }

  async isInstalled(packageName: string): Promise<boolean> {
    const { output } = await this.shell(`pm path ${shQuote(packageName)}`);
    return output.includes("package:");
  }

  /** Installs one APK, or several split APKs in a single session. Reports progress from 0 to 1. */
  async install(parts: ApkPart[], opts: { grantPermissions: boolean; onProgress?: (fraction: number) => void }): Promise<void> {
    const pm = new PackageManager(this.adb);
    const total = parts.reduce((n, p) => n + p.blob.size, 0) || 1;
    let sent = 0;
    const counted = (blob: Blob) => toAdbStream(blob.stream().pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, ctrl) {
        sent += chunk.byteLength;
        opts.onProgress?.(sent / total);
        ctrl.enqueue(chunk);
      },
    })));
    const options = { grantRuntimePermissions: opts.grantPermissions, replaceExisting: true };

    if (parts.length === 1) {
      await pm.installStream(parts[0].blob.size, counted(parts[0].blob), options);
      return;
    }
    const session = await pm.sessionCreate(options);
    try {
      for (const part of parts) await pm.sessionAddSplitStream(session, part.name, part.blob.size, counted(part.blob));
      await pm.sessionCommit(session);
    } catch (e) {
      await pm.sessionAbandon(session).catch(() => {});
      throw e;
    }
  }

  async pushText(path: string, content: string): Promise<void> {
    const bytes = new TextEncoder().encode(content);
    const sync = await this.adb.sync();
    try {
      await sync.write({ filename: path, file: toAdbStream(new Blob([bytes]).stream()), permission: 0o644 });
    } finally {
      await sync.dispose();
    }
  }

  async launch(packageName: string): Promise<void> {
    const resolved = await this.shell(`cmd package resolve-activity --brief -c android.intent.category.LAUNCHER ${shQuote(packageName)}`);
    const activity = resolved.output.split("\n").pop() ?? "";
    if (activity.includes("/")) await this.run(`am start -n ${shQuote(activity)}`);
    else await this.run(`monkey -p ${shQuote(packageName)} -c android.intent.category.LAUNCHER 1`);
  }

  async reboot(): Promise<void> {
    await this.adb.power.reboot().catch(() => {});
  }

  close(): Promise<void> {
    return this.adb.close();
  }
}
