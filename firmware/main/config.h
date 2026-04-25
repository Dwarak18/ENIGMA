/**
 * @file config.h
 * @brief ENIGMA firmware configuration constants
 *
 * Edit this file to match your deployment environment.
 * Never commit real credentials to source control.
 */

#pragma once

/* ── Device Identity ─────────────────────────────────── */
#define DEVICE_ID              "esp32-001"

/* ── Wi-Fi Credentials ───────────────────────────────── */
#define WIFI_SSID              "LAPTOP-TGOIA7MG"       /* ← fill in your WiFi name */
#define WIFI_PASSWORD          "31053105"   /* ← fill in your WiFi password */
#define WIFI_MAX_RETRY         10

/* ── Backend Endpoint ────────────────────────────────── */
/* Your PC's WiFi IP – ESP32 posts to nginx on port 80   */
#define BACKEND_HOST           "http://172.20.137.1"
#define BACKEND_ENTROPY_PATH   "/api/v1/entropy"
#define BACKEND_WEBSOCKET_URI  "ws://172.20.137.1:3000"
#define HTTP_TIMEOUT_MS        10000

/* ── Timing ──────────────────────────────────────────── */
#define ENTROPY_INTERVAL_MS    10000   /* 10 seconds */
#define SNTP_SYNC_TIMEOUT_MS   15000

/* ── SNTP ─────────────────────────────────────────────── */
/* Primary: Google public NTP (high accuracy, anycast)                  */
/* Fallback servers guarantee sync even if Google NTP is unreachable.   */
#define SNTP_SERVER_0          "time.google.com"
#define SNTP_SERVER_1          "in.pool.ntp.org"
#define SNTP_SERVER_2          "pool.ntp.org"

/* IST = UTC + 5 h 30 min = 19 800 seconds */
#define IST_OFFSET_SECS        19800

/* ── I2C – DS3231 RTC ────────────────────────────────── */
/* Change these two values to match your actual wiring.  */
#define I2C_RTC_SCL_GPIO       17
#define I2C_RTC_SDA_GPIO       18

/* ── NVS ──────────────────────────────────────────────── */
#define NVS_NAMESPACE          "enigma"
#define NVS_KEY_PRIVKEY        "ecdsa_priv"
#define NVS_KEY_PUBKEY         "ecdsa_pub"

/* ── Entropy ──────────────────────────────────────────── */
#define ENTROPY_BYTES          64      /* bytes of raw entropy collected */

/* ── Crypto ───────────────────────────────────────────── */
#define HASH_BYTES             32      /* SHA-256 output  */
#define SIG_BYTES              64      /* raw ECDSA r||s  */
#define PUBKEY_BYTES           65      /* 0x04 || X || Y  */
#define PRIVKEY_BYTES          32

/* ── Stack Sizes ─────────────────────────────────────── */
#define MAIN_TASK_STACK        8192
#define NET_TASK_STACK         6144

/* ── Replay-attack window ────────────────────────────── */
#define MAX_TIMESTAMP_SKEW_S   60
