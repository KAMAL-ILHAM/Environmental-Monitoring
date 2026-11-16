# Wiring ESP32 + DHT22 (modul 3 pin)

## Bahan
- ESP32 Dev Module (kaki header jantan)
- Modul DHT22 / AM2302 **3 pin** (sudah ada resistor pull-up di PCB, jadi **tidak perlu** resistor tambahan)
- 3 kabel jumper **female-to-female**
- Kabel USB Type-C (daya + upload program)

## Pin modul DHT22
Urutan pin berbeda antar produsen, jadi **ikuti label yang tercetak di PCB**, bukan urutan posisinya.

| Label pada modul | Fungsi | Sambungkan ke pin ESP32 |
|------------------|--------|-------------------------|
| `+` (kadang `VCC`) | Daya 3,3–5 V | **3V3** |
| `OUT` (kadang `DATA` / `S`) | Data digital | **GPIO 4** (tercetak `D4`) |
| `-` (kadang `GND`) | Ground | **GND** |

```
 DHT22 modul            ESP32
 ┌───────┐
 │  +    ├────────────── 3V3
 │  OUT  ├────────────── GPIO4 (D4)
 │  -    ├────────────── GND
 └───────┘
```

## Catatan
- Gunakan **3V3**, bukan 5V: GPIO ESP32 hanya toleran 3,3 V, dan DHT22 bekerja normal pada 3,3 V.
- Ingin pin lain? Ubah `DHT_PIN` di `esp32/esp32_dht22_monitor/config.h`. Hindari GPIO 6–11 (flash internal) dan GPIO 34–39 (hanya input, tanpa pull-up internal).
- Sambungkan kabel **sebelum** menancapkan USB Type-C.
- Jika serial monitor menampilkan `pembacaan gagal`, periksa: label pin tertukar, jumper longgar, atau modul rusak.
- Rentang DHT22: suhu −40…80 °C (±0,5 °C), kelembapan 0…100 % (±2–5 %). Sensor tidak bisa dibaca lebih sering dari 1 kali per 2 detik.
