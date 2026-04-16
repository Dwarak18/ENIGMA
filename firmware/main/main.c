/**
 * @file main.c
 * @brief ENIGMA Firmware – main application entry point
 *
 * System flow (every ENTROPY_INTERVAL_MS):
 *   1. Collect entropy bytes (hardware TRNG)
 *   2. Read DS3231 RTC time (HH:MM:SS) for payload enrichment
 *   3. Compute SHA-256(entropy || timestamp)
 *   4. Sign hash with device private key → raw 64-byte ECDSA sig
 *   5. POST JSON payload to backend via HTTP
 *   6. Sleep and repeat
 *
 * The first iteration also includes the public key in the payload
 * so the backend can cache it for future verification.
 * The DS3231 RTC time is included in every payload as `rtc_time`.
 */

#include "config.h"
#include "entropy.h"
#include "crypto.h"
#include "storage.h"
#include "network.h"
#include "rtc.h"
#include "websocket_client.h"
#include "ota_handler.h"

#if CAMERA_ENABLED
#include "camera.h"
#include "aes_encryption.h"
#include "image_chunking.h"
#endif

#include "esp_log.h"
#include "esp_timer.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "nvs_flash.h"

#include <string.h>
#include <time.h>
#include <stdlib.h>
#include <inttypes.h>

static const char *TAG = "main";

/* ══════════════════════════════════════════════════════════════════════ */
/*  OTA event handler – pause/resume WebSocket during firmware updates    */
/* ══════════════════════════════════════════════════════════════════════ */

static void ota_event_handler(void *arg, esp_event_base_t event_base,
                              int32_t event_id, void *event_data)
{
    (void)arg;
    (void)event_data;
    
    if (event_base == ESP_HTTPS_OTA_EVENT) {
        switch ((esp_https_ota_event_t)event_id) {
            case ESP_HTTPS_OTA_START:
                ESP_LOGI(TAG, "OTA update started");
                ota_handler_begin();
                break;
                
            case ESP_HTTPS_OTA_CONNECTED:
                ESP_LOGI(TAG, "Connected to OTA server");
                break;
                
            case ESP_HTTPS_OTA_GET_IMG_DESC:
                ESP_LOGI(TAG, "Got image descriptor");
                break;
                
            case ESP_HTTPS_OTA_FILE_UPDATED:
                ESP_LOGI(TAG, "OTA file updated, preparing to reboot...");
                ota_handler_complete();
                break;
                
            case ESP_HTTPS_OTA_FINISH:
                ESP_LOGI(TAG, "OTA finished");
                break;
                
            case ESP_HTTPS_OTA_FAILED:
                ESP_LOGE(TAG, "OTA failed, will stop pausing WebSocket");
                websocket_resume();  /* Resume on failure */
                break;
                
            default:
                break;
        }
    }
}

/* ══════════════════════════════════════════════════════════════════════ */
/*  IST time-print task (every 1 s, runs after Wi-Fi is off)             */
/* ══════════════════════════════════════════════════════════════════════ */

static void time_print_task(void *pvParam)
{
    (void)pvParam;
    for (;;) {
        time_t now;
        struct tm local;
        time(&now);
        localtime_r(&now, &local);
        printf("IST TIME  %02d:%02d:%02d  %02d-%02d-%04d\n",
               local.tm_hour, local.tm_min, local.tm_sec,
               local.tm_mday, local.tm_mon + 1, local.tm_year + 1900);
        vTaskDelay(pdMS_TO_TICKS(1000));
    }
}

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

    /* DS3231 RTC time string "HH:MM:SS" */
    char rtc_time_str[20];

#if CAMERA_ENABLED
    /* Camera bitstream buffers */
    uint8_t image_bits[16];      /* 128 bits = 16 bytes */
    uint8_t image_encrypted[32]; /* AES ciphertext (max 32 bytes) */
    uint8_t image_iv[16];        /* AES IV */
    uint8_t image_hash[32];      /* SHA-256 of original bits */
    size_t  image_bits_len = 0;
    size_t  image_encrypted_len = 0;
    
    char image_bits_hex[33];
    char image_encrypted_hex[65];
    char image_iv_hex[33];
    char image_hash_hex[65];
