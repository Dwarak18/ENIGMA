/**
 * @file ota_handler.c
 * @brief OTA update safety mechanism with WebSocket pause/resume
 */

#include "ota_handler.h"
#include "websocket_client.h"
#include "esp_log.h"
#include "esp_ota_ops.h"
#include "esp_app_format.h"

#include <stdbool.h>

static const char *TAG = "ota_handler";

/* ── State ──────────────────────────────────────────────────────────– */
static bool s_ota_in_progress = false;
static bool s_ota_occurred = false;

/* ── Initialization ────────────────────────────────────────────────– */

esp_err_t ota_handler_init(void) {
    ESP_LOGI(TAG, "OTA handler initialized");
    return ESP_OK;
}

/* ── OTA lifecycle ────────────────────────────────────────────────── */

void ota_handler_begin(void) {
    if (s_ota_in_progress) {
        ESP_LOGW(TAG, "OTA already in progress");
        return;
    }
    
    s_ota_in_progress = true;
    ESP_LOGI(TAG, "OTA update starting – pausing WebSocket");
    
    /* Pause WebSocket to prevent chunk uploads during firmware replacement */
    websocket_pause();
    
    /* Optional: Stop entropy task if needed
     * For now, let entropy task continue (but WebSocket is blocked)
     */
}

void ota_handler_complete(void) {
    if (!s_ota_in_progress) {
        ESP_LOGW(TAG, "OTA complete but was not in progress");
        return;
    }
    
    s_ota_in_progress = false;
    s_ota_occurred = true;
    ESP_LOGI(TAG, "OTA update complete – rebooting soon");
}

/* ── Post-OTA validation ────────────────────────────────────────────– */

esp_err_t ota_handler_validate_and_resume(void) {
    if (!s_ota_occurred) {
        /* Normal boot, not after OTA */
        return ESP_OK;
    }
    
    ESP_LOGI(TAG, "Post-OTA boot detected – validating app");
    
    /* 1. Get the current running partition */
    const esp_partition_t *running = esp_ota_get_running_partition();
    if (!running) {
        ESP_LOGE(TAG, "Failed to get running partition");
        return ESP_FAIL;
    }
    
    ESP_LOGI(TAG, "Running partition: %s", running->label);
    
    /* 2. Mark OTA as valid (prevents rollback on next boot) */
    esp_err_t ret = esp_ota_mark_app_valid_cancel_rollback();
    if (ret != ESP_OK) {
        ESP_LOGE(TAG, "Failed to mark app valid: %s", esp_err_to_name(ret));
        return ret;
    }
    
    ESP_LOGI(TAG, "OTA validation successful – app is now permanent");
    
    /* 3. Resume WebSocket streaming */
    websocket_resume();
    ESP_LOGI(TAG, "WebSocket streaming resumed");
    
    s_ota_occurred = false;
    
    return ESP_OK;
}

bool ota_handler_is_ota_in_progress(void) {
    return s_ota_in_progress;
}
