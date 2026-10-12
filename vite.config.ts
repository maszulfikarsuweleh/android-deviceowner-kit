/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

// Builds one self-contained HTML file (dist/index.html) that works offline,
// opened straight from disk or hosted on any static host such as GitHub Pages.
export default defineConfig({
  base: "./",
  plugins: [viteSingleFile()],
  build: { target: "es2022", reportCompressedSize: false },
  test: { environment: "jsdom", include: ["tests/**/*.test.ts"] },
});
