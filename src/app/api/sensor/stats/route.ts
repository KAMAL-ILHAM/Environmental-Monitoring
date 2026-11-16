import { NextRequest, NextResponse } from "next/server";
import { getDevices, getStats } from "@/lib/queries";
import { parseDeviceId, parseRange } from "@/lib/params";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/sensor/stats?deviceId=&range=24h – min / rata-rata / maks dari data nyata di database. */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const range = parseRange(sp.get("range"));

  try {
    const devices = await getDevices();
    const requested = parseDeviceId(sp.get("deviceId"));
    const deviceId = requested && devices.some((d) => d.deviceId === requested) ? requested : devices[0]?.deviceId ?? null;

    if (!deviceId) {
      return NextResponse.json(
        { deviceId: null, range, stats: { count: 0, temperature: null, humidity: null, firstAt: null, lastAt: null } },
        { headers: { "Cache-Control": "no-store" } },
      );
    }

    const stats = await getStats(deviceId, range);
    return NextResponse.json({ deviceId, range, stats }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[GET /api/sensor/stats]", error);
    return NextResponse.json({ error: "database_unavailable" }, { status: 500 });
  }
}
