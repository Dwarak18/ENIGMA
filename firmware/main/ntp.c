/**
 * @file ntp.c
 * @brief SNTP implementation using lwIP/ESP-IDF.
 */

#include "ntp.h"

#include "esp_log.h"
#include "esp_sntp.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"

#include <time.h>

static const char *TAG = "ntp";

esp_err_t ntp_sync_time(uint32_t timeout_ms)
{
    ESP_LOGI(TAG, "Starting SNTP sync with pool.ntp.org");

    esp_sntp_setoperatingmode(SNTP_OPMODE_POLL);
    esp_sntp_setservername(0, "pool.ntp.org");
    esp_sntp_init();

    uint32_t elapsed_ms = 0;
    while (sntp_get_sync_status() == SNTP_SYNC_STATUS_RESET) {
        vTaskDelay(pdMS_TO_TICKS(500));
        elapsed_ms += 500;
        if (elapsed_ms >= timeout_ms) {
            ESP_LOGE(TAG, "SNTP sync timeout");
            return ESP_ERR_TIMEOUT;
        }
    }

    time_t now = time(NULL);
    ESP_LOGI(TAG, "NTP sync complete. unix=%lld", (long long)now);
    return ESP_OK;
}

uint64_t get_current_timestamp(void)
{
    time_t now = time(NULL);
    if (now <= 0) {
        return 0;
    }
    return (uint64_t)now;
}

