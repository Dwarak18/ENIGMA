#ifndef RTC_H
#define RTC_H

#include <time.h>

/**
 * Initialise I2C bus and DS3231. Run I2C scan. Clear CH (Clock Halt) bit.
 */
void external_rtc_init(void);

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
