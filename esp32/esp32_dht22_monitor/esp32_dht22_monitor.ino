/*
 * ESP32 Environmental Monitoring – DHT22 → HTTP POST → Backend Next.js
 *
 * Library yang dibutuhkan (Arduino IDE → Library Manager):
 *   - "DHT sensor library"  oleh Adafruit
 *   - "Adafruit Unified Sensor" oleh Adafruit
 * Board : "ESP32 Dev Module" (paket "esp32" oleh Espressif Systems)
 *
 * Alur:
 *   1. Baca DHT22 tiap SEND_INTERVAL_MS. Pembacaan gagal (NaN) TIDAK dikirim.
 *   2. Setiap pembacaan valid dimasukkan ke antrean, lalu antrean dikirim berurutan.
 *   3. Jika Wi-Fi/server tidak tersedia, data tetap di antrean dan dikirim saat pulih.
 *      Umur data dikirim sebagai "ageSeconds" agar waktu pengukuran di database tetap akurat.
 */

#include <WiFi.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>
#include <DHT.h>

#include "config.h"

#define DHT_TYPE DHT22

// Sertifikat root CA (format PEM) – hanya dipakai jika HTTPS_SKIP_CERT_CHECK = 0.
static const char *ROOT_CA = nullptr;

// ---------------------------------------------------------------------
struct Reading {
  float temperature;
  float humidity;
  uint32_t measuredMs;  // millis() saat diukur
};

enum class SendResult { Ok, RetryLater, Rejected };

static Reading queueBuf[QUEUE_CAPACITY];
static size_t queueHead = 0;   // indeks elemen tertua
static size_t queueCount = 0;

static DHT dht(DHT_PIN, DHT_TYPE);

static uint32_t lastSampleMs = 0;
static uint32_t lastSuccessMs = 0;
static uint32_t wifiAttemptStartMs = 0;
static bool wifiWasConnected = false;
static uint32_t consecutiveSensorFailures = 0;

// ---------------------------------------------------------------------
// Antrean (ring buffer)
// ---------------------------------------------------------------------
static void queuePush(const Reading &r) {
  if (queueCount == QUEUE_CAPACITY) {
    // Penuh: buang data tertua agar data terbaru tidak hilang.
    queueHead = (queueHead + 1) % QUEUE_CAPACITY;
    queueCount--;
    Serial.println(F("[QUEUE] penuh, data tertua dibuang"));
  }
  queueBuf[(queueHead + queueCount) % QUEUE_CAPACITY] = r;
  queueCount++;
}

static void queuePop() {
  if (queueCount == 0) return;
  queueHead = (queueHead + 1) % QUEUE_CAPACITY;
  queueCount--;
}

// ---------------------------------------------------------------------
// Wi-Fi
// ---------------------------------------------------------------------
static void startWiFi() {
  Serial.printf("[WIFI] menyambung ke \"%s\" ...\n", WIFI_SSID);
  WiFi.disconnect(true);
  delay(100);
  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(true);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  wifiAttemptStartMs = millis();
}

// Dipanggil tiap loop; tidak memblokir.
static void maintainWiFi() {
  const bool connected = (WiFi.status() == WL_CONNECTED);

  if (connected && !wifiWasConnected) {
    Serial.printf("[WIFI] tersambung. IP=%s RSSI=%d dBm\n", WiFi.localIP().toString().c_str(), WiFi.RSSI());
  } else if (!connected && wifiWasConnected) {
    Serial.println(F("[WIFI] koneksi terputus, mencoba menyambung ulang ..."));
    wifiAttemptStartMs = millis();
  }
  wifiWasConnected = connected;

  if (!connected && millis() - wifiAttemptStartMs > WIFI_RECONNECT_AFTER_MS) {
    startWiFi();
  }
}

// ---------------------------------------------------------------------
// HTTP
// ---------------------------------------------------------------------
static bool urlIsHttps() { return strncmp(API_URL, "https://", 8) == 0; }

