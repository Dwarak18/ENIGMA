/**
 * @file rtc.h
 * @brief DS3231 RTC interface over I2C.
 */

#pragma once

#include "esp_err.h"
#include <stdint.h>
#include <stddef.h>

/**
 * @brief Initialize DS3231 I2C bus.
 */
esp_err_t rtc_init(void);

/**
 * @brief Read RTC time and return UNIX timestamp.
 *
 * @return UNIX timestamp, or 0 on failure.
 */
uint64_t get_rtc_timestamp(void);

/**
 * @brief Read RTC time and return formatted timestamp.
 *
 * Format: YYYY-MM-DD HH:MM:SS
 */
esp_err_t rtc_get_timestamp_string(char *out, size_t out_len);

