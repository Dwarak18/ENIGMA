/**
 * @file storage.c
 * @brief NVS storage implementation (with encryption support)
 */

#include "storage.h"
#include "config.h"
#include "nvs_flash.h"
#include "nvs.h"
#include "esp_log.h"

static const char *TAG = "storage";

esp_err_t storage_init(void)
{
    esp_err_t err = nvs_flash_init();

    if (err == ESP_ERR_NVS_NO_FREE_PAGES ||
        err == ESP_ERR_NVS_NEW_VERSION_FOUND) {
        /* NVS partition was truncated / version mismatch – erase and retry */
        ESP_LOGW(TAG, "Erasing NVS partition...");
        ESP_ERROR_CHECK(nvs_flash_erase());
        err = nvs_flash_init();
    }

    ESP_RETURN_ON_ERROR(err, TAG, "nvs_flash_init failed");
    ESP_LOGI(TAG, "NVS initialized");
    return ESP_OK;
}

esp_err_t storage_save_blob(const char *key, const uint8_t *data, size_t len)
{
    nvs_handle_t handle;
    esp_err_t err;

    err = nvs_open(NVS_NAMESPACE, NVS_READWRITE, &handle);
    ESP_RETURN_ON_ERROR(err, TAG, "nvs_open failed");

    err = nvs_set_blob(handle, key, data, len);
    if (err == ESP_OK) err = nvs_commit(handle);
    nvs_close(handle);

    ESP_RETURN_ON_ERROR(err, TAG, "nvs_set_blob/commit failed for key=%s", key);
    ESP_LOGI(TAG, "Saved blob key=%s len=%zu", key, len);
    return ESP_OK;
}

esp_err_t storage_load_blob(const char *key, uint8_t *data, size_t *len_out)
{
    nvs_handle_t handle;
    esp_err_t err;

    err = nvs_open(NVS_NAMESPACE, NVS_READONLY, &handle);
    if (err != ESP_OK) return err; /* namespace may not exist yet */

    err = nvs_get_blob(handle, key, data, len_out);
    nvs_close(handle);

    if (err == ESP_ERR_NVS_NOT_FOUND) {
        ESP_LOGD(TAG, "Key not found: %s", key);
        return err;
    }

    ESP_RETURN_ON_ERROR(err, TAG, "nvs_get_blob failed for key=%s", key);
    ESP_LOGI(TAG, "Loaded blob key=%s len=%zu", key, *len_out);
    return ESP_OK;
}