static SendResult postReading(const Reading &r) {
  const uint32_t ageSeconds = (millis() - r.measuredMs) / 1000UL;

  char body[256];
  int len;
#if DEVICE_HAS_LOCATION
  len = snprintf(body, sizeof(body),
                 "{\"deviceId\":\"%s\",\"temperature\":%.1f,\"humidity\":%.1f,"
                 "\"latitude\":%.6f,\"longitude\":%.6f,\"ageSeconds\":%lu}",
                 DEVICE_ID, r.temperature, r.humidity, (double)DEVICE_LATITUDE, (double)DEVICE_LONGITUDE,
                 (unsigned long)ageSeconds);
#else
  len = snprintf(body, sizeof(body),
                 "{\"deviceId\":\"%s\",\"temperature\":%.1f,\"humidity\":%.1f,\"ageSeconds\":%lu}",
                 DEVICE_ID, r.temperature, r.humidity, (unsigned long)ageSeconds);
#endif
  if (len <= 0 || len >= (int)sizeof(body)) {
    Serial.println(F("[HTTP] payload terlalu panjang"));
    return SendResult::Rejected;
  }

  HTTPClient http;
  WiFiClientSecure secureClient;
  WiFiClient plainClient;

  bool begun;
  if (urlIsHttps()) {
#if HTTPS_SKIP_CERT_CHECK
    secureClient.setInsecure();
#else
    if (ROOT_CA) secureClient.setCACert(ROOT_CA);
#endif
    begun = http.begin(secureClient, API_URL);
  } else {
    begun = http.begin(plainClient, API_URL);
  }
  if (!begun) {
    Serial.println(F("[HTTP] http.begin gagal – periksa API_URL"));
    return SendResult::RetryLater;
  }

  http.setTimeout(HTTP_TIMEOUT_MS);
  http.addHeader("Content-Type", "application/json");
  if (strlen(API_KEY) > 0) http.addHeader("x-api-key", API_KEY);

  const int code = http.POST((uint8_t *)body, (size_t)len);
  String response = (code > 0) ? http.getString() : String();
  http.end();

  if (code == 201 || code == 200) {
    Serial.printf("[HTTP] OK %d  %s\n", code, response.c_str());
    return SendResult::Ok;
  }

  if (code <= 0) {
    Serial.printf("[HTTP] gagal terhubung ke server: %s\n", HTTPClient::errorToString(code).c_str());
    return SendResult::RetryLater;
  }

  Serial.printf("[HTTP] ditolak server (%d): %s\n", code, response.c_str());
  // 5xx, 408, 429 = masalah sementara → coba lagi nanti.
  // 4xx lain (401 kunci salah, 422 data tidak valid) = tidak akan berhasil bila diulang.
  if (code >= 500 || code == 408 || code == 429) return SendResult::RetryLater;
  return SendResult::Rejected;
}

// Kirim antrean dari yang tertua. Berhenti pada kegagalan sementara.
static void flushQueue() {
  uint8_t sentThisRound = 0;

  while (queueCount > 0 && WiFi.status() == WL_CONNECTED) {
    const SendResult result = postReading(queueBuf[queueHead]);

    if (result == SendResult::Ok) {
      lastSuccessMs = millis();
      queuePop();
    } else if (result == SendResult::Rejected) {
      Serial.println(F("[QUEUE] data dibuang karena ditolak permanen oleh server"));
      queuePop();
    } else {
      break;  // coba lagi pada siklus berikutnya
    }

    // Batasi per siklus agar loop tetap responsif saat mengosongkan antrean panjang.
    if (++sentThisRound >= 10) break;
    delay(50);
  }

  if (queueCount > 0) {
    Serial.printf("[QUEUE] %u data menunggu terkirim\n", (unsigned)queueCount);
  }
}

// ---------------------------------------------------------------------
// Sensor
// ---------------------------------------------------------------------
static bool readSensor(Reading &out) {
  // DHT22 kadang gagal sesaat; coba beberapa kali dengan jeda >= 2 detik.
  for (uint8_t attempt = 1; attempt <= 3; attempt++) {
    const float h = dht.readHumidity();
    const float t = dht.readTemperature();  // °C

    if (!isnan(h) && !isnan(t) && h >= 0.0f && h <= 100.0f && t >= -40.0f && t <= 80.0f) {
      out.temperature = t;
      out.humidity = h;
      out.measuredMs = millis();
      consecutiveSensorFailures = 0;
      return true;
    }
    Serial.printf("[DHT22] pembacaan gagal (percobaan %u/3)\n", attempt);
    delay(2100);
  }

  consecutiveSensorFailures++;
  Serial.println(F("[DHT22] sensor tidak terbaca. Periksa kabel: + → 3V3, OUT → GPIO, - → GND."));
  return false;
}

// ---------------------------------------------------------------------
void setup() {
  Serial.begin(115200);
  delay(500);
  Serial.println();
  Serial.println(F("=== ESP32 Environmental Monitoring ==="));
  Serial.printf("Device ID : %s\nAPI URL   : %s\nInterval  : %lu ms\n", DEVICE_ID, API_URL, (unsigned long)SEND_INTERVAL_MS);

  dht.begin();
  startWiFi();

  lastSuccessMs = millis();
  // Jadwalkan pembacaan pertama langsung setelah DHT22 siap (~2 detik).
  lastSampleMs = millis() - SEND_INTERVAL_MS + 2000UL;
}

void loop() {
  maintainWiFi();

  if (millis() - lastSampleMs >= SEND_INTERVAL_MS) {
    lastSampleMs = millis();

    Reading r;
    if (readSensor(r)) {
      Serial.printf("[DHT22] suhu=%.1f °C  kelembapan=%.1f %%\n", r.temperature, r.humidity);
      queuePush(r);
    }
  }

  if (queueCount > 0 && WiFi.status() == WL_CONNECTED) {
    flushQueue();
  }

#if RESTART_IF_NO_SUCCESS_MS > 0
  if (millis() - lastSuccessMs > RESTART_IF_NO_SUCCESS_MS) {
    Serial.println(F("[SYS] tidak ada pengiriman berhasil terlalu lama, restart ..."));
    delay(200);
    ESP.restart();
  }
#endif

  delay(50);
}