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

  it("self-hosts the contract fonts through next/font (#70)", () => {
    const layout = readFileSync("src/app/layout.tsx", "utf8");
    expect(layout).toMatch(
      /import\s*\{[^}]*\bInter\b[^}]*\}\s*from\s*["']next\/font\/google["']/,
    );
    expect(layout).toMatch(
      /import\s*\{[^}]*\bIBM_Plex_Mono\b[^}]*\}\s*from\s*["']next\/font\/google["']/,
    );
    expect(layout).not.toMatch(/fonts\.(googleapis|gstatic)\.com/);
  });

  it("points the token CSS vars at the self-hosted fonts (#70)", () => {
    const layout = readFileSync("src/app/layout.tsx", "utf8");
    expect(layout).toMatch(/variable:\s*["']--tempel-sans["']/);
    expect(layout).toMatch(/variable:\s*["']--tempel-mono["']/);
    // font-mono must resolve --tempel-mono where it is used, not at :root.
    const css = readFileSync("src/app/globals.css", "utf8");
    expect(css).toMatch(/@theme\s+inline\s*\{/);
  });

  it("wires the mono utility to the token stack through the theme layer", () => {
    const css = readFileSync("src/app/globals.css", "utf8");
    const theme = css.match(/@theme[^{]*\{[^}]*\}/)?.[0] ?? "";
    expect(theme, "globals.css must declare an @theme block").not.toBe("");
    expect(theme).toMatch(/--font-mono:\s*var\(--tempel-mono\)/);
    expect(css.toLowerCase()).toContain(
      `--tempel-mono: ${tokens.type.mono.toLowerCase()}`,
    );
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
