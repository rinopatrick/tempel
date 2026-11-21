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

async function renderComposerWithShareLink(user: ReturnType<typeof userEvent.setup>) {
  const link = `https://tempel.test/s/server-id-1#${"A".repeat(43)}`;
  createShareLinkMock.mockResolvedValue(link);
  render(<Composer />);
  await user.type(screen.getByRole("textbox", { name: "Secret" }), "test secret");
  await user.click(screen.getByRole("button", { name: "Buat link rahasia" }));
  await screen.findByText(link);
}

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

  it("shows a create error and clears the previous link when creation fails", async () => {
    const user = userEvent.setup();
    const link = `https://tempel.test/s/server-id-1#${"A".repeat(43)}`;
    createShareLinkMock
      .mockResolvedValueOnce(link)
      .mockRejectedValueOnce(new Error("HTTP 500."));
    render(<Composer />);

    await user.type(
      screen.getByPlaceholderText(/tempel password atau api key/i),
      "db-prod-9f2k",
    );
    await user.click(screen.getByRole("button", { name: /buat link/i }));
    await screen.findByText(link);
    await user.click(screen.getByRole("button", { name: /buat link/i }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe("Gagal membuat link: HTTP 500.");
    expect(screen.queryByText(link)).toBeNull();
  });

  it("disables submit with progress text while busy", async () => {
    const user = userEvent.setup();
    let release!: (value: string) => void;
    createShareLinkMock.mockReturnValue(
      new Promise<string>((resolve) => {
        release = resolve;
      }),
    );
    render(<Composer />);

    await user.type(
      screen.getByPlaceholderText(/tempel password atau api key/i),
      "db-prod-9f2k",
    );
    await user.click(screen.getByRole("button", { name: /buat link/i }));

    const busyButton = await screen.findByRole("button", {
      name: /membuat/i,
    });
    expect((busyButton as HTMLButtonElement).disabled).toBe(true);
    release(`https://tempel.test/s/server-id-1#${"A".repeat(43)}`);
    expect(
      await screen.findByRole("button", { name: /buat link rahasia/i }),
    ).not.toBeNull();
  });

  it("keeps the earlier link and clears the old alert while a resubmit is busy", async () => {
    const user = userEvent.setup();
    const link = `https://tempel.test/s/server-id-1#${"A".repeat(43)}`;
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: vi.fn(async () => {
          throw new Error("denied");
        }),
      },
    });
    createShareLinkMock.mockResolvedValueOnce(link);
    createShareLinkMock.mockReturnValueOnce(new Promise<string>(() => {}));
    render(<Composer />);

    await user.type(
      screen.getByPlaceholderText(/tempel password atau api key/i),
      "db-prod-9f2k",
    );
    await user.click(screen.getByRole("button", { name: /buat link/i }));
    await screen.findByText(link);
    await user.click(screen.getByRole("button", { name: /salin/i }));
    expect((await screen.findByRole("alert")).textContent).toBe(
      "Penyalinan gagal. Salin link secara manual.",
    );

    await user.click(screen.getByRole("button", { name: /buat link/i }));

    expect(await screen.findByRole("button", { name: /membuat/i })).not.toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByText(link)).not.toBeNull();
  });

  it("renders the done link in mono break-all with a copy button", async () => {
    const user = userEvent.setup();
    const key = "A".repeat(43);
    const link = `https://tempel.test/s/server-id-1#${key}`;
    createShareLinkMock.mockResolvedValue(link);
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

    const done = await screen.findByText(link);
    expect(done.className).toMatch(/break-all/);
    expect(done.className).toMatch(/font-mono/);
    expect(
      screen.getByRole("button", { name: /salin link/i }),
    ).not.toBeNull();
  });

  it("shows a copy error and keeps the share link when clipboard write fails", async () => {
    const user = userEvent.setup();
    const key = "A".repeat(43);
    const link = `https://tempel.test/s/server-id-1#${key}`;
    createShareLinkMock.mockResolvedValue(link);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: vi.fn(async () => {
          throw new Error("denied");
        }),
      },
    });
    render(<Composer />);

    await user.type(
      screen.getByPlaceholderText(/tempel password atau api key/i),
      "db-prod-9f2k",
    );
    await user.click(screen.getByRole("button", { name: /buat link/i }));
    await screen.findByText(link);
    await user.click(screen.getByRole("button", { name: /salin/i }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe("Penyalinan gagal. Salin link secara manual.");
    expect(screen.getByText(link)).not.toBeNull();
  });

  it("uses the canvas body font and mono stacks", async () => {
    const { readFileSync } = await import("node:fs");
    const globalsCss = readFileSync("src/app/globals.css", "utf8");
    expect(globalsCss).toMatch(/Inter/);
    expect(globalsCss).toMatch(/IBM Plex Mono/);
    const layoutTsx = readFileSync("src/app/layout.tsx", "utf8");
    expect(layoutTsx).toMatch(/next\/font\/google/);
    expect(layoutTsx).not.toMatch(/fonts\.googleapis/);
  });

  it("returns to the copy action if another copy fails after a success", async () => {
    const user = userEvent.setup();
    const writeText = vi.spyOn(navigator.clipboard, "writeText");
    writeText
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("denied"));
    await renderComposerWithShareLink(user);

    await user.click(screen.getByRole("button", { name: "Salin link" }));
    await user.click(await screen.findByRole("button", { name: "Tersalin" }));

    expect(await screen.findByRole("alert")).not.toBeNull();
    expect(screen.getByRole("button", { name: "Salin link" })).not.toBeNull();
  });

  it("clears the copy error after a successful retry", async () => {
    const user = userEvent.setup();
    const writeText = vi.spyOn(navigator.clipboard, "writeText");
    writeText
      .mockRejectedValueOnce(new Error("denied"))
      .mockResolvedValueOnce(undefined);
    await renderComposerWithShareLink(user);

    await user.click(screen.getByRole("button", { name: "Salin link" }));
    expect(await screen.findByRole("alert")).not.toBeNull();
    await user.click(screen.getByRole("button", { name: "Salin link" }));

    expect(await screen.findByRole("button", { name: "Tersalin" })).not.toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("renders the secret input in the mono class", () => {
    render(<Composer />);
    const input = screen.getByLabelText(/^secret$/i);
    expect(input.className).toMatch(/font-mono/);
  });

  it("disables submit while the secret is empty", () => {
    render(<Composer />);

    expect(
      (screen.getByRole("button", { name: /buat link/i }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });

  it("keeps a visible focus indicator on the secret input", async () => {
    const { readFileSync } = await import("node:fs");
    const composer = readFileSync("src/app/composer.tsx", "utf8");
    const textarea = composer.match(/<textarea[\s\S]*?\/>/)?.[0] ?? "";
    expect(textarea).not.toMatch(/focus:outline-none(?!\S)/);
    expect(textarea).toMatch(/focus-visible:/);
  });
});
