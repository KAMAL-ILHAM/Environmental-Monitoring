# ESP32 Environmental Monitoring Dashboard

Monitoring suhu, kelembapan, dan lokasi perangkat dari **ESP32 + DHT22**.

```
ESP32 + DHT22 ──HTTP POST (JSON)──▶ Next.js API ──Prisma──▶ PostgreSQL ──▶ Dashboard (polling 3 dtk)
```

**Tanpa data buatan.** Semua kartu, grafik, statistik, riwayat, dan peta berasal dari baris yang tersimpan di database. Selama ESP32 belum mengirim data, dashboard menampilkan **"Menunggu Data ESP32"** dengan kondisi kosong. Peta hanya muncul jika ESP32 benar-benar mengirim koordinat.

## Struktur proyek

```
prisma/schema.prisma                   Skema tabel sensor_readings
prisma/migrations/…/migration.sql      Migrasi PostgreSQL
src/app/api/sensor/route.ts            POST (terima dari ESP32) + GET (riwayat)
src/app/api/sensor/latest/route.ts     GET data terbaru + status online/offline
src/app/api/sensor/stats/route.ts      GET statistik min/rata-rata/maks
src/app/api/dashboard/route.ts         GET ringkasan untuk dashboard (1 snapshot)
src/lib/queries.ts                     Query terbaru, riwayat, statistik, grafik
src/lib/validation.ts                  Validasi payload (zod)
src/components/                        Dashboard, grafik, peta, tabel, indikator
esp32/esp32_dht22_monitor/             Program Arduino (config.h + .ino)
docs/WIRING.md                         Panduan wiring
docker-compose.yml                     PostgreSQL lokal (opsional)
```

## 1. Persyaratan
- Node.js 20+ (disarankan 22) dan npm
- PostgreSQL 14+ (atau Docker)
- Arduino IDE 2.x

## 2. Database PostgreSQL

**Opsi A – Docker (paling mudah):**
```bash
docker compose up -d
```
Membuat database `esp32_monitor` (user/password `postgres`/`postgres`, port 5432).

**Opsi B – PostgreSQL terpasang sendiri:**
```bash
psql -U postgres -c "CREATE DATABASE esp32_monitor;"
```
Lalu sesuaikan `DATABASE_URL` di `.env`.

## 3. Menjalankan aplikasi

```bash
npm install                 # juga menjalankan `prisma generate`
cp .env.example .env        # lalu edit .env
npm run db:deploy           # menerapkan migrasi ke database
npm run dev                 # http://localhost:3000
```

Isi `.env`:

| Variabel | Fungsi |
|----------|--------|
| `DATABASE_URL` | Koneksi PostgreSQL |
| `DEVICE_API_KEY` | Kunci rahasia; ESP32 mengirimnya di header `x-api-key`. Buat dengan `openssl rand -hex 24` |
| `OFFLINE_THRESHOLD_SECONDS` | Batas tanpa data sebelum status **Offline** (default 60 dtk; minimal 3× interval kirim) |

Produksi: `npm run build && npm run start`.

> Untuk perangkat di jaringan yang sama, buka firewall komputer untuk port 3000. `npm run dev` dan `npm start` sudah mendengarkan di `0.0.0.0`.

## 4. API

### `POST /api/sensor` (dipanggil ESP32)
Header: `Content-Type: application/json`, `x-api-key: <DEVICE_API_KEY>`

```json
{
  "deviceId": "esp32-dht22-01",
  "temperature": 27.4,
  "humidity": 61.2,
  "latitude": -5.147665,
  "longitude": 119.432732,
  "ageSeconds": 0
}
```
`latitude`/`longitude` opsional tetapi harus berpasangan. `ageSeconds` opsional (umur data bila sempat tertahan di antrean ESP32).

| Status | Arti |
|--------|------|
| `201` | Tersimpan: `{ ok, id, measuredAt, receivedAt }` |
| `400` | JSON rusak |
| `401` | `x-api-key` salah |
| `413` | Payload > 4 KB |
| `422` | Validasi gagal (suhu di luar −40…80 °C, kelembapan di luar 0…100 %, dll.) |
| `500` | Database gagal menyimpan |

Koordinat `0,0` dianggap "tidak ada GPS" dan disimpan sebagai `NULL`.

