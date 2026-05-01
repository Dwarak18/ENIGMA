/**
 * @file main.c
 * @brief ENIGMA ESP32-S3 firmware main flow (ESP-IDF v5.1.2)
 *
 * Flow:
 *  1. Init UART
 *  2. Init DS3231 RTC (I2C)
 *  3. Wait for UART JSON request
 *  4. AES-128 encrypt input bytes
 *  5. Read RTC timestamp
 *  6. final_hash = SHA-256(encrypted_data || timestamp_string)
 *  7. Send JSON result via UART
 */

#include "crypto.h"
#include "uart.h"
#include "rtc.h"

#include "esp_log.h"
#include "esp_err.h"

static const char *TAG = "main";

static char payload_hex[UART_PAYLOAD_HEX_MAX_LEN + 1];
static uint8_t payload_bytes[UART_PAYLOAD_MAX_BYTES];
static uint8_t encrypted_bytes[CRYPTO_ENCRYPTED_MAX_LEN(UART_PAYLOAD_MAX_BYTES)];
static uint8_t final_hash[CRYPTO_SHA256_LEN];
static char timestamp_str[24];

void app_main(void)
{
    ESP_LOGI(TAG, "ENIGMA firmware booting...");

    ESP_ERROR_CHECK(uart_module_init());
    ESP_ERROR_CHECK(rtc_init());

    ESP_LOGI(TAG, "System ready. Waiting for UART input...");

    for (;;) {
        size_t payload_len = 0;
        size_t encrypted_len = 0;

        esp_err_t err = uart_read_request(payload_hex, sizeof(payload_hex));
        if (err != ESP_OK) {
            ESP_LOGE(TAG, "UART request read failed: %s", esp_err_to_name(err));
            uart_send_error("invalid_input");
            continue;
        }

        err = hex_to_bytes(payload_hex, payload_bytes, sizeof(payload_bytes), &payload_len);
        if (err != ESP_OK) {
            ESP_LOGE(TAG, "Hex decode failed: %s", esp_err_to_name(err));
            uart_send_error("invalid_hex_payload");
            continue;
        }

        ESP_LOGI(TAG, "Received %u payload bytes", (unsigned)payload_len);

        err = aes_encrypt(payload_bytes, payload_len, encrypted_bytes, sizeof(encrypted_bytes), &encrypted_len);
        if (err != ESP_OK) {
            ESP_LOGE(TAG, "AES encryption failed: %s", esp_err_to_name(err));
            uart_send_error("encryption_failed");
            continue;
        }
        ESP_LOGI(TAG, "AES encryption completed (%u bytes)", (unsigned)encrypted_len);

        err = rtc_get_timestamp_string(timestamp_str, sizeof(timestamp_str));
        if (err != ESP_OK) {
            ESP_LOGE(TAG, "RTC read failed: %s", esp_err_to_name(err));
            uart_send_error("timestamp_unavailable");
            continue;
        }

        err = compute_integrity_hash(encrypted_bytes, encrypted_len, timestamp_str, final_hash);
        if (err != ESP_OK) {
            ESP_LOGE(TAG, "Final hash failed: %s", esp_err_to_name(err));
            uart_send_error("final_hash_failed");
            continue;
        }
        ESP_LOGI(TAG, "Final SHA-256 computed with RTC timestamp %s", timestamp_str);

        err = uart_send_result(final_hash, timestamp_str);
        if (err != ESP_OK) {
            ESP_LOGE(TAG, "UART response send failed: %s", esp_err_to_name(err));
        }
    }
}
