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
#define WIFI_SSID              "YOUR_SSID"
#define WIFI_PASSWORD          "YOUR_PASSWORD"
#define WIFI_MAX_RETRY         10

/* ── Backend Endpoint ────────────────────────────────── */
#define BACKEND_HOST           "https://your-backend.example.com"
#define BACKEND_ENTROPY_PATH   "/api/v1/entropy"
#define HTTP_TIMEOUT_MS        10000

/* ── Timing ──────────────────────────────────────────── */
#define ENTROPY_INTERVAL_MS    10000   /* 10 seconds */
#define SNTP_SYNC_TIMEOUT_MS   15000

/* ── SNTP ─────────────────────────────────────────────── */
#define SNTP_SERVER_0          "pool.ntp.org"
#define SNTP_SERVER_1          "time.google.com"

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