#endif

    for (;;) {
        int64_t cycle_start = esp_timer_get_time();

        /* ── 1. Collect entropy ────────────────────────────────────── */
        entropy_collect(entropy_raw, ENTROPY_BYTES);

        /* ── 2. DS3231 RTC time (for payload enrichment) ──────────── */
        rtc_get_time(rtc_time_str);
        ESP_LOGI(TAG, "DS3231 time: %s", rtc_time_str);

        /* ── 3. SNTP Timestamp ─────────────────────────────────────── */
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

#if CAMERA_ENABLED
        /* ── 6. Image chunking: Encrypt frame and compute integrity hash ─ */
        image_chunk_t img_chunk;
        if (image_chunking_process_frame(entropy_raw, timestamp, DEVICE_ID, &img_chunk) == ESP_OK) {
            /* ── 7. Send image chunk via WebSocket ──────────────── */
            websocket_chunk_t ws_chunk;
            strncpy(ws_chunk.device_id, DEVICE_ID, sizeof(ws_chunk.device_id) - 1);
            ws_chunk.device_id[sizeof(ws_chunk.device_id) - 1] = '\0';
            ws_chunk.timestamp = timestamp;
            ws_chunk.chunk_id = img_chunk.chunk_id;
            ws_chunk.total_chunks = img_chunk.total_chunks;
            memcpy(ws_chunk.iv, img_chunk.iv, 16);
            ws_chunk.encrypted_data_len = img_chunk.encrypted_len;
            memcpy(ws_chunk.encrypted_data, img_chunk.encrypted_data, img_chunk.encrypted_len);
            strncpy(ws_chunk.hash, img_chunk.hash, sizeof(ws_chunk.hash) - 1);
            ws_chunk.hash[sizeof(ws_chunk.hash) - 1] = '\0';
            
            if (websocket_send_image_chunk(&ws_chunk) == ESP_OK) {
                ESP_LOGI(TAG, "Image chunk sent via WebSocket");
            } else {
                ESP_LOGD(TAG, "WebSocket not ready, skipping image stream");
            }
        }
#endif

        ESP_LOGI(TAG, "hash=%.*s... ts=%" PRIu64 " rtc=%s", 16, hash_hex, timestamp, rtc_time_str);

        /* ── 8. POST entropy to backend (existing HTTP for verification) ── */
        esp_err_t err = network_post_entropy(timestamp, hash_hex, sig_hex,
                                             pubkey_arg, rtc_time_str,
                                             NULL, NULL);
        if (err == ESP_OK) {
            pubkey_sent = true;
        } else {
            ESP_LOGW(TAG, "POST failed, will retry next cycle");
        }

sleep:
        /* ── 11. Sleep for remainder of interval ───────────────────── */
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

    /* ── 1.5. OTA handler ──────────────────────────────────────────– */
    /* Check if this is a post-OTA boot and validate/resume */
    ota_handler_init();
    if (ota_handler_validate_and_resume() != ESP_OK) {
        ESP_LOGW(TAG, "OTA validation had issues, but continuing");
    }

    /* ── 2. DS3231 External RTC (init before SNTP to capture pre-sync time) */
    external_rtc_init();

    /* ── PRE-SYNC snapshot ──────────────────────────────────────────── */
    {
        char pre_rtc[20];
        rtc_get_time(pre_rtc);
        time_t pre_sys = 0;
        time(&pre_sys);
        struct tm pre_tm;
        gmtime_r(&pre_sys, &pre_tm);
        ESP_LOGI(TAG, "==========  PRE-SYNC  ==========");
        ESP_LOGI(TAG, "  DS3231 time : %s (IST as stored on chip)", pre_rtc);
        ESP_LOGI(TAG, "  NTP/system  : UTC epoch=%lld  (%04d-%02d-%02d %02d:%02d:%02d UTC)",
                 (long long)pre_sys,
                 pre_tm.tm_year + 1900, pre_tm.tm_mon + 1, pre_tm.tm_mday,
                 pre_tm.tm_hour, pre_tm.tm_min, pre_tm.tm_sec);
    }

    /* ── 3. Network + SNTP ──────────────────────────────────────────── */
    ESP_ERROR_CHECK(network_wifi_connect());
    ESP_ERROR_CHECK(network_sntp_sync());

    /* ── POST-SYNC snapshot (NTP) ───────────────────────────────────── */
    time_t utc_now = 0;
    time(&utc_now);
    {
        time_t ist_now = utc_now + IST_OFFSET_SECS;
        struct tm post_tm;
        gmtime_r(&ist_now, &post_tm);
        ESP_LOGI(TAG, "==========  POST-SYNC (NTP)  ==========");
        ESP_LOGI(TAG, "  NTP/system  : UTC epoch=%lld  IST=%04d-%02d-%02d %02d:%02d:%02d",
                 (long long)utc_now,
                 post_tm.tm_year + 1900, post_tm.tm_mon + 1, post_tm.tm_mday,
                 post_tm.tm_hour, post_tm.tm_min, post_tm.tm_sec);
    }

    /* Push SNTP-synced UTC time into the DS3231 as IST (UTC+5:30).
     * After this call the chip keeps ticking in IST independently.      */
    ESP_LOGI(TAG, "  Writing NTP time to DS3231 as IST...");
    rtc_set_time_from_epoch(utc_now);

    /* ── POST-SYNC snapshot (DS3231 after write) ────────────────────── */
    {
        char post_rtc[20];
        rtc_get_time(post_rtc);
        ESP_LOGI(TAG, "==========  POST-SYNC (DS3231 after write)  ==========");
        ESP_LOGI(TAG, "  DS3231 time : %s (IST just written)", post_rtc);
    }

    /* ── 5. Turn Wi-Fi OFF (no longer needed after SNTP + DS3231 write) */
    network_wifi_disconnect();

    /* ── 6. Set IST timezone so localtime_r returns IST ─────────────── */
    setenv("TZ", "IST-5:30", 1);
    tzset();
    ESP_LOGI(TAG, "Timezone set to IST (UTC+5:30)");

    /* ── 7. Crypto ──────────────────────────────────────────────────── */
    ESP_ERROR_CHECK(crypto_init());

    /* ── 7.5. Register OTA event handler ────────────────────────────────– */
    esp_event_handler_register(ESP_HTTPS_OTA_EVENT, ESP_EVENT_ANY_ID,
                              &ota_event_handler, NULL);
    ESP_LOGI(TAG, "OTA event handler registered");

#if CAMERA_ENABLED
    /* ── 8. Image chunking ──────────────────────────────────────────── */
    if (image_chunking_init() != ESP_OK) {
        ESP_LOGW(TAG, "Image chunking init failed (continuing without WebSocket image stream)");
    } else {
        ESP_LOGI(TAG, "Image chunking initialized");
    }
    
    /* ── 9. WebSocket client ────────────────────────────────────────── */
    if (websocket_init() != ESP_OK) {
        ESP_LOGW(TAG, "WebSocket init failed (falling back to HTTP only)");
    } else {
        ESP_LOGI(TAG, "WebSocket client initialized, connecting to backend");
    }
#endif

    /* ── 10. Camera (kept for backwards compatibility) ── */
    if (camera_init() != ESP_OK) {
        ESP_LOGW(TAG, "Camera init failed (continuing without camera)");
    } else {
        ESP_LOGI(TAG, "Camera initialized successfully");
    }
#else
    /* ── 7. Crypto ──────────────────────────────────────────────────── */
    ESP_ERROR_CHECK(crypto_init());
#endif

    /* ── 11. WebSocket client (even without camera) ──────────────────── */
#if !CAMERA_ENABLED
    if (websocket_init() != ESP_OK) {
        ESP_LOGW(TAG, "WebSocket init failed (falling back to HTTP only)");
    } else {
        ESP_LOGI(TAG, "WebSocket client initialized, connecting to backend");
    }
#endif

    /* ── 12. Start tasks ────────────────────────────────────────────── */
    /* Print IST time every second */
    xTaskCreate(time_print_task, "time_print",
                2048, NULL, 4, NULL);

    /* Entropy collection + signing + HTTP POST */
    xTaskCreate(entropy_task, "entropy_task",
                MAIN_TASK_STACK, NULL, 5, NULL);

    ESP_LOGI(TAG, "ENIGMA operational – emitting signed entropy every %ds",
             ENTROPY_INTERVAL_MS / 1000);
}
