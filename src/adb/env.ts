/** Works out whether this page can use WebUSB, and if not, why — in words an operator can act on. */
export type EnvProblem = "preview" | "inAppBrowser" | "ios" | "insecure" | "noWebUsb";

export interface EnvReport {
  browser: string;
  version: string;
  os: string;
  problem: EnvProblem | null;
}

export function inspectEnvironment(nav: Navigator = navigator, win: Window = window): EnvReport {
  const ua = nav.userAgent;
  const os = /Windows/.test(ua) ? "Windows"
    : /iPhone|iPad/.test(ua) ? "iOS"
    : /Mac OS X/.test(ua) ? "macOS"
    : /CrOS/.test(ua) ? "ChromeOS"
    : /Android/.test(ua) ? "Android"
    : /Linux/.test(ua) ? "Linux" : "unknown OS";
  const browser = /Edg\//.test(ua) ? "Edge" : /OPR\//.test(ua) ? "Opera" : /Firefox\//.test(ua) ? "Firefox"
    : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : "unknown browser";
  const version = ua.match(/(?:Edg|OPR|Chrome|Firefox|Version)\/(\d+)/)?.[1] ?? "";

  let framed = false;
  try { framed = win.top !== win.self; } catch { framed = true; }

  const problem: EnvProblem | null =
    framed ? "preview"
    : /FBAN|FBAV|Instagram|Line\/|WhatsApp|Telegram|MicroMessenger|GSA\//.test(ua) ? "inAppBrowser"
    : os === "iOS" ? "ios"
    : !win.isSecureContext ? "insecure"
    : !("usb" in nav) ? "noWebUsb"
    : null;

  return { browser, version, os, problem };
}

/** USB interface class/subclass/protocol that identifies the ADB interface. */
export const ADB_INTERFACE = { classCode: 0xff, subclassCode: 0x42, protocolCode: 0x01 } as const;

export type UsbDiagnosis =
  | { kind: "nothingChosen" }
  | { kind: "adbVisible"; name: string; ids: string }
  | { kind: "adbMissing"; name: string; ids: string };

/** Lists every USB device so we can tell "not seen at all" from "seen, but USB debugging is off". */
export async function diagnoseUsb(usb: USB = navigator.usb): Promise<UsbDiagnosis> {
  let device: USBDevice;
  try {
    device = await usb.requestDevice({ filters: [] });
  } catch {
    return { kind: "nothingChosen" };
  }
  const hex = (n: number) => n.toString(16).padStart(4, "0");
  const name = device.productName || "Unnamed device";
  const ids = `${hex(device.vendorId)}:${hex(device.productId)}`;
  const hasAdb = (device.configurations ?? []).some((c) => c.interfaces.some((i) => i.alternates.some((a) =>
    a.interfaceClass === ADB_INTERFACE.classCode &&
    a.interfaceSubclass === ADB_INTERFACE.subclassCode &&
    a.interfaceProtocol === ADB_INTERFACE.protocolCode)));
  return { kind: hasAdb ? "adbVisible" : "adbMissing", name, ids };
}
