#include "rtc.h"
#include "config.h"
#include "driver/i2c.h"
#include "esp_log.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include <stdio.h>
#include <time.h>

#define I2C_MASTER_SCL_IO    I2C_RTC_SCL_GPIO   /* config.h */
#define I2C_MASTER_SDA_IO    I2C_RTC_SDA_GPIO   /* config.h */
#define I2C_MASTER_NUM       I2C_NUM_0
#define I2C_MASTER_FREQ_HZ   100000

#define DS3231_ADDR          0x68

/* IST_OFFSET_SECS (19800) is defined in config.h */

static const char *TAG = "DS3231";

/* ── BCD helpers ─────────────────────────────────────────────────────── */
static uint8_t bcd_to_dec(uint8_t val) { return ((val >> 4) * 10) + (val & 0x0F); }
static uint8_t dec_to_bcd(uint8_t val) { return ((val / 10) << 4) | (val % 10); }

/* ── Low-level I2C helpers ───────────────────────────────────────────── */

/**
 * Write one register address byte to DS3231 (sets internal register pointer).
 */
static esp_err_t ds3231_write_reg(uint8_t reg, const uint8_t *data, size_t len)
{
    i2c_cmd_handle_t cmd = i2c_cmd_link_create();
    i2c_master_start(cmd);
    i2c_master_write_byte(cmd, (DS3231_ADDR << 1) | I2C_MASTER_WRITE, true);
    i2c_master_write_byte(cmd, reg, true);
    if (data && len > 0) {
        i2c_master_write(cmd, (uint8_t *)data, len, true);
    }
    i2c_master_stop(cmd);
    esp_err_t ret = i2c_master_cmd_begin(I2C_MASTER_NUM, cmd, pdMS_TO_TICKS(200));
    i2c_cmd_link_delete(cmd);
    return ret;
}

/**
 * Read `len` bytes from DS3231 using a single combined transaction:
 *   START → ADDR+W → REG → REPEATED-START → ADDR+R → data… → NACK → STOP
 *
 * This is the correct way to address DS3231 registers and avoids the
 * "RTC read failed" error that occurred when two separate transactions
 * were used (the bus could be lost between the write and read phases).
 */
static esp_err_t ds3231_read_bytes(uint8_t reg, uint8_t *out, size_t len)
{
    i2c_cmd_handle_t cmd = i2c_cmd_link_create();

    /* Phase 1: write register address */
    i2c_master_start(cmd);
    i2c_master_write_byte(cmd, (DS3231_ADDR << 1) | I2C_MASTER_WRITE, true);
    i2c_master_write_byte(cmd, reg, true);

    /* Phase 2: repeated START then read */
    i2c_master_start(cmd);
    i2c_master_write_byte(cmd, (DS3231_ADDR << 1) | I2C_MASTER_READ, true);
    if (len > 1) {
        i2c_master_read(cmd, out, len - 1, I2C_MASTER_ACK);
    }
    i2c_master_read_byte(cmd, &out[len - 1], I2C_MASTER_NACK);
    i2c_master_stop(cmd);

    esp_err_t ret = i2c_master_cmd_begin(I2C_MASTER_NUM, cmd, pdMS_TO_TICKS(200));
    i2c_cmd_link_delete(cmd);
    return ret;
}

/* ── I2C bus scan (startup diagnostics) ─────────────────────────────── */
/**
 * Scan I2C_NUM_0 for all 7-bit addresses and log any responders.
 * Returns true if the DS3231 (0x68) was found.
 */
static bool i2c_scan(void)
{
    bool ds3231_found = false;
    ESP_LOGI(TAG, "Scanning I2C_NUM_0 (SCL=GPIO%d SDA=GPIO%d)…",
             I2C_MASTER_SCL_IO, I2C_MASTER_SDA_IO);
    for (uint8_t addr = 1; addr < 127; addr++) {
        i2c_cmd_handle_t cmd = i2c_cmd_link_create();
        i2c_master_start(cmd);
        i2c_master_write_byte(cmd, (addr << 1) | I2C_MASTER_WRITE, true);
        i2c_master_stop(cmd);
        esp_err_t ret = i2c_master_cmd_begin(I2C_MASTER_NUM, cmd, pdMS_TO_TICKS(50));
        i2c_cmd_link_delete(cmd);
        if (ret == ESP_OK) {
            ESP_LOGI(TAG, "  found device at 0x%02X%s", addr,
                     addr == DS3231_ADDR ? "  ← DS3231" : "");
            if (addr == DS3231_ADDR) ds3231_found = true;
        }
    }
    if (!ds3231_found) {
        ESP_LOGE(TAG, "DS3231 NOT found on I2C bus!"
                 " Check wiring: SCL→GPIO%d, SDA→GPIO%d, VCC→3V3, GND",
                 I2C_MASTER_SCL_IO, I2C_MASTER_SDA_IO);
    }
    return ds3231_found;
}

