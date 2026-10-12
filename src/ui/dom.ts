type Child = Node | string | number | false | null | undefined | Child[];
type Props = Record<string, unknown> & { class?: string; on?: Partial<Record<keyof HTMLElementEventMap, (e: Event) => void>> };

/** Creates an element. Text children are inserted as text, never parsed as HTML. */
export function h<K extends keyof HTMLElementTagNameMap>(tag: K, props: Props | null = null, ...children: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (props) {
    for (const [key, value] of Object.entries(props)) {
      if (value === undefined || value === null || value === false) continue;
      if (key === "on") {
        for (const [event, handler] of Object.entries(value as Record<string, EventListener>)) el.addEventListener(event, handler);
      } else if (key === "class") {
        el.className = String(value);
      } else if (key === "dataset") {
        Object.assign(el.dataset, value);
      } else if (key in el && typeof value !== "string") {
        (el as unknown as Record<string, unknown>)[key] = value;
      } else {
        el.setAttribute(key, value === true ? "" : String(value));
      }
    }
  }
  append(el, children);
  return el;
}

function append(parent: Node, children: Child[]): void {
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    if (Array.isArray(child)) append(parent, child);
    else parent.appendChild(child instanceof Node ? child : document.createTextNode(String(child)));
  }
}

export function replace(target: Element, ...children: Child[]): void {
  target.replaceChildren();
  append(target, children);
}

const SVG_NS = "http://www.w3.org/2000/svg";

/** Small line icons, drawn on a 24px grid. */
const ICONS = {
  book: "M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2zM4 21V5M9 7h6M9 11h6",
  upload: "M12 15V3m0 0-4 4m4-4 4 4M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4",
  close: "M6 6l12 12M18 6 6 18",
  usb: "M12 3v14m0 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM12 8l-4 3v2M12 11l4-2V7M7 13h2v2H7zM15 5h2v2h-2z",
  check: "M5 12l5 5 9-10",
  alert: "M12 8v5m0 3v.01M10.3 4.2 2.6 18a2 2 0 0 0 1.7 3h15.4a2 2 0 0 0 1.7-3L13.7 4.2a2 2 0 0 0-3.4 0z",
  file: "M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9zM14 3v6h6",
  sound: "M11 5 6 9H3v6h3l5 4zM16 9a4 4 0 0 1 0 6M19 6a8 8 0 0 1 0 12",
  mute: "M11 5 6 9H3v6h3l5 4zM22 9l-6 6M16 9l6 6",
  layers: "M12 3 2 8l10 5 10-5zM2 13l10 5 10-5",
} as const;

export function icon(name: keyof typeof ICONS): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("class", "icon");
  const path = document.createElementNS(SVG_NS, "path");
  path.setAttribute("d", ICONS[name]);
  svg.appendChild(path);
  return svg;
}

export function formatBytes(bytes: number): string {
  return bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export function downloadText(filename: string, text: string, type = "text/plain"): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = h("a", { href: url, download: filename });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Opens a file chooser and resolves with the chosen files. */
export function chooseFiles(accept: string, multiple: boolean): Promise<File[]> {
  return new Promise((resolve) => {
    const input = h("input", { type: "file", accept, multiple });
    input.addEventListener("change", () => resolve([...(input.files ?? [])]));
    input.click();
  });
}