### Endpoint baca
- `GET /api/sensor?deviceId=&page=1&pageSize=20` – riwayat seluruh data (terbaru dulu)
- `GET /api/sensor/latest?deviceId=` – data terbaru + `isOnline`
- `GET /api/sensor/stats?deviceId=&range=24h` – min/rata-rata/maks (`1h`, `6h`, `24h`, `7d`, `30d`)
- `GET /api/dashboard?deviceId=&range=24h` – gabungan untuk dashboard

### Skema tabel `sensor_readings`

| Kolom | Tipe | Keterangan |
|-------|------|-----------|
| `id` | serial PK | ID data |
| `deviceId` | varchar(64) | Identitas ESP32 |
| `temperature` | double | °C |
| `humidity` | double | % |
| `latitude`, `longitude` | double, **nullable** | Koordinat bila tersedia |
| `measuredAt` | timestamptz | Waktu pengukuran |
| `receivedAt` | timestamptz | Waktu diterima backend |

Setiap kiriman disimpan sebagai baris baru (bukan hanya data terbaru).

## 5. Program ESP32

1. **Wiring** – ikuti [docs/WIRING.md](docs/WIRING.md): `+`→3V3, `OUT`→GPIO4, `-`→GND.
2. **Arduino IDE**
   - *File → Preferences → Additional boards manager URLs*: `https://espressif.github.io/arduino-esp32/package_esp32_index.json`
   - *Boards Manager*: pasang **esp32** (Espressif Systems).
   - *Library Manager*: pasang **DHT sensor library** dan **Adafruit Unified Sensor** (Adafruit).
3. Buka `esp32/esp32_dht22_monitor/esp32_dht22_monitor.ino`, lalu edit **`config.h`**:
   - `WIFI_SSID`, `WIFI_PASSWORD` (hanya 2,4 GHz)
   - `API_URL` – `http://<IP-LAN-komputer>:3000/api/sensor` (cek IP: `ipconfig` / `ip a`; **jangan** `localhost`)
   - `API_KEY` – sama dengan `DEVICE_API_KEY` di `.env`
   - `DEVICE_ID`, `SEND_INTERVAL_MS` (default 10 dtk), `DHT_PIN`
   - Lokasi: lihat catatan di bawah
4. Pilih board **ESP32 Dev Module**, pilih port, klik **Upload**. Buka *Serial Monitor* pada **115200 baud**.

### Penanganan koneksi terputus
- Wi-Fi putus → sambung ulang otomatis (tanpa memblokir pembacaan sensor); diulang dari awal bila >20 dtk gagal.
- Server mati / jaringan gagal → pembacaan ditampung di antrean RAM (60 data) lalu dikirim berurutan saat pulih. Waktu pengukuran tetap akurat lewat `ageSeconds`.
- Respons 4xx permanen (kunci salah, data tidak valid) → data dibuang agar antrean tidak macet; `5xx`/timeout → dicoba lagi.
- Pembacaan DHT22 gagal (`NaN`) **tidak pernah dikirim**; tidak ada nilai pengganti.
- Restart otomatis bila 10 menit tanpa pengiriman berhasil.
- Antrean hanya di RAM: hilang jika ESP32 restart/kehilangan daya.

### Lokasi perangkat
Modul DHT22 tidak punya GPS. Secara bawaan `DEVICE_HAS_LOCATION 0`, sehingga peta menampilkan "Lokasi belum tersedia". Jika perangkat dipasang tetap, set `DEVICE_HAS_LOCATION 1` dan isi `DEVICE_LATITUDE`/`DEVICE_LONGITUDE` dengan **koordinat asli** lokasi pemasangan (Google Maps → klik kanan titik → salin koordinat). Untuk perangkat bergerak, tambahkan modul GPS lalu kirim hasil pembacaannya pada field yang sama.

## 6. Panduan pengujian dengan ESP32 sungguhan

1. **Database & server hidup.** `npm run dev`, buka `http://localhost:3000`. Harus tampil badge **"Menunggu Data ESP32"**, total data `0`, grafik/peta/riwayat kosong. (Ini kondisi yang benar sebelum ada kiriman.)
2. **Cek jalur jaringan.** Dari HP/laptop lain di Wi-Fi yang sama, buka `http://<IP-komputer>:3000`. Jika tidak terbuka, periksa firewall.
3. **Upload firmware**, buka Serial Monitor (115200). Log yang diharapkan:
   ```
   [WIFI] tersambung. IP=192.168.1.x RSSI=-55 dBm
   [DHT22] suhu=27.4 °C  kelembapan=61.2 %
   [HTTP] OK 201  {"ok":true,"id":1,...}
   ```
