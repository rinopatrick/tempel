import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { tokens } from "./tokens";

describe("token contract", () => {
  it("owns the canvas palette in one module", () => {
    expect(tokens.palette).toEqual({
      ink: "#1A1A1A",
      muted: "#525252",
      paper: "#F4F4F2",
      white: "#FFFFFF",
      signal: "#0E7A4F",
      warn: "#B25E00",
    });
  });

  it("owns the canvas type stacks in one module", () => {
    expect(tokens.type.sans).toMatch(/Inter/);
    expect(tokens.type.mono).toMatch(/IBM Plex Mono/);
  });

  it("owns the canvas size scale in one module", () => {
    expect(tokens.size).toEqual([13, 15, 17, 40, 56, 60]);
  });

  it("pins layout font links to the contract stacks", () => {
    const layout = readFileSync("src/app/layout.tsx", "utf8");
    expect(layout).toMatch(/Inter/);
    expect(layout).toMatch(/IBM[+ ]Plex[+ ]Mono/);
  });

  it("projects the palette as CSS vars with zero hardcoded hex in components", () => {
    const css = readFileSync("src/app/globals.css", "utf8");
    for (const [name, hex] of Object.entries(tokens.palette)) {
      expect(css.toLowerCase()).toContain(
        `--tempel-${name}: ${hex.toLowerCase()}`,
      );
    }
    const components = [
      "src/app/layout.tsx",
      "src/app/page.tsx",
      "src/app/composer.tsx",
      "src/app/s/reveal-view.tsx",
      "src/app/s/[id]/page.tsx",
    ];
    const hexes = [
      ...Object.values(tokens.palette),
      ...Object.values(tokens.palette).map((h) => h.toLowerCase()),
    ];
    for (const file of components) {
      const text = readFileSync(file, "utf8");
      for (const hex of hexes) {
        expect(text.includes(hex), `${file} must not hardcode ${hex}`).toBe(
          false,
        );
      }
    }
  });
});
