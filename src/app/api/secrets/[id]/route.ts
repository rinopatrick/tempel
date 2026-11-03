import { NextResponse } from "next/server";
import { getSharedVault } from "@/secret/vault";

function invalidId(id: unknown): boolean {
  return typeof id !== "string" || !/^[A-Za-z0-9_-]{22}$/.test(id);
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (invalidId(id)) {
    return NextResponse.json({ error: "unknown" }, { status: 404 });
  }
  const envelope = getSharedVault().reveal(id);
  if (envelope === null) {
    const reason = getSharedVault().goneReason(id);
    return NextResponse.json({ error: "gone", reason }, { status: 410 });
  }
  return NextResponse.json(envelope);
}
