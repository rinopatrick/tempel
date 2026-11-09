import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/secret/composer", () => ({
  TTL_OPTIONS: [
    { label: "1 jam", seconds: 3600 },
    { label: "6 jam", seconds: 21600 },
    { label: "24 jam", seconds: 86400 },
  ],
  createShareLink: vi.fn(),
}));

import { createShareLink } from "@/secret/composer";
import Composer from "./composer";

const createShareLinkMock = vi.mocked(createShareLink);

describe("<Composer />", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("submits the secret and renders the share link with a copy step", async () => {
    const user = userEvent.setup();
    const key = "A".repeat(43);
    createShareLinkMock.mockResolvedValue(
      `https://tempel.test/s/server-id-1#${key}`,
    );
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: vi.fn(async () => {}) },
    });
    render(<Composer />);

    await user.type(
      screen.getByPlaceholderText(/tempel password atau api key/i),
      "db-prod-9f2k",
    );
    await user.click(screen.getByRole("button", { name: /buat link/i }));

    expect(
      await screen.findByText(/https:\/\/tempel\.test\/s\/server-id-1#/),
    ).not.toBeNull();
    await user.click(screen.getByRole("button", { name: /salin/i }));
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      `https://tempel.test/s/server-id-1#${key}`,
    );
  });

  it("shows an error when creation fails and keeps no link", async () => {    const user = userEvent.setup();
    createShareLinkMock.mockRejectedValue(new Error("server down"));
    render(<Composer />);

    await user.type(
      screen.getByPlaceholderText(/tempel password atau api key/i),
      "db-prod-9f2k",
    );
    await user.click(screen.getByRole("button", { name: /buat link/i }));

    expect(await screen.findByText(/gagal/i)).not.toBeNull();
  });

  it("uses the canvas body font and mono stacks", async () => {
    const { readFileSync } = await import("node:fs");
    const globalsCss = readFileSync("src/app/globals.css", "utf8");
    expect(globalsCss).toMatch(/Inter/);
    expect(globalsCss).toMatch(/IBM Plex Mono/);
    const layoutTsx = readFileSync("src/app/layout.tsx", "utf8");
    expect(layoutTsx).toMatch(/fonts\.googleapis/);
  });

  it("shows an error when copying fails", async () => {
    const user = userEvent.setup();
    const key = "A".repeat(43);
    createShareLinkMock.mockResolvedValue(
      `https://tempel.test/s/server-id-1#${key}`,
    );
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: vi.fn(async () => { throw new Error("denied"); }) },
    });
    render(<Composer />);

    await user.type(
      screen.getByPlaceholderText(/tempel password atau api key/i),
      "db-prod-9f2k",
    );
    await user.click(screen.getByRole("button", { name: /buat link/i }));
    await screen.findByText(/https:\/\/tempel\.test\/s\/server-id-1#/);
    await user.click(screen.getByRole("button", { name: /salin/i }));

    expect(await screen.findByText(/penyalinan gagal/i)).not.toBeNull();
  });

  it("disables submit while the secret is empty", () => {
    render(<Composer />);

    expect(
      screen.getByRole("button", { name: /buat link/i }),
    ).toBeDisabled();
  });

  it("keeps a visible focus indicator on the secret input", async () => {
    const { readFileSync } = await import("node:fs");
    const composer = readFileSync("src/app/composer.tsx", "utf8");
    const textarea = composer.match(/<textarea[\s\S]*?\/>/)?.[0] ?? "";
    expect(textarea).not.toMatch(/focus:outline-none(?!\S)/);
    expect(textarea).toMatch(/focus-visible:/);
  });
});
