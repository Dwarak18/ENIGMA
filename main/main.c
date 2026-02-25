/**
 * @file main.c
 * @brief ENIGMA Firmware – main application entry point
 *
 * System flow (every ENTROPY_INTERVAL_MS):
 *   1. Collect entropy bytes (hardware TRNG)
 *   2. Compute SHA-256(entropy || timestamp)
 *   3. Sign hash with device private key → raw 64-byte ECDSA sig
 *   4. POST JSON payload to backend via HTTPS
 *   5. Sleep and repeat
 *
 * The first iteration also includes the public key in the payload
 * so the backend can cache it for future verification.
 */

#include "config.h"
#include "entropy.h"
#include "crypto.h"
#include "storage.h"
#include "network.h"

#include "esp_log.h"
#include "esp_timer.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "nvs_flash.h"

#include <string.h>
#include <time.h>
#include <inttypes.h>

static const char *TAG = "main";

/* ══════════════════════════════════════════════════════════════════════ */
/*  Entropy loop task                                                     */
/* ══════════════════════════════════════════════════════════════════════ */

static void entropy_task(void *pvParam)
{
    (void)pvParam;

    bool pubkey_sent = false;   /* send public key only on first iteration */

    /* Buffers for raw bytes */
    uint8_t entropy_raw[ENTROPY_BYTES];
    uint8_t hash_raw[CRYPTO_HASH_LEN];
    uint8_t sig_raw[CRYPTO_SIG_LEN];
    uint8_t pub_raw[CRYPTO_PUBKEY_LEN];

    /* Hex string buffers (null-terminated) */
    char hash_hex[CRYPTO_HASH_LEN * 2 + 1];
    char sig_hex [CRYPTO_SIG_LEN  * 2 + 1];
    char pub_hex [CRYPTO_PUBKEY_LEN * 2 + 1];

    for (;;) {
        int64_t cycle_start = esp_timer_get_time();

        /* ── 1. Collect entropy ────────────────────────────────────── */
        entropy_collect(entropy_raw, ENTROPY_BYTES);

        /* ── 2. Timestamp ──────────────────────────────────────────── */
        time_t now = 0;
        time(&now);
        uint64_t timestamp = (uint64_t)now;

        if (timestamp < 1700000000ULL) {
            ESP_LOGW(TAG, "Clock not synced yet, skipping cycle");
            vTaskDelay(pdMS_TO_TICKS(ENTROPY_INTERVAL_MS));
            continue;
        }

        /* ── 3. Hash ───────────────────────────────────────────────── */
        if (crypto_hash(entropy_raw, ENTROPY_BYTES, timestamp, hash_raw) != ESP_OK) {
            ESP_LOGE(TAG, "Hash failed");
            goto sleep;
        }
        crypto_bytes_to_hex(hash_raw, CRYPTO_HASH_LEN, hash_hex);

        /* ── 4. Sign ───────────────────────────────────────────────── */
        if (sign_hash(hash_raw, sig_raw) != ESP_OK) {
            ESP_LOGE(TAG, "Sign failed");
            goto sleep;
        }
        crypto_bytes_to_hex(sig_raw, CRYPTO_SIG_LEN, sig_hex);

        /* ── 5. Public key (first iteration only) ──────────────────── */
        const char *pubkey_arg = NULL;
        if (!pubkey_sent) {
            if (crypto_get_pubkey(pub_raw) == ESP_OK) {
                crypto_bytes_to_hex(pub_raw, CRYPTO_PUBKEY_LEN, pub_hex);
                pubkey_arg = pub_hex;
            }
        }

        ESP_LOGI(TAG, "hash=%.*s... ts=%" PRIu64, 16, hash_hex, timestamp);

        /* ── 6. POST to backend ────────────────────────────────────── */
        esp_err_t err = network_post_entropy(timestamp, hash_hex, sig_hex, pubkey_arg);
        if (err == ESP_OK) {
            pubkey_sent = true;
        } else {
            ESP_LOGW(TAG, "POST failed, will retry next cycle");
        }

sleep:
        /* ── 7. Sleep for remainder of interval ────────────────────── */
        int64_t elapsed_us = esp_timer_get_time() - cycle_start;
        int64_t sleep_us   = (int64_t)ENTROPY_INTERVAL_MS * 1000LL - elapsed_us;
        if (sleep_us > 0) {
            vTaskDelay(pdMS_TO_TICKS(sleep_us / 1000));
        }
    }
}

/* ══════════════════════════════════════════════════════════════════════ */
/*  app_main                                                              */
/* ══════════════════════════════════════════════════════════════════════ */

void app_main(void)
{
    ESP_LOGI(TAG, "ENIGMA Firmware starting...");

    /* ── 1. NVS ────────────────────────────────────────────────────── */
    ESP_ERROR_CHECK(storage_init());

    /* ── 2. Network ─────────────────────────────────────────────────── */
    ESP_ERROR_CHECK(network_wifi_connect());
    ESP_ERROR_CHECK(network_sntp_sync());

    /* ── 3. Crypto ──────────────────────────────────────────────────── */
    ESP_ERROR_CHECK(crypto_init());

    /* ── 4. Start entropy loop ──────────────────────────────────────── */
    xTaskCreate(entropy_task, "entropy_task",
                MAIN_TASK_STACK, NULL, 5, NULL);

    ESP_LOGI(TAG, "ENIGMA operational – emitting signed entropy every %ds",
             ENTROPY_INTERVAL_MS / 1000);
}
