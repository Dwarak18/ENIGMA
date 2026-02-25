#include "rtc.h"
#include "driver/i2c.h"
#include "esp_log.h"
#include <stdio.h>

#define I2C_MASTER_SCL_IO 17
#define I2C_MASTER_SDA_IO 18
#define I2C_MASTER_NUM I2C_NUM_0
#define I2C_MASTER_FREQ_HZ 100000

#define DS3231_ADDR 0x68

static const char *TAG = "DS3231";

// BCD → Decimal
static uint8_t bcd_to_dec(uint8_t val)
{
    return ((val >> 4) * 10) + (val & 0x0F);
}
static void i2c_scan(void)
{
    printf("Scanning I2C bus...\n");

    for (uint8_t addr = 1; addr < 127; addr++) {

        i2c_cmd_handle_t cmd = i2c_cmd_link_create();
        i2c_master_start(cmd);
        i2c_master_write_byte(cmd, (addr << 1) | I2C_MASTER_WRITE, true);
        i2c_master_stop(cmd);

        esp_err_t ret = i2c_master_cmd_begin(I2C_MASTER_NUM, cmd, pdMS_TO_TICKS(100));
        i2c_cmd_link_delete(cmd);

        if (ret == ESP_OK) {
            printf("Found device at 0x%02X\n", addr);
        }
    }

    printf("Scan done.\n");
}
void external_rtc_init(void)
{
    i2c_config_t conf = {
        .mode = I2C_MODE_MASTER,
        .sda_io_num = I2C_MASTER_SDA_IO,
        .scl_io_num = I2C_MASTER_SCL_IO,
        .sda_pullup_en = GPIO_PULLUP_ENABLE,
        .scl_pullup_en = GPIO_PULLUP_ENABLE,
        .master.clk_speed = I2C_MASTER_FREQ_HZ,
    };

    i2c_param_config(I2C_MASTER_NUM, &conf);
    i2c_driver_install(I2C_MASTER_NUM, conf.mode, 0, 0, 0);
    i2c_scan();

    ESP_LOGI(TAG, "DS3231 Initialized");
}

void rtc_get_time(char *time_str)
{
    uint8_t data[3];
    uint8_t reg = 0x00;

    esp_err_t ret = i2c_master_write_read_device(
        I2C_MASTER_NUM,
        DS3231_ADDR,
        &reg, 1,
        data, 3,
        pdMS_TO_TICKS(1000)
    );

    if (ret != ESP_OK) {
        ESP_LOGE(TAG, "RTC read failed");
        sprintf(time_str, "00:00:00");
        return;
    }

    uint8_t seconds = bcd_to_dec(data[0] & 0x7F);
    uint8_t minutes = bcd_to_dec(data[1]);
    uint8_t hours   = bcd_to_dec(data[2] & 0x3F);

    sprintf(time_str, "%02d:%02d:%02d", hours, minutes, seconds);
}
