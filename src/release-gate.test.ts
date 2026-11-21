import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";

describe("release gate contract", () => {
  it("runs the ordered release gate on Node 22 for PRs and master pushes", () => {
    const workflowPath = ".github/workflows/ci.yml";
    expect(existsSync(workflowPath), "release gate workflow must exist").toBe(true);
    const workflow = readFileSync(workflowPath, "utf8");

    expect(workflow).toMatch(/^on:\s*\n  pull_request:\s*\n  push:\s*\n    branches: \[master\]$/m);
    expect(workflow).toMatch(/uses: actions\/checkout@v\d+/);
    expect(workflow).toMatch(/uses: actions\/setup-node@v\d+\s*\n\s+with:\s*\n\s+node-version: ["']?22["']?\s*\n\s+cache: ["']?npm["']?\s*$/m);
    const commands = [...workflow.matchAll(/^\s+- run: (.+)$/gm)].map(
      (match) => match[1],
    );
    expect(commands).toEqual([
      "npm ci",
      "npx tsc --noEmit",
      "npm test -- --run",
      "npm run build",
    ]);
  });

  it("declares the supported Node floor", () => {
    const manifest = JSON.parse(readFileSync("package.json", "utf8"));
    expect(manifest.engines).toEqual({ node: ">=22.5" });
  });
});
