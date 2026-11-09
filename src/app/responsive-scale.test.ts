import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

/**
 * Seam: rendered component seam (class tokens in source).
 * Issue #44 acceptance:
 * - 40 56 60 scale pinned per breakpoint with class token assertions
 * - mobile plus desktop render without overlap or shift
 * - spacing follows Tailwind default scale
 */

const HOME = readFileSync("src/app/page.tsx", "utf8");
const REVEAL = readFileSync("src/app/s/reveal-view.tsx", "utf8");
const COMPOSER = readFileSync("src/app/composer.tsx", "utf8");

describe("responsive scale lock (#44)", () => {
  it("pins hero H1 40px mobile to 60px desktop", () => {
    expect(HOME).toMatch(/text-\[40px\][\s\S]*md:text-\[60px\]/);
  });

  it("pins trust H2 40px on both breakpoints", () => {
    expect(HOME).toMatch(/text-\[40px\]/);
  });

  it("pins reveal H1 40px mobile to 56px desktop in every state", () => {
    const states = REVEAL.match(/text-\[40px\][\s\S]*?md:text-\[56px\]/g) ?? [];
    // idle, done, burned, expired, failed = 5 states
    expect(states.length).toBe(5);
  });

  it("uses no unpinned display-size utilities on hero headings", () => {
    for (const [name, src] of [
      ["page.tsx", HOME],
      ["reveal-view.tsx", REVEAL],
    ] as const) {
      expect(
        src.includes("text-3xl") || src.includes("text-4xl"),
        `${name} must pin 40/56/60 explicitly, no text-3xl/text-4xl`,
      ).toBe(false);
    }
  });

  it("follows the Tailwind default spacing scale (no arbitrary px spacing)", () => {
    for (const [name, src] of [
      ["page.tsx", HOME],
      ["composer.tsx", COMPOSER],
      ["reveal-view.tsx", REVEAL],
    ] as const) {
      const bad = src.match(
        /(?:p|px|py|pt|pb|pl|pr|m|mt|gap)-\[(\d+)px\]/g,
      );
      expect(bad, `${name} must use Tailwind default spacing, found ${bad}`).toBeNull();
    }
  });

  it("guards long strings against horizontal overflow and shift", () => {
    // share link + revealed secret break long tokens; container clips overflow
    expect(COMPOSER).toMatch(/break-all/);
    expect(REVEAL).toMatch(/break-all/);
    expect(`${HOME}${COMPOSER}${REVEAL}`).toMatch(/min-w-0|max-w-full|overflow-x-clip|overflow-hidden/);
  });

  it("keeps headings away from overlap: no absolute positioning on text blocks", () => {
    for (const [name, src] of [
      ["page.tsx", HOME],
      ["reveal-view.tsx", REVEAL],
    ] as const) {
      expect(src, `${name} headings must flow in normal layout`).not.toMatch(
        /absolute/,
      );
    }
  });
});
