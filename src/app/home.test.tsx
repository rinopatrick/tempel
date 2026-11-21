import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/secret/composer", () => ({
  TTL_OPTIONS: [
    { label: "1 jam", seconds: 3600 },
    { label: "6 jam", seconds: 21600 },
    { label: "24 jam", seconds: 86400 },
  ],
  createShareLink: vi.fn(),
}));

import Home from "./page";

/**
 * Seam: rendered home page. Spec #42 stories 1 and 3: canvas hero plus
 * composer in one view, TTL select plus burn hint visible.
 */
describe("<Home />", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders the canvas hero in tokens above the composer", () => {
    render(<Home />);
    const hero = screen.getByRole("heading", {
      level: 1,
      name: "Kirim rahasia. Link hangus sekali buka.",
    });
    expect(hero.className).toMatch(/--tempel-ink/);
    expect(hero.className).toMatch(/text-\[40px\].*md:text-\[60px\]/);
    const eyebrow = screen.getByText("ZERO-KNOWLEDGE SECRET SHARING");
    expect(eyebrow.className).toMatch(/--tempel-signal/);
    const lede = screen.getByText(/browser enkripsi sebelum kirim/i);
    expect(lede.className).toMatch(/--tempel-muted/);

    const composer = screen.getByRole("region", { name: "Composer" });
    expect(hero.parentElement).toBe(composer.parentElement);
    expect(
      hero.compareDocumentPosition(composer) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("shows the TTL select on 1 jam plus the burn hint inside the composer", () => {
    render(<Home />);
    const composer = within(screen.getByRole("region", { name: "Composer" }));
    const ttl = composer.getByLabelText("Kedaluwarsa") as HTMLSelectElement;
    expect(ttl.selectedOptions[0]?.textContent).toBe("1 jam");
    const hint = composer.getByText(/burn-after-read/);
    expect(hint.textContent).toMatch(/kedaluwarsa 1 jam/);
    expect(hint.textContent).toMatch(/buka 1x/);
    expect(hint.className).toMatch(/font-mono/);
    expect(hint.className).toMatch(/--tempel-muted/);
  });

  it("closes on the trust section on paper", () => {
    render(<Home />);
    const trust = screen.getByRole("heading", {
      level: 2,
      name: "Server tidak bisa baca rahasia.",
    });
    expect(trust.parentElement?.className).toMatch(/--tempel-paper/);
    expect(trust.className).toMatch(/--tempel-ink/);
  });
});
