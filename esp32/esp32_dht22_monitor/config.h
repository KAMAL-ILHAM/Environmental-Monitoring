// =====================================================================
//  KONFIGURASI ESP32 – edit file ini sebelum upload.
// =====================================================================
#pragma once

// ---------- Wi-Fi ----------------------------------------------------
// ESP32 hanya mendukung Wi-Fi 2.4 GHz (bukan 5 GHz).
#define WIFI_SSID     "iPhone2"
#define WIFI_PASSWORD "55555554"

// ---------- Backend API ----------------------------------------------
// Alamat endpoint penerima data. Gunakan IP LAN komputer yang menjalankan
// dashboard (BUKAN "localhost" – itu akan menunjuk ke ESP32 itu sendiri).
#define API_URL "http://172.20.10.6:3000/api/sensor"

// Harus SAMA dengan DEVICE_API_KEY pada file .env backend.
#define API_KEY "ganti-dengan-kunci-acak-yang-panjang"

// Jika API_URL memakai https://, 1 = tidak memverifikasi sertifikat server.
#define HTTPS_SKIP_CERT_CHECK 1

// ---------- Identitas perangkat --------------------------------------
// Nama unik perangkat; tampil di dashboard. Hanya huruf, angka, . _ : -
#define DEVICE_ID "esp32-dht22-01"

// ---------- Sensor DHT22 ---------------------------------------------
// GPIO yang tersambung ke pin OUT/DATA modul DHT22 (lihat docs/WIRING.md).
#define DHT_PIN 4

// ---------- Pengiriman -----------------------------------------------
// Jeda antar pengiriman data (milidetik). DHT22 minimal 2000 ms.
#define SEND_INTERVAL_MS 10000UL

// Timeout HTTP POST (milidetik).
#define HTTP_TIMEOUT_MS 8000UL

// ---------- Koneksi terputus -----------------------------------------
// Pembacaan yang gagal terkirim ditampung di RAM (maks. jumlah ini) dan
// dikirim ulang berurutan saat koneksi pulih.
#define QUEUE_CAPACITY 60

// Jika Wi-Fi belum tersambung setelah waktu ini, koneksi diulang dari awal.
#define WIFI_RECONNECT_AFTER_MS 20000UL

// Restart otomatis jika tidak ada pengiriman berhasil selama waktu ini (0 = nonaktif).
#define RESTART_IF_NO_SUCCESS_MS 600000UL

// ---------- Lokasi perangkat -----------------------------------------
// Koordinat TIDAK pernah dikarang. Secara bawaan lokasi dimatikan.
#define DEVICE_HAS_LOCATION 0
#define DEVICE_LATITUDE     0.000000
#define DEVICE_LONGITUDE    0.000000