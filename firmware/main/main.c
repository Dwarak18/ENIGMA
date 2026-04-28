/**
 * @file main.c
 * @brief ENIGMA firmware entry point – ESP32-S3 Crypto Coprocessor
 *
 * Pipeline:
 *   1. Collect ESP32 hardware RNG entropy.
 *   2. Derive AES-128 key from device_id + timestamp + server_seed.
 *   3. Encrypt entropy with AES-128-CTR.
 *   4. Hash (entropy || timestamp || device_id).
 *   5. Sign hash with ECDSA (secp256r1).
 *   6. POST to backend.
 */

#include "config.h"
#include "crypto.h"
#include "entropy.h"
#include "network.h"
#include "storage.h"

#include "esp_log.h"
#include "esp_timer.h"
#include "esp_random.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"

#include <inttypes.h>
#include <stdbool.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>

static const char *TAG = "main";

static void time_print_task(void *pvParam)
{
    for (;;) {
        time_t now = 0;
        struct tm local;
        time(&now);
        localtime_r(&now, &local);
        ESP_LOGI(TAG, "System time: %04d-%02d-%02d %02d:%02d:%02d",
                 local.tm_year + 1900, local.tm_mon + 1, local.tm_mday,
                 local.tm_hour, local.tm_min, local.tm_sec);
        vTaskDelay(pdMS_TO_TICKS(10000));
    }
}

static void entropy_task(void *pvParam)
{
    bool pubkey_sent = false;

    uint8_t entropy_raw[ENTROPY_BYTES];
    uint8_t aes_key[CRYPTO_AES_KEY_LEN];
    uint8_t iv_orig[CRYPTO_IV_LEN];
    uint8_t iv_work[CRYPTO_IV_LEN];
    uint8_t ciphertext[ENTROPY_BYTES];
    uint8_t hash_raw[CRYPTO_HASH_LEN];
    uint8_t sig_raw[CRYPTO_SIG_LEN];
    uint8_t pub_raw[CRYPTO_PUBKEY_LEN];

    char hash_hex[CRYPTO_HASH_LEN * 2 + 1];
    char sig_hex[CRYPTO_SIG_LEN * 2 + 1];
    char pub_hex[CRYPTO_PUBKEY_LEN * 2 + 1];
    char iv_hex[CRYPTO_IV_LEN * 2 + 1];
    char cipher_hex[ENTROPY_BYTES * 2 + 1];
    char rtc_time_str[20];

    ESP_LOGI(TAG, "Entropy task started");

    for (;;) {
        int64_t cycle_start = esp_timer_get_time();

        time_t now = 0;
        time(&now);
        if ((uint64_t)now < 1700000000ULL) {
            ESP_LOGW(TAG, "Clock not synced; waiting...");
            vTaskDelay(pdMS_TO_TICKS(2000));
            continue;
        }

        struct tm local;
        localtime_r(&now, &local);
        strftime(rtc_time_str, sizeof(rtc_time_str), "%H:%M:%S", &local);

        /* 1. Collect Entropy */
        entropy_collect(entropy_raw, sizeof(entropy_raw));

        /* 2. Derive AES Key */
        uint64_t timestamp = (uint64_t)now;
        crypto_derive_aes_key(DEVICE_ID, timestamp, SERVER_SEED, aes_key);

        /* 3. Encrypt Entropy (AES-128-CTR) */
        esp_fill_random(iv_orig, CRYPTO_IV_LEN);
        memcpy(iv_work, iv_orig, CRYPTO_IV_LEN);
        crypto_aes_encrypt_ctr(entropy_raw, sizeof(entropy_raw), aes_key, iv_work, ciphertext);

        /* 4. Hash */
        if (crypto_hash(entropy_raw, sizeof(entropy_raw), timestamp, DEVICE_ID, hash_raw) != ESP_OK) {
            ESP_LOGE(TAG, "Hash failed");
            goto sleep;
        }

        /* 5. Sign Hash */
        if (sign_hash(hash_raw, sig_raw) != ESP_OK) {
            ESP_LOGE(TAG, "Signature failed");
            goto sleep;
        }

        /* 6. Convert to Hex */
        crypto_bytes_to_hex(hash_raw, sizeof(hash_raw), hash_hex);
        crypto_bytes_to_hex(sig_raw,  sizeof(sig_raw),  sig_hex);
        crypto_bytes_to_hex(iv_orig,  sizeof(iv_orig),  iv_hex);
        crypto_bytes_to_hex(ciphertext, sizeof(ciphertext), cipher_hex);

        const char *pubkey_arg = NULL;
        if (!pubkey_sent && crypto_get_pubkey(pub_raw) == ESP_OK) {
            crypto_bytes_to_hex(pub_raw, sizeof(pub_raw), pub_hex);
            pubkey_arg = pub_hex;
        }

        ESP_LOGI(TAG, "Posting: ts=%" PRIu64 " hash=%.8s... cipher=%.8s...",
                 timestamp, hash_hex, cipher_hex);

        esp_err_t err = network_post_entropy(timestamp,
                                             hash_hex,
                                             sig_hex,
                                             pubkey_arg,
                                             rtc_time_str,
                                             cipher_hex,
                                             iv_hex,
                                             NULL, NULL, NULL);
        if (err == ESP_OK) {
            pubkey_sent = true;
            ESP_LOGI(TAG, "POST successful");
        } else {
            ESP_LOGW(TAG, "POST failed: %s", esp_err_to_name(err));
        }

sleep:
        {
            int64_t elapsed_us = esp_timer_get_time() - cycle_start;
            int64_t sleep_us = (int64_t)ENTROPY_INTERVAL_MS * 1000LL - elapsed_us;
            if (sleep_us > 0) {
                vTaskDelay(pdMS_TO_TICKS(sleep_us / 1000));
            } else {
                vTaskDelay(1); // Yield
            }
        }
    }
}

void app_main(void)
{
    ESP_LOGI(TAG, "ENIGMA Crypto Coprocessor starting");

    ESP_ERROR_CHECK(storage_init());
    ESP_ERROR_CHECK(network_wifi_connect());
    ESP_ERROR_CHECK(network_sntp_sync());

    setenv("TZ", "IST-5:30", 1);
    tzset();

    ESP_ERROR_CHECK(crypto_init());

    xTaskCreate(time_print_task, "time_print", 2048, NULL, 4, NULL);
    xTaskCreate(entropy_task, "entropy_task", MAIN_TASK_STACK, NULL, 5, NULL);
}
