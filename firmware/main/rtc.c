/**
 * @file rtc.c
 * @brief DS3231 RTC implementation over I2C (ESP-IDF).
 */

#include "rtc.h"
#include "config.h"
#include "utils.h"

#include "driver/i2c.h"
#include "esp_log.h"
#include "freertos/FreeRTOS.h"

#include <time.h>
#include <stdio.h>
#include <stdlib.h>
#include <stdbool.h>

static const char *TAG = "rtc";

#define DS3231_I2C_ADDR        0x68
#define DS3231_REG_TIME_START  0x00
#define RTC_I2C_PORT           I2C_NUM_0
#define RTC_I2C_FREQ_HZ        100000
#define RTC_I2C_TIMEOUT_MS     1000

typedef struct {
    int year;   // full year (e.g. 2026)
    int month;  // 1-12
    int day;    // 1-31
    int hour;   // 0-23
    int minute; // 0-59
    int second; // 0-59
} rtc_datetime_t;

static bool s_rtc_initialized = false;
static bool s_utc_tz_initialized = false;

static esp_err_t rtc_read_datetime(rtc_datetime_t *dt)
{
    if (!dt) {
        return ESP_ERR_INVALID_ARG;
    }

    uint8_t reg = DS3231_REG_TIME_START;
    uint8_t buf[7] = {0};
    esp_err_t err = i2c_master_write_read_device(
        RTC_I2C_PORT,
        DS3231_I2C_ADDR,
        &reg,
        1,
        buf,
        sizeof(buf),
        pdMS_TO_TICKS(RTC_I2C_TIMEOUT_MS)
    );
    if (err != ESP_OK) {
        return err;
    }

    dt->second = bcd_to_dec(buf[0] & 0x7F);
    dt->minute = bcd_to_dec(buf[1] & 0x7F);
    if (buf[2] & 0x40) {
        int hour = bcd_to_dec(buf[2] & 0x1F);
        bool is_pm = (buf[2] & 0x20) != 0;
        if (is_pm && hour < 12) {
            hour += 12;
        } else if (!is_pm && hour == 12) {
            hour = 0;
        }
        dt->hour = hour;
    } else {
        dt->hour = bcd_to_dec(buf[2] & 0x3F);
    }
    dt->day    = bcd_to_dec(buf[4] & 0x3F);
    dt->month  = bcd_to_dec(buf[5] & 0x1F);
    dt->year   = 2000 + bcd_to_dec(buf[6]);

    return ESP_OK;
}

esp_err_t rtc_init(void)
{
    i2c_config_t conf = {0};
    conf.mode = I2C_MODE_MASTER;
    conf.sda_io_num = I2C_RTC_SDA_GPIO;
    conf.scl_io_num = I2C_RTC_SCL_GPIO;
    conf.sda_pullup_en = GPIO_PULLUP_ENABLE;
    conf.scl_pullup_en = GPIO_PULLUP_ENABLE;
    conf.master.clk_speed = RTC_I2C_FREQ_HZ;

    ESP_ERROR_CHECK(i2c_param_config(RTC_I2C_PORT, &conf));
    ESP_ERROR_CHECK(i2c_driver_install(RTC_I2C_PORT, conf.mode, 0, 0, 0));

    s_rtc_initialized = true;
    ESP_LOGI(TAG, "DS3231 I2C initialized (SDA=%d, SCL=%d)", I2C_RTC_SDA_GPIO, I2C_RTC_SCL_GPIO);
    return ESP_OK;
}

uint64_t get_rtc_timestamp(void)
{
    if (!s_rtc_initialized) {
        ESP_LOGE(TAG, "RTC not initialized");
        return 0;
    }

    rtc_datetime_t dt = {0};
    if (rtc_read_datetime(&dt) != ESP_OK) {
        ESP_LOGE(TAG, "Failed to read RTC datetime");
        return 0;
    }

    struct tm t = {0};
    t.tm_year = dt.year - 1900;
    t.tm_mon  = dt.month - 1;
    t.tm_mday = dt.day;
    t.tm_hour = dt.hour;
    t.tm_min  = dt.minute;
    t.tm_sec  = dt.second;
    t.tm_isdst = -1;

    // Interpret DS3231 calendar as UTC to produce stable UNIX epoch.
    if (!s_utc_tz_initialized) {
        setenv("TZ", "UTC0", 1);
        tzset();
        s_utc_tz_initialized = true;
    }
    time_t epoch = mktime(&t);
    if (epoch < 0) {
        ESP_LOGE(TAG, "Failed to convert RTC time to epoch");
        return 0;
    }
    return (uint64_t)epoch;
}

esp_err_t rtc_get_timestamp_string(char *out, size_t out_len)
{
    if (!out || out_len < 20) {
        return ESP_ERR_INVALID_ARG;
    }
    if (!s_rtc_initialized) {
        return ESP_ERR_INVALID_STATE;
    }

    rtc_datetime_t dt = {0};
    esp_err_t err = rtc_read_datetime(&dt);
    if (err != ESP_OK) {
        return err;
    }

    int written = snprintf(out, out_len, "%04d-%02d-%02d %02d:%02d:%02d",
                           dt.year, dt.month, dt.day, dt.hour, dt.minute, dt.second);
    if (written <= 0 || (size_t)written >= out_len) {
        return ESP_FAIL;
    }
    return ESP_OK;
}

