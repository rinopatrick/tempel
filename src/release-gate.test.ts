import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("release gate contract", () => {
  it("declares the supported Node floor", () => {
    const manifest = JSON.parse(readFileSync("package.json", "utf8"));
    expect(manifest.engines.node).toBe(">=22.13");
  });

  it("keeps the lockfile root Node floor aligned with the manifest", () => {
    const manifest = JSON.parse(readFileSync("package.json", "utf8"));
    const lock = JSON.parse(readFileSync("package-lock.json", "utf8"));
    expect(lock.packages[""].engines.node).toBe(">=22.13");
    expect(lock.packages[""].engines).toEqual(manifest.engines);
  });

  it("documents Node 22.13+ as the local setup minimum", () => {
    const readme = readFileSync("README.md", "utf8");
    const setup = readme.split("## Run it locally")[1]?.split("\n## ")[0];
    expect(setup).toMatch(/Node 22\.13\+ \(minimum\)/);
  });
});
