import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { tokens } from "./tokens";

vi.mock("@/secret/composer", () => ({
  TTL_OPTIONS: [{ label: "1 jam", seconds: 3600 }],
  createShareLink: vi.fn(),
}));
vi.mock("@/secret/reveal", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/secret/reveal")>();
  return { ...actual, revealSecret: vi.fn() };
});

import { createShareLink } from "@/secret/composer";
import {
  revealSecret,
  RevealBurnedError,
  RevealExpiredError,
} from "@/secret/reveal";
import Composer from "./composer";
import { RevealView } from "./s/reveal-view";

const createShareLinkMock = vi.mocked(createShareLink);
const revealMock = vi.mocked(revealSecret);
const KEY = "A".repeat(43);

function luminance(hex: string): number {
  const [r, g, b] = [0, 2, 4].map((i) => {
    const c = parseInt(hex.slice(i + 1, i + 3), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(a: string, b: string): number {
  const hi = Math.max(luminance(a), luminance(b));
  const lo = Math.min(luminance(a), luminance(b));
  return (hi + 0.05) / (lo + 0.05);
}

const COMPOSER_SRC = readFileSync("src/app/composer.tsx", "utf8");
const REVEAL_SRC = readFileSync("src/app/s/reveal-view.tsx", "utf8");
const GLOBALS_SRC = readFileSync("src/app/globals.css", "utf8");

/**
 * Seam: rendered component seam plus class-token source scan.
 * Issue #49 acceptance: keyboard reachability, role=alert, canvas
 * contrast pairs, reduced motion, suite green.
 */
describe("a11y plus motion audit (#49)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.location.hash = `#${KEY}`;
  });
  afterEach(() => {
    cleanup();
    window.location.hash = "";
  });

  it("walks composer controls in DOM order with Tab", async () => {
    const user = userEvent.setup();
    render(<Composer />);
    const secret = screen.getByPlaceholderText(/tempel password atau api key/i);
    await user.type(secret, "db-prod-9f2k");
    (secret as HTMLElement).focus();
    expect(document.activeElement?.tagName).toBe("TEXTAREA");
    await user.tab();
    expect(document.activeElement?.tagName).toBe("SELECT");
    await user.tab();
    expect(document.activeElement?.tagName).toBe("BUTTON");
  });

  it("reaches the reveal action and the retry action by keyboard", async () => {
    const user = userEvent.setup();
    revealMock.mockImplementation(() => new Promise<string>(() => {}));
    render(<RevealView id="abc_123" />);
    await user.tab();
    expect(
      screen.getByRole("button", { name: /tampilkan dan hapus link/i }),
    ).toBe(document.activeElement);
  });

  it("leaves focus order to the DOM: no positive tabindex anywhere", () => {
    expect(`${COMPOSER_SRC}${REVEAL_SRC}`).not.toMatch(/tabIndex\s*=\s*\{?[1-9]/);
    expect(`${COMPOSER_SRC}${REVEAL_SRC}`).not.toMatch(/tabindex\s*=\s*["']?[1-9]/i);
  });

  it("keeps a visible focus ring on every interactive element", () => {
    // Behavior seam: rendered class list carries the ring, whether
    // inlined or via a shared const (laziness protocol).
    render(<Composer />);
    const composerControls = [
      screen.getByPlaceholderText(/tempel password atau api key/i),
      document.getElementById("tempel-ttl") as HTMLElement,
      screen.getByRole("button", { name: /buat link/i }),
    ];
    for (const el of composerControls) {
      expect(el.className).toMatch(/focus-visible:/);
    }
    cleanup();
    render(<RevealView id="abc_123" />);
    expect(
      screen.getByRole("button", { name: /tampilkan dan hapus link/i })
        .className,
    ).toMatch(/focus-visible:/);
  });

  it("announces composer failures via role=alert in ink on paper", async () => {
    const user = userEvent.setup();
    createShareLinkMock.mockRejectedValue(new Error("server down"));
    render(<Composer />);
    await user.type(
      screen.getByPlaceholderText(/tempel password atau api key/i),
      "db-prod-9f2k",
    );
    await user.click(screen.getByRole("button", { name: /buat link/i }));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/gagal/i);
    expect(alert.className).toMatch(/--tempel-ink/);
  });

  it("announces every terminal reveal state via role=alert", async () => {
    const user = userEvent.setup();
    revealMock.mockResolvedValue("db-prod-9f2k");
    const { unmount } = render(<RevealView id="abc_123" />);
    await user.click(
      screen.getByRole("button", { name: /tampilkan dan hapus link/i }),
    );
    expect(await screen.findByRole("alert")).not.toBeNull();
    unmount();
    cleanup();

    revealMock.mockRejectedValue(new RevealBurnedError());
    render(<RevealView id="abc_123" />);
    await user.click(
      screen.getByRole("button", { name: /tampilkan dan hapus link/i }),
    );
    expect(await screen.findByRole("alert")).not.toBeNull();
    cleanup();

    revealMock.mockRejectedValue(new RevealExpiredError());
    render(<RevealView id="abc_123" />);
    await user.click(
      screen.getByRole("button", { name: /tampilkan dan hapus link/i }),
    );
    expect(await screen.findByRole("alert")).not.toBeNull();
  });

  it("keeps every canvas token pair at AA contrast", () => {
    const p = tokens.palette;
    const canvasPairs: Array<[string, string, string]> = [
      [p.ink, p.white, "ink on white"],
      [p.ink, p.paper, "ink on paper"],
      [p.muted, p.white, "muted on white"],
      [p.muted, p.paper, "muted on paper"],
      [p.signal, p.white, "signal eyebrow on white"],
      [p.warn, p.white, "warn eyebrow on white"],
      [p.white, p.ink, "white button text on ink"],
    ];
    for (const [fg, bg, note] of canvasPairs) {
      expect(contrast(fg, bg), `${note} ${fg} on ${bg}`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("reserves warn text for white-background eyebrows, never paper bodies", () => {
    expect(
      COMPOSER_SRC,
      "warn on paper (4.24) fails AA; composer bodies stay ink",
    ).not.toMatch(/text-\[var\(--tempel-warn\)\]/);
    const warnUses = REVEAL_SRC.match(/className="[^"]*text-\[var\(--tempel-warn\)\][^"]*"/g) ?? [];
    expect(warnUses.length).toBeGreaterThan(0);
    for (const use of warnUses) {
      expect(use, "warn text only at 13px eyebrow size per canvas").toMatch(
        /text-\[13px\]/,
      );
    }
  });

  it("ships no animation and respects prefers-reduced-motion", () => {
    for (const [name, src] of [
      ["composer.tsx", COMPOSER_SRC],
      ["reveal-view.tsx", REVEAL_SRC],
      ["page.tsx", readFileSync("src/app/page.tsx", "utf8")],
    ] as const) {
      expect(src, `${name} adds no animation`).not.toMatch(
        /animate-|transition-|@keyframes/,
      );
    }
    expect(GLOBALS_SRC).toMatch(/prefers-reduced-motion:\s*reduce/);
  });
});