4. **Dashboard terisi sendiri** dalam ≤3 detik tanpa reload: kartu suhu/kelembapan, status **ESP32 Online**, total data bertambah, riwayat dan grafik muncul.
5. **Uji sensor nyata.** Hembuskan napas ke sensor → kelembapan naik, lalu turun perlahan. Dekatkan tangan hangat → suhu naik sedikit.
6. **Uji Offline.** Cabut USB ESP32. Setelah > `OFFLINE_THRESHOLD_SECONDS`, status berubah menjadi **ESP32 Offline** dan "Data terakhir … lalu" terus bertambah.
7. **Uji koneksi terputus.** Matikan Wi-Fi/router (atau hentikan server) ±1 menit, lalu nyalakan lagi. Serial Monitor menampilkan `[QUEUE] n data menunggu terkirim`, lalu data tertahan terkirim dan muncul di riwayat dengan **waktu pengukuran yang benar**.
8. **Uji lokasi.** Set `DEVICE_HAS_LOCATION 1` dengan koordinat asli, upload ulang → peta menampilkan penanda di titik tersebut.
9. **Verifikasi database** (opsional):
   ```bash
   npm run db:studio
   # atau
   psql "$DATABASE_URL" -c 'SELECT * FROM sensor_readings ORDER BY id DESC LIMIT 5;'
   ```
10. **Uji endpoint tanpa ESP32** (hanya untuk memeriksa validasi; ini *akan* menyimpan 1 baris nyata ke database, hapus setelahnya bila perlu):
    ```bash
    curl -i -X POST http://localhost:3000/api/sensor \
      -H "Content-Type: application/json" -H "x-api-key: <DEVICE_API_KEY>" \
      -d '{"deviceId":"uji-curl","temperature":200,"humidity":50}'   # → 422
    ```

### Pemecahan masalah

| Gejala | Penyebab umum |
|--------|---------------|
| Serial: `gagal terhubung ke server` | `API_URL` salah / pakai `localhost` / firewall memblokir port 3000 |
| Serial: `ditolak server (401)` | `API_KEY` ≠ `DEVICE_API_KEY` (restart `npm run dev` setelah edit `.env`) |
| Serial: `pembacaan gagal` | Wiring salah, jumper longgar, `DHT_PIN` tidak sesuai |
| Serial: `ditolak server (422)` | Nilai di luar rentang, atau `deviceId` berisi karakter terlarang |
| Dashboard merah "Tidak dapat mengambil data" | PostgreSQL mati / `DATABASE_URL` salah / migrasi belum dijalankan |
| Status selalu Offline padahal data masuk | `OFFLINE_THRESHOLD_SECONDS` lebih kecil dari interval kirim |

## 7. Asumsi teknis
- **Satu endpoint, kunci bersama.** Autentikasi memakai satu `x-api-key` statis (paling sederhana). Dashboard sendiri tidak memakai login; lindungi dengan reverse proxy/VPN bila dibuka ke internet.
- **Real-time = polling 3 detik** (bukan WebSocket), sederhana dan andal.
- **Online/Offline** dihitung dari `receivedAt` terakhir di server, bukan jam ESP32 (ESP32 tidak butuh NTP).
- **Ambang indikator** (suhu: <18 dingin, 18–28 nyaman, 28–33 hangat, ≥33 panas; kelembapan: <30 kering, 30–60 ideal, 60–75 lembap, ≥75 sangat lembap) hanya acuan klasifikasi; ubah di `src/lib/status.ts`.
- **Grafik**: bila data pada rentang >600 titik, dirata-ratakan per bucket waktu lewat SQL agar ringan.
- **HTTPS**: firmware mendukung `https://`; bawaan `HTTPS_SKIP_CERT_CHECK 1` (tanpa verifikasi sertifikat). Untuk produksi isi `ROOT_CA` dan set ke `0`.
- **Peta** memakai tile publik OpenStreetMap (butuh internet pada browser pengguna; patuhi [kebijakan tile OSM](https://operations.osmfoundation.org/policies/tiles/) untuk trafik tinggi).
