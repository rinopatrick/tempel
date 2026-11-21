import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/secret/composer", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/secret/composer")>()),
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
  RevealUnavailableError,
} from "@/secret/reveal";
import Composer from "./composer";
import { RevealView, type RevealState } from "./s/reveal-view";

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
  const lines = GATE.slice(start).split("\n");
  const table: string[] = [];
  for (const line of lines.slice(lines.findIndex((l) => l.startsWith("|")))) {
    if (!line.startsWith("|")) break;
    table.push(line);
  }
  return table.slice(2).map((line) => {
    const cells = line.split("|").map((c) => c.trim());
    return { state: cells[1], mustSee: cells[2] };
  });
}

function quoted(mustSee: string): string[] {
  return [...mustSee.matchAll(/`([^`]+)`/g)].map(([, s]) => s);
}

const ATTRIBUTE = /^[\w-]+="[^"]*"$/;
const CLASS_TOKEN = /^[a-z]+(-[a-z]+)+$/;
const isCopy = (p: string) => !ATTRIBUTE.test(p) && !CLASS_TOKEN.test(p);

/** Text a user can see: every text node outside unselected <option>s. */
function visibleText(root: HTMLElement): string {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let text = "";
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const option = node.parentElement?.closest("option");
    if (option && !option.selected) continue;
    text += node.textContent;
  }
  return text;
}

/**
 * A quoted phrase is an attribute (`role="alert"`), a class token
 * (`break-all`), or visible copy. Copy ending in " …" names a prefix
 * followed by a runtime value.
 */
function expectRendered(root: HTMLElement, phrase: string, state: string): void {
  const why = `state "${state}" must render \`${phrase}\``;
  if (ATTRIBUTE.test(phrase)) {
    expect(root.querySelector(`[${phrase}]`), why).not.toBeNull();
  } else if (CLASS_TOKEN.test(phrase)) {
    expect(root.querySelector(`.${phrase}`), why).not.toBeNull();
  } else {
    const needle = phrase.endsWith(" …") ? phrase.slice(0, -2) : phrase;
    expect(visibleText(root), why).toContain(needle);
  }
}

/** A row naming `role="alert"` pins the alert's own text to its copy. */
function expectAlertCopy(root: HTMLElement, row: Row): void {
  const alert = root.querySelector('[role="alert"]')?.textContent ?? "";
  for (const phrase of quoted(row.mustSee).filter(isCopy)) {
    if (phrase.endsWith(" …")) {
      expect(alert.startsWith(phrase.slice(0, -1)), `${row.state} alert: ${alert}`).toBe(true);
    } else if (row.mustSee.includes("reads exactly")) {
      expect(alert, `${row.state} alert`).toBe(phrase);
    }
  }
}

const COMPOSER_STATES = ["idle", "busy", "error", "link", "copy-failed"] as const;

function failClipboard() {
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: {
      writeText: vi.fn(async () => {
        throw new Error("denied");
      }),
    },
  });
}

type Reach = () => Promise<HTMLElement>;

async function typeSecret(user: ReturnType<typeof userEvent.setup>) {
  await user.type(
    screen.getByPlaceholderText(/tempel password atau api key/i),
    "db-prod-9f2k",
  );
}

const composerStates: Record<(typeof COMPOSER_STATES)[number], Reach> = {
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
  "copy-failed": async () => {
    const user = userEvent.setup();
    failClipboard();
    createShareLinkMock.mockResolvedValue(LINK);
    const { container } = render(<Composer />);
    await typeSecret(user);
    await user.click(screen.getByRole("button", { name: /buat link/i }));
    await screen.findByText(LINK);
    await user.click(screen.getByRole("button", { name: /salin link/i }));
    await screen.findByRole("alert");
    expect(screen.getByText(LINK)).not.toBeNull();
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

const revealStates: Record<RevealState["status"], Reach> = {
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
  unavailable: () =>
    revealInto(
      async () => {
        throw new RevealUnavailableError();
      },
      () => screen.findByRole("heading", { name: "Link tidak tersedia." }),
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

  it("names the twelve gated states: five composer, seven reveal", () => {
    expect(gateRows("Composer, from").map((r) => r.state)).toEqual([
      ...COMPOSER_STATES,
    ]);
    expect(gateRows("Reveal, from").map((r) => r.state)).toEqual([
      "idle",
      "loading",
      "done",
      "burned",
      "expired",
      "unavailable",
      "failed",
    ]);
    expect(GATE).toMatch(/^## The twelve states$/m);
    expect(GATE).toMatch(/one screenshot per state — twelve in total/);
  });

  it("covers every status the reveal view can reach", () => {
    // revealStates is typed Record<RevealState["status"], Reach>, so tsc
    // fails when the union gains or loses a status; this pins the doc to it.
    expect(gateRows("Reveal, from").map((r) => r.state).sort()).toEqual(
      Object.keys(revealStates).sort(),
    );
  });

  for (const row of [
    ...gateRows("Composer, from").map((r) => ({ ...r, view: "composer" })),
    ...gateRows("Reveal, from").map((r) => ({ ...r, view: "reveal" })),
  ]) {
    it(`renders what the gate names for ${row.view} ${row.state}`, async () => {
      const states: Record<string, Reach> =
        row.view === "composer" ? composerStates : revealStates;
      const reach = states[row.state];
      expect(reach, `no way to reach ${row.view} ${row.state}`).toBeDefined();
      const root = await reach();
      const phrases = quoted(row.mustSee);
      expect(phrases.length, `${row.view} ${row.state} names no copy`).toBeGreaterThan(0);
      for (const phrase of phrases) expectRendered(root, phrase, row.state);
      if (row.mustSee.includes('`role="alert"`')) expectAlertCopy(root, row);
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
    expect(boxes.some((b) => /twelve screenshots/i.test(b))).toBe(true);
    for (const box of boxes) expect(box).toMatch(/^- \[ \] /);
  });

  const inGitCheckout =
    spawnSync("git", ["rev-parse", "--is-inside-work-tree"]).status === 0;

  it.skipIf(!inGitCheckout)("tracks no screenshot or capture artifact in the repo", () => {
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
