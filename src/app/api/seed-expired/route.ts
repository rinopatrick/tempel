import { NextResponse } from "next/server";
import { getSharedVault } from "@/secret/vault";

// Dev-only seam for the launch probe: plants a past-expiry row so the
// live server can prove lazy burn reports 410 expired without waiting out
// a real TTL. Enabled only when TEMPEL_PROBE_SEED=1, so production
// without that flag answers 404 and the seam never ships live by default.
export async function POST(request: Request) {
  if (process.env.TEMPEL_PROBE_SEED !== "1") {
    return NextResponse.json({ error: "unknown" }, { status: 404 });
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "bad-envelope" }, { status: 400 });
  }
  const id =
    typeof body === "object" && body !== null
      ? (body as Record<string, unknown>).id
      : undefined;
  if (typeof id !== "string" || !/^[A-Za-z0-9_-]{22}$/.test(id)) {
    return NextResponse.json({ error: "bad-envelope" }, { status: 400 });
  }
  getSharedVault().store(
    id,
    { ciphertext: "Y2k", iv: "aXY" },
    Date.now() - 1_000,
  );
  return NextResponse.json({ id }, { status: 201 });
}
