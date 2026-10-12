import { Adb, AdbDaemonTransport } from "@yume-chan/adb";
import AdbWebCredentialStore from "@yume-chan/adb-credential-web";
import { AdbDaemonWebUsbDeviceManager, type AdbDaemonWebUsbDevice } from "@yume-chan/adb-daemon-webusb";
import { Device } from "./device";

const manager = AdbDaemonWebUsbDeviceManager.BROWSER;
const credentialStore = new AdbWebCredentialStore("Ownerkit");

export const webUsbAvailable = (): boolean => manager !== undefined;

export class ConnectError extends Error {
  constructor(readonly reason: "busy" | "cancelled" | "failed", message: string) {
    super(message);
  }
}

/** Units this browser already has permission for. They connect without the picker. */
export async function pairedDevices(): Promise<AdbDaemonWebUsbDevice[]> {
  return manager ? manager.getDevices().catch(() => []) : [];
}

/** Shows the browser's USB picker, filtered to devices with an ADB interface. */
export async function pickDevice(): Promise<AdbDaemonWebUsbDevice> {
  if (!manager) throw new ConnectError("failed", "WebUSB is not available in this browser.");
  const device = await manager.requestDevice().catch(() => undefined);
  if (!device) throw new ConnectError("cancelled", "No device was chosen.");
  return device;
}

/** Opens the USB connection and completes ADB authentication (the "Allow USB debugging" prompt). */
export async function connect(usbDevice: AdbDaemonWebUsbDevice, onDisconnect: () => void): Promise<Device> {
  try {
    const connection = await usbDevice.connect();
    const transport = await AdbDaemonTransport.authenticate({ serial: usbDevice.serial, connection, credentialStore });
    transport.disconnected.then(onDisconnect, onDisconnect);
    return await Device.open(new Adb(transport), usbDevice.serial);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    if (/claim|busy|in use|in used|another program|access denied/i.test(message)) {
      throw new ConnectError("busy", message);
    }
    throw new ConnectError("failed", message);
  }
}
