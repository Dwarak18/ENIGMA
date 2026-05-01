/**
 * @file ntp.h
 * @brief SNTP time synchronization interface.
 */

#pragma once

#include "esp_err.h"
#include <stdint.h>

/**
 * @brief Sync system time from SNTP server pool.ntp.org.
 *
 * @param timeout_ms Sync timeout in milliseconds
 * @return ESP_OK on success
 */
esp_err_t ntp_sync_time(uint32_t timeout_ms);

/**
 * @brief Get current UNIX timestamp in seconds.
 *
 * @return Timestamp, or 0 if clock not synced
 */
uint64_t get_current_timestamp(void);

