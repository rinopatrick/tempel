import { checkRateLimit, clientIp } from "@/secret/rate-limit";
import { getSharedVault, VaultUnavailableError } from "@/secret/vault";
import { noStoreJson } from "../no-store-json";

function invalidId(id: unknown): boolean {
  return typeof id !== "string" || !/^[A-Za-z0-9_-]{22}$/.test(id);
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const limited = checkRateLimit(clientIp(_request), "get-secret");
  if (!limited.allowed) {
    return noStoreJson(
      { error: "rate-limited" },
      {
        headers: { "Retry-After": String(limited.retryAfterSeconds) },
        status: 429,
      },
    );
  }
  if (invalidId(id)) {
    return noStoreJson({ error: "unknown" }, { status: 404 });
  }
  try {
    const vault = getSharedVault();
    const envelope = vault.reveal(id);
    if (envelope === null) {
      const reason = vault.goneReason(id);
      return noStoreJson({ error: "gone", reason }, { status: 410 });
    }
    return noStoreJson(envelope);
  } catch (error) {
    if (!(error instanceof VaultUnavailableError)) throw error;
    return noStoreJson({ error: "store-unavailable" }, { status: 503 });
  }
}
