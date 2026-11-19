import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { tokens } from "./tokens";

/**
 * Seam: rendered component seam (class tokens in source), same seam as
 * responsive-scale.test.ts. Issue #62 acceptance:
 * - off-scale size utilities fail across every UI surface
 * - remapped sizes pinned per surface: 14→13, 16→15, 22→17
 * - responsive 40/56/60 lock stays with responsive-scale.test.ts
 */

const SURFACES = readdirSync("src", { recursive: true })
  .map((p) => `src/${String(p).replaceAll("\\", "/")}`)
  .filter(
    (p) => /\.(tsx|jsx|ts)$/.test(p) && !/\.test\.(tsx|jsx|ts)$/.test(p),
  )
  .map((p) => [p, readFileSync(p, "utf8")] as const);

const COLOR_VARS = new Set(
  Object.keys(tokens.palette).map((name) => `var(--tempel-${name})`),
);

const NAMED_SIZE = /\btext-(?:xs|sm|base|lg|xl|[2-9]xl)\b/;
const ARBITRARY_TEXT = /\btext-\[([^\]]+)\]/g;

describe("size scale lock (#62)", () => {
  it("covers every UI surface", () => {
    expect(SURFACES.length).toBeGreaterThanOrEqual(5);
    expect(SURFACES.map(([p]) => p)).toEqual(
      expect.arrayContaining([
        "src/app/layout.tsx",
        "src/app/page.tsx",
        "src/app/composer.tsx",
        "src/app/s/reveal-view.tsx",
        "src/app/s/[id]/page.tsx",
      ]),
    );
  });

  it("bans named off-scale size utilities on every surface", () => {
    for (const [path, src] of SURFACES) {
      const hit = src.match(NAMED_SIZE);
      expect(
        hit,
        `${path} must use pinned scale sizes, found ${hit?.[0]}`,
      ).toBeNull();
    }
  });

  it("bans arbitrary text sizes outside the canvas scale on every surface", () => {
    const allowed = new Set(tokens.size.map((n) => `${n}px`));
    for (const [path, src] of SURFACES) {
      for (const [, value] of src.matchAll(ARBITRARY_TEXT)) {
        if (COLOR_VARS.has(value)) continue; // palette color token, not a size
        expect(
          allowed.has(value),
          `${path} uses off-scale text-[${value}], scale is ${tokens.size.join("/")}`,
        ).toBe(true);
      }
    }
  });

  it("pins Secret input, share link, and copy action at 13px", () => {
    const composer = readFileSync("src/app/composer.tsx", "utf8");
    const textarea = composer.match(/<textarea[\s\S]*?\/>/)?.[0] ?? "";
    expect(textarea, "Secret input must pin text-[13px]").toContain(
      "text-[13px]",
    );
    expect(composer).toMatch(/break-all font-mono text-\[13px\][^>]*>\{link\}/);
    expect(composer).toMatch(/text-\[13px\][^>]*>\s*\{copied \?/);
  });

  it("pins revealed Secret panel text at 15px and local-decrypt note at 13px", () => {
    const reveal = readFileSync("src/app/s/reveal-view.tsx", "utf8");
    expect(reveal).toMatch(
      /break-all font-mono text-\[15px\][^>]*>\s*\{state\.secret\}/,
    );
    expect(reveal).toMatch(/text-\[13px\][^>]*>\s*Didekripsi lokal/);
  });

  it("pins the brand wordmark at 17px on both routes", () => {
    for (const path of ["src/app/page.tsx", "src/app/s/[id]/page.tsx"]) {
      const src = readFileSync(path, "utf8");
      expect(src, `${path} wordmark must be text-[17px]`).toMatch(
        /text-\[17px\][^>]*>Tempel</,
      );
      expect(src).not.toContain("text-[22px]");
    }
  });
});
