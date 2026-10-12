/**
 * Minimal reader for Android binary XML (AXML), the format of AndroidManifest.xml inside an APK.
 * It extracts elements and their attributes; it does not rebuild the XML tree or resolve resources.
 */

export interface AxmlElement {
  tag: string;
  attrs: Record<string, string | number | boolean>;
}

const CHUNK_XML = 0x0003;
const CHUNK_STRING_POOL = 0x0001;
const CHUNK_RESOURCE_MAP = 0x0180;
const CHUNK_START_ELEMENT = 0x0102;
const UTF8_FLAG = 0x100;
const NO_INDEX = 0xffffffff;
const TYPE_STRING = 0x03;
const TYPE_BOOLEAN = 0x12;

/** Android framework attribute IDs, so obfuscated or stripped attribute names still resolve. */
const ANDROID_ATTRS: Record<number, string> = {
  0x01010003: "name",
  0x01010006: "permission",
  0x01010010: "exported",
  0x0101021b: "versionCode",
  0x0101021c: "versionName",
  0x0101020c: "minSdkVersion",
  0x01010270: "targetSdkVersion",
  0x01010272: "testOnly",
};

function readStringPool(view: DataView, offset: number): string[] {
  const count = view.getUint32(offset + 8, true);
  const flags = view.getUint32(offset + 16, true);
  const stringsStart = view.getUint32(offset + 20, true);
  const utf8 = (flags & UTF8_FLAG) !== 0;
  const decoder = new TextDecoder(utf8 ? "utf-8" : "utf-16le");
  const base = offset + stringsStart;
  const out: string[] = new Array(count);

  for (let i = 0; i < count; i++) {
    let p = base + view.getUint32(offset + 28 + i * 4, true);
    if (utf8) {
      // UTF-16 length (skipped), then UTF-8 byte length; each is 1 or 2 bytes.
      if (view.getUint8(p++) & 0x80) p++;
      let len = view.getUint8(p++);
      if (len & 0x80) len = ((len & 0x7f) << 8) | view.getUint8(p++);
      out[i] = decoder.decode(new Uint8Array(view.buffer, view.byteOffset + p, len));
    } else {
      let len = view.getUint16(p, true);
      p += 2;
      if (len & 0x8000) {
        len = ((len & 0x7fff) << 16) | view.getUint16(p, true);
        p += 2;
      }
      out[i] = decoder.decode(new Uint8Array(view.buffer, view.byteOffset + p, len * 2));
    }
  }
  return out;
}

export function parseAxml(bytes: Uint8Array): AxmlElement[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.byteLength < 8 || view.getUint16(0, true) !== CHUNK_XML) {
    throw new Error("Not a binary AndroidManifest.xml");
  }

  let strings: string[] = [];
  const resourceIds: number[] = [];
  const elements: AxmlElement[] = [];
  let offset = view.getUint16(2, true);

  while (offset + 8 <= view.byteLength) {
    const type = view.getUint16(offset, true);
    const size = view.getUint32(offset + 4, true);
    if (size === 0) break;

    if (type === CHUNK_STRING_POOL) {
      strings = readStringPool(view, offset);
    } else if (type === CHUNK_RESOURCE_MAP) {
      const headerSize = view.getUint16(offset + 2, true);
      for (let p = offset + headerSize; p < offset + size; p += 4) resourceIds.push(view.getUint32(p, true));
    } else if (type === CHUNK_START_ELEMENT) {
      const attrStart = view.getUint16(offset + 24, true);
      const attrSize = view.getUint16(offset + 26, true);
      const attrCount = view.getUint16(offset + 28, true);
      const attrs: AxmlElement["attrs"] = {};

      for (let i = 0; i < attrCount; i++) {
        const a = offset + 16 + attrStart + i * attrSize;
        const nameIndex = view.getUint32(a + 4, true);
        const rawValue = view.getUint32(a + 8, true);
        const dataType = view.getUint8(a + 15);
        const data = view.getUint32(a + 16, true);
        const key = ANDROID_ATTRS[resourceIds[nameIndex] ?? -1] ?? strings[nameIndex] ?? `attr${i}`;
        attrs[key] =
          rawValue !== NO_INDEX ? strings[rawValue]
          : dataType === TYPE_BOOLEAN ? data !== 0
          : dataType === TYPE_STRING ? strings[data]
          : data;
      }
      elements.push({ tag: strings[view.getUint32(offset + 20, true)], attrs });
    }
    offset += size;
  }
  return elements;
}
