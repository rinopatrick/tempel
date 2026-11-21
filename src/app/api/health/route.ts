import { NextResponse } from "next/server";
import { getSharedVaultStore, VaultUnavailableError } from "@/secret/vault";

export async function GET(): Promise<NextResponse> {
  try {
    return NextResponse.json({ status: "ok", store: getSharedVaultStore() });
  } catch (error) {
    if (!(error instanceof VaultUnavailableError)) throw error;
    return NextResponse.json(
      { status: "unavailable", store: "file" },
      { status: 503 },
    );
  }
}
