import { NextResponse } from "next/server";
import { getLiveKitConfig } from "@/lib/livekitConfig";

export const runtime = "nodejs";

export async function GET() {
  const configured = Boolean(getLiveKitConfig());

  return NextResponse.json(
    { status: configured ? "ok" : "misconfigured" },
    { status: configured ? 200 : 503 },
  );
}
