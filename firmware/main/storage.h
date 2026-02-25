/**
 * @file storage.h
 * @brief NVS (Non-Volatile Storage) abstraction for persistent key storage
 */

#pragma once
#include "esp_err.h"
#include <stdint.h>
#include <stddef.h>

/**
 * @brief Initialise the NVS partition.
 * Must be called once before any other storage functions.
 */
esp_err_t storage_init(void);

/**
 * @brief Persist a binary blob under @p key in the ENIGMA NVS namespace.
 *
 * @param key   NVS key string (max 15 chars)
 * @param data  Data to store
 * @param len   Length of data
 * @return ESP_OK on success, ESP_ERR_* on failure
 */
esp_err_t storage_save_blob(const char *key, const uint8_t *data, size_t len);

/**
 * @brief Load a binary blob from NVS.
 *
 * @param key      NVS key string
 * @param data     Output buffer
 * @param len_out  In: buffer capacity; Out: actual bytes read
 * @return ESP_OK if found, ESP_ERR_NVS_NOT_FOUND if missing
 */
esp_err_t storage_load_blob(const char *key, uint8_t *data, size_t *len_out);
