import { NextRequest, NextResponse } from "next/server";
import { hasValidApiKey } from "@/lib/auth";
import { getHistory } from "@/lib/queries";
import { parseDeviceId, parseIntParam } from "@/lib/params";
import { prisma } from "@/lib/prisma";
import { sensorPayloadSchema } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 4096;

const globalForGeo = globalThis as unknown as {
  latestBrowserLocation?: { latitude: number; longitude: number; updatedAt: number };
};

/**
 * PUT /api/sensor – dipanggil otomatis oleh browser pemilik alat (?key=...).
 */
export async function PUT(req: NextRequest) {
  const adminKey = process.env.NEXT_PUBLIC_ADMIN_KEY;
  const headerKey = req.headers.get("x-admin-key");

  if (!adminKey || headerKey !== adminKey) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const lat = Number(body?.latitude);
    const lng = Number(body?.longitude);

    if (!Number.isFinite(lat) || !Number.isFinite(lng) || (lat === 0 && lng === 0)) {
      return NextResponse.json({ ok: false, error: "invalid_coordinates" }, { status: 400 });
    }

    globalForGeo.latestBrowserLocation = {
      latitude: lat,
      longitude: lng,
      updatedAt: Date.now(),
    };

    // Perbarui juga baris data terakhir di database agar koordinat langsung tampil di peta
    const latestRow = await prisma.sensorReading.findFirst({
      orderBy: { receivedAt: "desc" },
      select: { id: true },
    });

    if (latestRow) {
      await prisma.sensorReading.update({
        where: { id: latestRow.id },
        data: { latitude: lat, longitude: lng },
      });
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
}

/**
 * POST /api/sensor – dipanggil oleh ESP32.
 */
export async function POST(req: NextRequest) {
  if (!hasValidApiKey(req)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const raw = await req.text();
  if (raw.length > MAX_BODY_BYTES) {
    return NextResponse.json({ ok: false, error: "payload_too_large" }, { status: 413 });
  }

  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const parsed = sensorPayloadSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      {
        ok: false,
        error: "validation_failed",
        issues: parsed.error.issues.map((i) => ({ field: i.path.join("."), message: i.message })),
      },
      { status: 422 },
    );
  }

  const data = parsed.data;

  let latitude = data.latitude ?? null;
  let longitude = data.longitude ?? null;
  if (latitude === 0 && longitude === 0) {
    latitude = null;
    longitude = null;
  }

  // 1. Cek memori server aktif
  if ((latitude === null || longitude === null) && globalForGeo.latestBrowserLocation) {
    latitude = globalForGeo.latestBrowserLocation.latitude;
    longitude = globalForGeo.latestBrowserLocation.longitude;
  }

  // 2. Fallback untuk serverless Vercel: ambil koordinat terakhir yang tersimpan di database
  if (latitude === null || longitude === null) {
    const lastGeo = await prisma.sensorReading.findFirst({
      where: {
        deviceId: data.deviceId,
        latitude: { not: null },
        longitude: { not: null },
      },
      orderBy: { receivedAt: "desc" },
      select: { latitude: true, longitude: true },
    });

    if (lastGeo) {
      latitude = lastGeo.latitude;
      longitude = lastGeo.longitude;
    }
  }

  const receivedAt = new Date();
  const measuredAt = new Date(receivedAt.getTime() - (data.ageSeconds ?? 0) * 1000);

  try {
    const row = await prisma.sensorReading.create({
      data: {
        deviceId: data.deviceId,
        temperature: data.temperature,
        humidity: data.humidity,
        latitude,
        longitude,
        measuredAt,
        receivedAt,
      },
      select: { id: true, measuredAt: true, receivedAt: true },
    });

    return NextResponse.json(
      { ok: true, id: row.id, measuredAt: row.measuredAt.toISOString(), receivedAt: row.receivedAt.toISOString() },
      { status: 201 },
    );
  } catch (error) {
    console.error("[POST /api/sensor] gagal menyimpan ke database:", error);
    return NextResponse.json({ ok: false, error: "database_error" }, { status: 500 });
  }
}

/**
 * GET /api/sensor?deviceId=&page=1&pageSize=20 – riwayat seluruh data (terbaru lebih dulu).
 */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;

  try {
    const history = await getHistory({
      deviceId: parseDeviceId(sp.get("deviceId")),
      page: parseIntParam(sp.get("page"), 1, 1, 1_000_000),
      pageSize: parseIntParam(sp.get("pageSize"), 20, 1, 100),
    });
    return NextResponse.json(history, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[GET /api/sensor]", error);
    return NextResponse.json({ error: "database_unavailable" }, { status: 500 });
  }
}
