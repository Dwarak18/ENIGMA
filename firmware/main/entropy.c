/**
 * @file entropy.c
 * @brief Entropy collection – hardware RNG (ESP32-S3)
 */

#include "entropy.h"
#include "esp_random.h"
#include "esp_log.h"

static const char *TAG = "entropy";

void entropy_collect(uint8_t *buf, size_t len)
{
    /* Primary source: ESP32-S3 hardware TRNG (ISO-certified on S3) */
    esp_fill_random(buf, len);

    /*
     * Future extension hook:
     *   entropy_add_camera_noise(buf, len);   // XOR with camera noise
     *   entropy_add_adc_noise(buf, len);      // XOR with floating ADC pin
     *
     * Both can be implemented by XOR-ing into buf without changing the
     * caller or the crypto/network layers.
     */

    ESP_LOGD(TAG, "Collected %zu bytes of entropy", len);
}
