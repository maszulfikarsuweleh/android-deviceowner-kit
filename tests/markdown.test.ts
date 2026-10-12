import { describe, expect, it } from "vitest";
import { renderMarkdown } from "../src/ui/markdown";

const html = (md: string) => {
  const div = document.createElement("div");
  div.appendChild(renderMarkdown(md));
  return div;
};

describe("renderMarkdown", () => {
  it("renders headings, lists, notes and code", () => {
    const el = html("# Title\n\n1. One\n2. **Two**\n\n> Careful\n\n```\nadb devices\n```");
    expect(el.querySelector("h3")?.textContent).toBe("Title");
    expect(el.querySelectorAll("ol li")).toHaveLength(2);
    expect(el.querySelector("strong")?.textContent).toBe("Two");
    expect(el.querySelector(".md-note")?.textContent).toBe("Careful");
    expect(el.querySelector(".md-code code")?.textContent).toBe("adb devices");
  });

  it("never turns profile text into HTML", () => {
    const el = html('<img src=x onerror="alert(1)"> and <script>alert(2)</script>');
    expect(el.querySelector("img, script")).toBeNull();
    expect(el.textContent).toContain("<img");
  });

  it("only links to http(s) addresses", () => {
    const el = html("[ok](https://example.com) [bad](javascript:alert(1))");
    const links = [...el.querySelectorAll("a")];
    expect(links).toHaveLength(1);
    expect(links[0].getAttribute("href")).toBe("https://example.com");
    expect(links[0].rel).toContain("noopener");
  });
});
