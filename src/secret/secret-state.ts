export type SecretState = "created" | "viewable" | "burned" | "expired";
export type SecretEvent = "reveal" | "burn" | "expire";

export function nextSecretState(
  state: SecretState,
  event: SecretEvent,
): SecretState {
  switch (state) {
    case "created":
      if (event === "reveal") return "viewable";
      if (event === "expire") return "expired";
      return state;
    case "viewable":
      if (event === "burn") return "burned";
      return state;
    case "burned":
    case "expired":
      return state;
  }
}
