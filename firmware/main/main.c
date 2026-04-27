/**
 * @file main.c
 * @brief ENIGMA firmware entry point for signed entropy emission.
 *
 * Runtime flow:
 *   1. Initialize NVS.
 *   2. Connect to Wi-Fi and sync system time with SNTP.
 *   3. Initialize the software ECDSA keypair.
 *   4. Every ENTROPY_INTERVAL_MS:
 *      - collect ESP32-S3 hardware RNG bytes,
 *      - hash entropy || timestamp,
 *      - sign the hash,
 *      - POST the payload to the backend.
 */

#include "config.h"
#include "crypto.h"
#include "entropy.h"
#include "network.h"
#include "storage.h"

#include "esp_log.h"
#include "esp_timer.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"

#include <inttypes.h>
#include <stdbool.h>
#include <stdlib.h>
#include <time.h>

static const char *TAG = "main";

static void time_print_task(void *pvParam)
{
    (void)pvParam;

    for (;;) {
        time_t now = 0;
        struct tm local;

        time(&now);
        localtime_r(&now, &local);

        ESP_LOGI(TAG, "IST time %04d-%02d-%02d %02d:%02d:%02d",
                 local.tm_year + 1900, local.tm_mon + 1, local.tm_mday,
                 local.tm_hour, local.tm_min, local.tm_sec);

        vTaskDelay(pdMS_TO_TICKS(1000));
    }
}

static void entropy_task(void *pvParam)
{
    (void)pvParam;

    bool pubkey_sent = false;

    uint8_t entropy_raw[ENTROPY_BYTES];
    uint8_t hash_raw[CRYPTO_HASH_LEN];
    uint8_t sig_raw[CRYPTO_SIG_LEN];
    uint8_t pub_raw[CRYPTO_PUBKEY_LEN];

    char hash_hex[CRYPTO_HASH_LEN * 2 + 1];
    char sig_hex[CRYPTO_SIG_LEN * 2 + 1];
    char pub_hex[CRYPTO_PUBKEY_LEN * 2 + 1];
    char rtc_time_str[20];

    for (;;) {
        int64_t cycle_start = esp_timer_get_time();

        time_t now = 0;
        struct tm local;

        time(&now);
        if ((uint64_t)now < 1700000000ULL) {
            ESP_LOGW(TAG, "Clock is not synced yet; skipping entropy cycle");
            vTaskDelay(pdMS_TO_TICKS(ENTROPY_INTERVAL_MS));
            continue;
        }

        localtime_r(&now, &local);
        strftime(rtc_time_str, sizeof(rtc_time_str), "%H:%M:%S", &local);

        entropy_collect(entropy_raw, sizeof(entropy_raw));

        uint64_t timestamp = (uint64_t)now;
        if (crypto_hash(entropy_raw, sizeof(entropy_raw), timestamp, hash_raw) != ESP_OK) {
            ESP_LOGE(TAG, "Hash failed");
            goto sleep;
        }
        crypto_bytes_to_hex(hash_raw, sizeof(hash_raw), hash_hex);

        if (sign_hash(hash_raw, sig_raw) != ESP_OK) {
            ESP_LOGE(TAG, "Signature failed");
            goto sleep;
        }
        crypto_bytes_to_hex(sig_raw, sizeof(sig_raw), sig_hex);

        const char *pubkey_arg = NULL;
        if (!pubkey_sent && crypto_get_pubkey(pub_raw) == ESP_OK) {
            crypto_bytes_to_hex(pub_raw, sizeof(pub_raw), pub_hex);
            pubkey_arg = pub_hex;
        }

        ESP_LOGI(TAG, "Posting entropy ts=%" PRIu64 " hash=%.16s... time=%s",
                 timestamp, hash_hex, rtc_time_str);

        esp_err_t err = network_post_entropy(timestamp,
                                             hash_hex,
                                             sig_hex,
                                             pubkey_arg,
                                             rtc_time_str,
                                             NULL,
                                             NULL,
                                             NULL,
                                             NULL,
                                             NULL);
        if (err == ESP_OK) {
            pubkey_sent = true;
        } else {
            ESP_LOGW(TAG, "POST failed: %s", esp_err_to_name(err));
        }

sleep:
        int64_t elapsed_us = esp_timer_get_time() - cycle_start;
        int64_t sleep_us = (int64_t)ENTROPY_INTERVAL_MS * 1000LL - elapsed_us;
        if (sleep_us > 0) {
            vTaskDelay(pdMS_TO_TICKS(sleep_us / 1000));
        }
    }
}

void app_main(void)
{
    ESP_LOGI(TAG, "ENIGMA firmware starting");

    ESP_ERROR_CHECK(storage_init());
    ESP_ERROR_CHECK(network_wifi_connect());
    ESP_ERROR_CHECK(network_sntp_sync());

    setenv("TZ", "IST-5:30", 1);
    tzset();
    ESP_LOGI(TAG, "Timezone set to IST");

    ESP_ERROR_CHECK(crypto_init());

    xTaskCreate(time_print_task, "time_print", 2048, NULL, 4, NULL);
    xTaskCreate(entropy_task, "entropy_task", MAIN_TASK_STACK, NULL, 5, NULL);

    ESP_LOGI(TAG, "Operational; emitting signed entropy every %d seconds",
             ENTROPY_INTERVAL_MS / 1000);
}
