import { z } from "zod";

const coordinate = (min: number, max: number) =>
  z.number().finite().min(min).max(max).nullish();

/**
 * Payload yang dikirim ESP32 melalui HTTP POST.
 *
 * - temperature / humidity dibatasi rentang fisik DHT22 (-40..80 °C, 0..100 %).
 * - latitude & longitude opsional, tetapi harus dikirim berpasangan.
 * - ageSeconds opsional: umur data saat dikirim (dipakai jika data sempat tertahan
 *   di antrean ESP32 selama koneksi terputus). Default 0 = data baru diukur.
 */
export const sensorPayloadSchema = z
  .object({
    deviceId: z
      .string()
      .trim()
      .min(1, "deviceId wajib diisi")
      .max(64, "deviceId maksimal 64 karakter")
      .regex(/^[A-Za-z0-9._:-]+$/, "deviceId hanya boleh huruf, angka, titik, garis bawah, titik dua, atau tanda hubung"),
    temperature: z
      .number({ invalid_type_error: "temperature harus berupa angka" })
      .finite()
      .min(-40, "temperature di bawah batas DHT22 (-40 °C)")
      .max(80, "temperature di atas batas DHT22 (80 °C)"),
    humidity: z
      .number({ invalid_type_error: "humidity harus berupa angka" })
      .finite()
      .min(0, "humidity minimal 0 %")
      .max(100, "humidity maksimal 100 %"),
    latitude: coordinate(-90, 90),
    longitude: coordinate(-180, 180),
    ageSeconds: z.number().int().min(0).max(86_400).nullish(),
  })
  .refine((d) => (d.latitude == null) === (d.longitude == null), {
    message: "latitude dan longitude harus dikirim berpasangan",
    path: ["latitude"],
  });

export type SensorPayload = z.infer<typeof sensorPayloadSchema>;
