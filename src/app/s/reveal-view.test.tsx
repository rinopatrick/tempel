import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FragmentKey } from "@/secret/crypto";

vi.mock("@/secret/reveal", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/secret/reveal")>();
  return { ...actual, revealSecret: vi.fn() };
});

import { revealSecret, RevealNetworkError } from "@/secret/reveal";
import { RevealView } from "./reveal-view";

const revealMock = vi.mocked(revealSecret);
const KEY = "A".repeat(43);

function setFragmentKey(key: string): void {
  window.location.hash = key === "" ? "" : `#${key}`;
}

describe("<RevealView />", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setFragmentKey(KEY);
  });

  afterEach(() => {
    cleanup();
    window.location.hash = "";
  });

  it("renders the idle reveal prompt with design tokens", async () => {
    render(<RevealView id="abc_123" />);
    expect(
      screen.getByText(/seseorang mengirim rahasia untukmu/i),
    ).not.toBeNull();
    expect(
      screen.getByRole("button", { name: /tampilkan dan hapus link/i }),
    ).not.toBeNull();
    expect(revealMock).not.toHaveBeenCalled();
  });

  it("fetches exactly once on click and shows the secret plus the burned notice", async () => {
    const user = userEvent.setup();
    revealMock.mockResolvedValue("db-prod-9f2k");
    render(<RevealView id="abc_123" />);

    await user.click(
      screen.getByRole("button", { name: /tampilkan dan hapus link/i }),
    );

    expect(
      await screen.findByText(/rahasia terbuka\. link sudah hangus/i),
    ).not.toBeNull();
    expect(await screen.findByText("db-prod-9f2k")).not.toBeNull();
    expect(await screen.findByText(/salin sekarang/i)).not.toBeNull();
    expect(revealMock).toHaveBeenCalledTimes(1);
    expect(revealMock).toHaveBeenCalledWith({
      id: "abc_123",
      key: KEY as FragmentKey,
    });
  });

  it("does not refetch when the reveal button is pressed twice", async () => {
    const user = userEvent.setup();
    revealMock.mockImplementation(
      () => new Promise<string>(() => {}),
    );
    render(<RevealView id="abc_123" />);

    const button = screen.getByRole("button", {
      name: /tampilkan dan hapus link/i,
    });
    await user.click(button);
    await user.click(button);
    expect(revealMock).toHaveBeenCalledTimes(1);
  });

  it("does not show a retry button after a server response", async () => {
    const user = userEvent.setup();
    revealMock.mockRejectedValue(new Error("Link hangus."));
    render(<RevealView id="abc_123" />);

    await user.click(
      screen.getByRole("button", { name: /tampilkan dan hapus link/i }),
    );

    expect(await screen.findByRole("alert")).not.toBeNull();
    expect(
      screen.queryByRole("button", { name: /tampilkan dan hapus link/i }),
    ).toBeNull();
  });

  it("allows retry only when no response was received", async () => {
    const user = userEvent.setup();
    revealMock.mockRejectedValueOnce(new RevealNetworkError());
    revealMock.mockResolvedValueOnce("db-prod-9f2k");
    render(<RevealView id="abc_123" />);

    const button = screen.getByRole("button", {
      name: /tampilkan dan hapus link/i,
    });
    await user.click(button);
    expect(await screen.findByRole("alert")).not.toBeNull();
    await user.click(
      screen.getByRole("button", { name: /coba lagi/i }),
    );
    expect(await screen.findByText("db-prod-9f2k")).not.toBeNull();
    expect(revealMock).toHaveBeenCalledTimes(2);
  });

  it("shows a failure notice when the fragment key is missing", async () => {
    setFragmentKey("");
    render(<RevealView id="abc_123" />);
    expect(await screen.findByRole("alert")).not.toBeNull();
    expect(revealMock).not.toHaveBeenCalled();
  });

  it("shows a failure notice when the reveal request fails", async () => {
    const user = userEvent.setup();
    revealMock.mockRejectedValue(new RevealNetworkError());
    render(<RevealView id="abc_123" />);

    await user.click(
      screen.getByRole("button", { name: /tampilkan dan hapus link/i }),
    );

    expect(await screen.findByRole("alert")).not.toBeNull();
    expect(revealMock).toHaveBeenCalledTimes(1);
  });
});
