import { NextRequest, NextResponse } from "next/server";
import { getDashboard } from "@/lib/queries";
import { parseDeviceId, parseRange } from "@/lib/params";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/dashboard?deviceId=&range=24h – seluruh data dashboard dalam satu snapshot. */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;

  try {
    const data = await getDashboard({
      deviceId: parseDeviceId(sp.get("deviceId")),
      range: parseRange(sp.get("range")),
    });
    return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[GET /api/dashboard]", error);
    return NextResponse.json({ error: "database_unavailable" }, { status: 500 });
  }
}
