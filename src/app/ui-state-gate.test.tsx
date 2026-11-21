import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/secret/composer", () => ({
  TTL_OPTIONS: [
    { label: "1 jam", seconds: 3600 },
    { label: "6 jam", seconds: 21600 },
    { label: "24 jam", seconds: 86400 },
  ],
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
  RevealNetworkError,
} from "@/secret/reveal";
import Composer from "./composer";
import { RevealView } from "./s/reveal-view";

/**
 * Seam: the gate doc (docs/qa/ui-state-gate.md) against the rendered
 * component seam. Spec #42: one screenshot per named state before a UI
 * merge, proof in the PR only. The doc is the reviewer's checklist, so
 * every state it names must be reachable and must render what it says.
 */

const GATE_PATH = "docs/qa/ui-state-gate.md";
const GATE = readFileSync(GATE_PATH, "utf8");
const KEY = "A".repeat(43);
const LINK = `https://tempel.test/s/server-id-1#${KEY}`;
const createShareLinkMock = vi.mocked(createShareLink);
const revealMock = vi.mocked(revealSecret);

type Row = { state: string; mustSee: string };

function gateRows(heading: string): Row[] {
  const start = GATE.indexOf(heading);
  expect(start, `${GATE_PATH} must have a "${heading}" section`).toBeGreaterThan(-1);
  const rows: Row[] = [];
  for (const line of GATE.slice(start).split("\n").slice(1)) {
    if (/^(#|[A-Z])/.test(line) && rows.length > 0) break;
    const cells = line.split("|").map((c) => c.trim());
    if (cells.length < 4 || /^-+$/.test(cells[1]) || cells[1] === "State") {
      continue;
    }
    rows.push({ state: cells[1], mustSee: cells[2] });
  }
  return rows;
}

function quoted(mustSee: string): string[] {
  return [...mustSee.matchAll(/`([^`]+)`/g)].map(([, s]) => s);
}

/** A phrase ending in " …" names a prefix followed by a runtime value. */
function expectRendered(html: string, phrase: string, state: string): void {
  const needle = phrase.endsWith(" …") ? phrase.slice(0, -2) : phrase;
  expect(html, `state "${state}" must render \`${phrase}\``).toContain(needle);
}

async function typeSecret(user: ReturnType<typeof userEvent.setup>) {
  await user.type(
    screen.getByPlaceholderText(/tempel password atau api key/i),
    "db-prod-9f2k",
  );
}

const composerStates: Record<string, () => Promise<HTMLElement>> = {
  idle: async () => render(<Composer />).container,
  busy: async () => {
    const user = userEvent.setup();
    createShareLinkMock.mockReturnValue(new Promise<string>(() => {}));
    const { container } = render(<Composer />);
    await typeSecret(user);
    await user.click(screen.getByRole("button", { name: /buat link/i }));
    await screen.findByRole("button", { name: /membuat/i });
    return container;
  },
  error: async () => {
    const user = userEvent.setup();
    createShareLinkMock.mockRejectedValue(new Error("server down"));
    const { container } = render(<Composer />);
    await typeSecret(user);
    await user.click(screen.getByRole("button", { name: /buat link/i }));
    await screen.findByRole("alert");
    return container;
  },
  link: async () => {
    const user = userEvent.setup();
    createShareLinkMock.mockResolvedValue(LINK);
    const { container } = render(<Composer />);
    await typeSecret(user);
    await user.click(screen.getByRole("button", { name: /buat link/i }));
    await screen.findByText(LINK);
    return container;
  },
};

async function revealInto(
  outcome: () => Promise<string>,
  settled: () => Promise<unknown>,
): Promise<HTMLElement> {
  const user = userEvent.setup();
  revealMock.mockImplementation(outcome);
  const { container } = render(<RevealView id="abc_123" />);
  await user.click(
    screen.getByRole("button", { name: /tampilkan dan hapus link/i }),
  );
  await settled();
  return container;
}

const revealStates: Record<string, () => Promise<HTMLElement>> = {
  idle: async () => render(<RevealView id="abc_123" />).container,
  loading: () =>
    revealInto(
      () => new Promise<string>(() => {}),
      () => screen.findByRole("button", { name: /membuka/i }),
    ),
  done: () =>
    revealInto(
      async () => "db-prod-9f2k",
      () => screen.findByText("db-prod-9f2k"),
    ),
  burned: () =>
    revealInto(
      async () => {
        throw new RevealBurnedError();
      },
      () => screen.findByRole("heading", { name: /hangus/i }),
    ),
  expired: () =>
    revealInto(
      async () => {
        throw new RevealExpiredError();
      },
      () => screen.findByRole("heading", { name: /kedaluwarsa/i }),
    ),
  failed: () =>
    revealInto(
      async () => {
        throw new RevealNetworkError();
      },
      () => screen.findByRole("button", { name: /coba lagi/i }),
    ),
};

describe("UI state gate against the rendered states (#42)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.location.hash = `#${KEY}`;
  });
  afterEach(() => {
    cleanup();
    window.location.hash = "";
  });

  it("names exactly ten states: four composer, six reveal", () => {
    expect(gateRows("Composer, from").map((r) => r.state)).toEqual([
      "idle",
      "busy",
      "error",
      "link",
    ]);
    expect(gateRows("Reveal, from").map((r) => r.state)).toEqual([
      "idle",
      "loading",
      "done",
      "burned",
      "expired",
      "failed",
    ]);
  });

  it("covers every status the reveal view can reach", () => {
    const src = readFileSync("src/app/s/reveal-view.tsx", "utf8");
    const union = src.match(/export type RevealState =([\s\S]*?);\n/)?.[1] ?? "";
    const statuses = [...union.matchAll(/status: "(\w+)"/g)].map(([, s]) => s);
    expect(statuses.length).toBeGreaterThan(0);
    expect(gateRows("Reveal, from").map((r) => r.state).sort()).toEqual(
      statuses.sort(),
    );
  });

  for (const row of [
    ...gateRows("Composer, from").map((r) => ({ ...r, view: "composer" })),
    ...gateRows("Reveal, from").map((r) => ({ ...r, view: "reveal" })),
  ]) {
    it(`renders what the gate names for ${row.view} ${row.state}`, async () => {
      const states = row.view === "composer" ? composerStates : revealStates;
      const reach = states[row.state];
      expect(reach, `no way to reach ${row.view} ${row.state}`).toBeDefined();
      const html = (await reach()).innerHTML;
      const phrases = quoted(row.mustSee);
      expect(phrases.length, `${row.view} ${row.state} names no copy`).toBeGreaterThan(0);
      for (const phrase of phrases) expectRendered(html, phrase, row.state);
    });
  }

  it("points reviewers at the token contract that exists", () => {
    expect(GATE).toContain("`src/app/tokens.ts`");
    expect(existsSync("src/app/tokens.ts")).toBe(true);
  });

  it("keeps the repo copy of the sign-off checklist unticked", () => {
    const signOff = GATE.slice(GATE.indexOf("## Sign-off"));
    const boxes = signOff.match(/^- \[[ xX]\] .+$/gm) ?? [];
    expect(boxes.length).toBeGreaterThanOrEqual(4);
    expect(boxes.some((b) => /ten screenshots/i.test(b))).toBe(true);
    for (const box of boxes) expect(box).toMatch(/^- \[ \] /);
  });

  it("tracks no screenshot or capture artifact in the repo", () => {
    const tracked = execFileSync("git", ["ls-files"], { encoding: "utf8" })
      .split("\n")
      .filter(Boolean);
    const proof = tracked.filter(
      (p) =>
        /(^|\/)\.gate-/.test(p) ||
        /\.(png|jpe?g|gif|webp)$/i.test(p) ||
        /^docs\/.*\.html$/i.test(p),
    );
    expect(proof, "gate proof lives in the PR, never the repo").toEqual([]);
  });
});
