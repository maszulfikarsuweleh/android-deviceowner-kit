/**
 * A small, safe Markdown renderer for operator guides. It builds DOM nodes directly and
 * never parses HTML, so a profile can't inject markup or scripts.
 *
 * Supports: # headings, paragraphs, - and 1. lists, > notes, ``` code blocks,
 * **bold**, *italic*, `code`, and [links](https://…).
 */
export function renderMarkdown(source: string, opts: { onCopy?: (text: string) => void; copyLabel?: string } = {}): DocumentFragment {
  const frag = document.createDocumentFragment();
  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (/^```/.test(line)) {
      const code: string[] = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i])) code.push(lines[i++]);
      i++;
      frag.appendChild(codeBlock(code.join("\n"), opts));
      continue;
    }

    const heading = line.match(/^(#{1,3})\s+(.*)$/);
    if (heading) {
      const el = document.createElement(`h${heading[1].length + 2}` as "h3");
      inline(el, heading[2]);
      el.id = slug(heading[2]);
      frag.appendChild(el);
      i++;
      continue;
    }

    const list = line.match(/^\s*([-*]|\d+\.)\s+/);
    if (list) {
      const ordered = /\d/.test(list[1]);
      const el = document.createElement(ordered ? "ol" : "ul");
      while (i < lines.length && /^\s*([-*]|\d+\.)\s+/.test(lines[i])) {
        const li = document.createElement("li");
        inline(li, lines[i].replace(/^\s*([-*]|\d+\.)\s+/, ""));
        el.appendChild(li);
        i++;
      }
      frag.appendChild(el);
      continue;
    }

    if (/^>\s?/.test(line)) {
      const text: string[] = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) text.push(lines[i++].replace(/^>\s?/, ""));
      const el = document.createElement("p");
      el.className = "md-note";
      inline(el, text.join(" "));
      frag.appendChild(el);
      continue;
    }

    if (line.trim() === "") { i++; continue; }

    const para: string[] = [];
    while (i < lines.length && lines[i].trim() !== "" && !/^(#{1,3}\s|```|>|\s*([-*]|\d+\.)\s)/.test(lines[i])) para.push(lines[i++]);
    const p = document.createElement("p");
    inline(p, para.join(" "));
    frag.appendChild(p);
  }
  return frag;
}

const INLINE = /(\*\*([^*]+)\*\*|\*([^*]+)\*|_([^_]+)_|`([^`]+)`|\[([^\]]+)\]\((https?:\/\/[^)\s]+)\))/;

function inline(parent: HTMLElement, text: string): void {
  let rest = text;
  while (rest) {
    const m = rest.match(INLINE);
    if (!m || m.index === undefined) { parent.append(rest); break; }
    if (m.index > 0) parent.append(rest.slice(0, m.index));
    if (m[2] !== undefined) parent.appendChild(withText("strong", m[2]));
    else if (m[3] !== undefined || m[4] !== undefined) parent.appendChild(withText("em", m[3] ?? m[4]));
    else if (m[5] !== undefined) parent.appendChild(withText("code", m[5]));
    else {
      const a = withText("a", m[6]);
      a.href = m[7];
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      parent.appendChild(a);
    }
    rest = rest.slice(m.index + m[0].length);
  }
}

function withText<K extends keyof HTMLElementTagNameMap>(tag: K, text: string): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  el.textContent = text;
  return el;
}

function codeBlock(code: string, opts: { onCopy?: (text: string) => void; copyLabel?: string }): HTMLElement {
  const wrap = document.createElement("div");
  wrap.className = "md-code";
  wrap.appendChild(withText("code", code));
  if (opts.onCopy) {
    const btn = withText("button", opts.copyLabel ?? "Copy");
    btn.type = "button";
    btn.className = "md-copy";
    btn.addEventListener("click", () => opts.onCopy?.(code));
    wrap.appendChild(btn);
  }
  return wrap;
}

export function slug(text: string): string {
  return "g-" + text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "");
}
