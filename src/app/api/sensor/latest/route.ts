import { NextRequest, NextResponse } from "next/server";
import { getLatestStatus } from "@/lib/queries";
import { parseDeviceId } from "@/lib/params";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/sensor/latest?deviceId= – data terbaru + status Online/Offline. */
export async function GET(req: NextRequest) {
  try {
    const result = await getLatestStatus(parseDeviceId(req.nextUrl.searchParams.get("deviceId")));
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[GET /api/sensor/latest]", error);
    return NextResponse.json({ error: "database_unavailable" }, { status: 500 });
  }
}
