import { timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";

let warned = false;

/**
 * Memeriksa header `x-api-key` terhadap DEVICE_API_KEY.
 * Jika DEVICE_API_KEY kosong, pemeriksaan dilewati (hanya untuk uji lokal) dan peringatan dicetak sekali.
 */
export function hasValidApiKey(req: NextRequest): boolean {
  const expected = process.env.DEVICE_API_KEY;

  if (!expected) {
    if (!warned) {
      warned = true;
      console.warn("[auth] DEVICE_API_KEY belum diisi – endpoint POST /api/sensor terbuka untuk siapa saja.");
    }
    return true;
  }

  const provided = Buffer.from(req.headers.get("x-api-key") ?? "");
  const wanted = Buffer.from(expected);
  return provided.length === wanted.length && timingSafeEqual(provided, wanted);
}
