#ifndef RTC_H
#define RTC_H

#include <time.h>
#include "esp_err.h"

/**
 * Initialise I2C bus and DS3231. Run I2C scan. Clear CH (Clock Halt) bit.
 *
 * @return ESP_OK           – DS3231 found and ready.
 *         ESP_ERR_NOT_FOUND – DS3231 not detected on I2C bus (check wiring /
 *                             config.h I2C_RTC_SCL_GPIO / I2C_RTC_SDA_GPIO).
 *         other             – I2C driver initialisation failed.
 */
esp_err_t external_rtc_init(void);

/**
 * Read current time from DS3231 into time_str as "HH:MM:SS" (IST).
 */
void rtc_get_time(char *time_str);

/**
 * Set DS3231 time from a UTC epoch timestamp.
 * Converts to IST (UTC+5:30) before writing to the chip.
 * Call once after SNTP sync.
 *
 * @param epoch_utc  UNIX timestamp in seconds (UTC)
 */
void rtc_set_time_from_epoch(time_t epoch_utc);

#endif
