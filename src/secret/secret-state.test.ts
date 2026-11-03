import { describe, expect, it } from "vitest";
import { nextSecretState } from "./secret-state";

describe("nextSecretState", () => {
  it("moves a created secret to viewable on reveal", () => {
    expect(nextSecretState("created", "reveal")).toBe("viewable");
  });

  it("keeps a viewable secret viewable on expiry", () => {
    expect(nextSecretState("viewable", "expire")).toBe("viewable");
  });

  it("burns a viewable secret on burn", () => {
    expect(nextSecretState("viewable", "burn")).toBe("burned");
  });

  it("expires a created secret on expiry", () => {
    expect(nextSecretState("created", "expire")).toBe("expired");
  });

  it("keeps a burned secret burned on reveal", () => {
    expect(nextSecretState("burned", "reveal")).toBe("burned");
  });

  it("keeps an expired secret expired on reveal", () => {
    expect(nextSecretState("expired", "reveal")).toBe("expired");
  });
});