/* ══════════════════════════════════════════════════════════════════════ */
/*  Public API                                                            */
/* ══════════════════════════════════════════════════════════════════════ */

esp_err_t external_rtc_init(void)
{
    i2c_config_t conf = {
        .mode             = I2C_MODE_MASTER,
        .sda_io_num       = I2C_MASTER_SDA_IO,
        .scl_io_num       = I2C_MASTER_SCL_IO,
        .sda_pullup_en    = GPIO_PULLUP_ENABLE,
        .scl_pullup_en    = GPIO_PULLUP_ENABLE,
        .master.clk_speed = I2C_MASTER_FREQ_HZ,
    };

    esp_err_t ret = i2c_param_config(I2C_MASTER_NUM, &conf);
    if (ret != ESP_OK) {
        ESP_LOGE(TAG, "i2c_param_config failed: %s", esp_err_to_name(ret));
        return ret;
    }

    ret = i2c_driver_install(I2C_MASTER_NUM, conf.mode, 0, 0, 0);
    if (ret == ESP_ERR_INVALID_STATE) {
        /* Driver was already installed – not a fatal error, continue. */
        ESP_LOGW(TAG, "I2C driver already installed on I2C_NUM_0");
    } else if (ret != ESP_OK) {
        ESP_LOGE(TAG, "i2c_driver_install failed: %s", esp_err_to_name(ret));
        return ret;
    }

    /* Brief settle time after driver install */
    vTaskDelay(pdMS_TO_TICKS(10));

    if (!i2c_scan()) {
        /* DS3231 not found – return error so callers can skip RTC operations */
        return ESP_ERR_NOT_FOUND;
    }

    /* Clear the CH (Clock Halt) bit in register 0x00 to ensure oscillator runs.
     * We write 0x00 to seconds register which clears CH (bit7) and resets secs to 0.
     * The real time will be overwritten by rtc_set_time_from_epoch() immediately after. */
    uint8_t clr = 0x00;
    ret = ds3231_write_reg(0x00, &clr, 1);
    if (ret != ESP_OK) {
        ESP_LOGE(TAG, "DS3231 CH-bit clear failed: %s", esp_err_to_name(ret));
        return ret;
    }

    ESP_LOGI(TAG, "DS3231 initialised (SCL=GPIO%d SDA=GPIO%d)",
             I2C_MASTER_SCL_IO, I2C_MASTER_SDA_IO);
    return ESP_OK;
}

/**
 * Read current time from DS3231.
 * Writes "HH:MM:SS" (IST as stored) into time_str.
 */
void rtc_get_time(char *time_str)
{
    uint8_t data[3] = {0};

    esp_err_t ret = ds3231_read_bytes(0x00, data, 3);
    if (ret != ESP_OK) {
        ESP_LOGE(TAG, "RTC read failed (err=0x%x)", ret);
        sprintf(time_str, "00:00:00");
        return;
    }

    uint8_t seconds = bcd_to_dec(data[0] & 0x7F);   /* strip CH bit */
    uint8_t minutes = bcd_to_dec(data[1] & 0x7F);
    uint8_t hours   = bcd_to_dec(data[2] & 0x3F);   /* strip 12/24 bits */

    sprintf(time_str, "%02d:%02d:%02d", hours, minutes, seconds);
}

/**
 * Set DS3231 time from a UTC epoch, converted to IST (UTC+5:30).
 *
 * Call this once after SNTP is synced.
 * The DS3231 will then track IST independently.
 *
 * @param epoch_utc  UNIX timestamp (UTC seconds since 1970-01-01)
 */
void rtc_set_time_from_epoch(time_t epoch_utc)
{
    /* Shift to IST */
    time_t ist_epoch = epoch_utc + IST_OFFSET_SECS;

    /* Break into H/M/S using gmtime_r (treats shifted value as UTC) */
    struct tm t;
    gmtime_r(&ist_epoch, &t);

    uint8_t h = (uint8_t)t.tm_hour;
    uint8_t m = (uint8_t)t.tm_min;
    uint8_t s = (uint8_t)t.tm_sec;

    /* Write seconds(0x00), minutes(0x01), hours(0x02) in one burst */
    uint8_t regs[3] = {
        dec_to_bcd(s),   /* 0x00 – seconds, CH bit cleared (BCD < 0x80) */
        dec_to_bcd(m),   /* 0x01 – minutes */
        dec_to_bcd(h),   /* 0x02 – hours, 24-h mode (bit6=0) */
    };

    esp_err_t ret = ds3231_write_reg(0x00, regs, 3);
    if (ret == ESP_OK) {
        ESP_LOGI(TAG, "DS3231 set to IST %02d:%02d:%02d (epoch=%lld)",
                 h, m, s, (long long)epoch_utc);
    } else {
        ESP_LOGE(TAG, "DS3231 time-set failed (err=0x%x)", ret);
    }
}
