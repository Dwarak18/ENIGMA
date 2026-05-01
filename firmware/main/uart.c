/**
 * @file uart.c
 * @brief UART request/response implementation with JSON framing.
 */

#include "uart.h"
#include "crypto.h"

#include "driver/uart.h"
#include "esp_log.h"
#include "cJSON.h"
#include "freertos/FreeRTOS.h"

#include <string.h>
#include <stdlib.h>

static const char *TAG = "uart";
static char s_json_line[UART_JSON_MAX_LEN];

static esp_err_t uart_read_line(char *line, size_t line_size)
{
    if (!line || line_size < 2) {
        return ESP_ERR_INVALID_ARG;
    }

    size_t idx = 0;
    while (1) {
        uint8_t ch = 0;
        int n = uart_read_bytes(UART_PORT_NUM, &ch, 1, pdMS_TO_TICKS(1000));
        if (n < 0) {
            return ESP_FAIL;
        }
        if (n == 0) {
            continue;
        }

        if (ch == '\r') {
            continue;
        }
        if (ch == '\n') {
            if (idx == 0) {
                continue;
            }
            line[idx] = '\0';
            return ESP_OK;
        }

        if (idx >= (line_size - 1)) {
            line[line_size - 1] = '\0';
            return ESP_ERR_INVALID_SIZE;
        }
        line[idx++] = (char)ch;
    }
}

static esp_err_t uart_send_json(cJSON *json)
{
    if (!json) {
        return ESP_ERR_INVALID_ARG;
    }

    char *serialized = cJSON_PrintUnformatted(json);
    if (!serialized) {
        return ESP_FAIL;
    }

    uart_write_bytes(UART_PORT_NUM, serialized, strlen(serialized));
    uart_write_bytes(UART_PORT_NUM, "\n", 1);
    free(serialized);
    return ESP_OK;
}

esp_err_t uart_module_init(void)
{
    uart_config_t cfg = {
        .baud_rate = UART_BAUD_RATE,
        .data_bits = UART_DATA_8_BITS,
        .parity = UART_PARITY_DISABLE,
        .stop_bits = UART_STOP_BITS_1,
        .flow_ctrl = UART_HW_FLOWCTRL_DISABLE,
        .source_clk = UART_SCLK_DEFAULT,
    };

    ESP_ERROR_CHECK(uart_driver_install(UART_PORT_NUM, UART_JSON_MAX_LEN, 0, 0, NULL, 0));
    ESP_ERROR_CHECK(uart_param_config(UART_PORT_NUM, &cfg));
    ESP_ERROR_CHECK(uart_set_pin(UART_PORT_NUM, UART_PIN_NO_CHANGE, UART_PIN_NO_CHANGE, UART_PIN_NO_CHANGE, UART_PIN_NO_CHANGE));

    ESP_LOGI(TAG, "UART initialized @ %d baud", UART_BAUD_RATE);
    return ESP_OK;
}

esp_err_t uart_read_request(char *payload_hex_out, size_t payload_hex_out_size)
{
    if (!payload_hex_out || payload_hex_out_size == 0) {
        return ESP_ERR_INVALID_ARG;
    }

    esp_err_t err = uart_read_line(s_json_line, sizeof(s_json_line));
    if (err != ESP_OK) {
        return err;
    }

    cJSON *root = cJSON_Parse(s_json_line);
    if (!root) {
        ESP_LOGE(TAG, "Invalid JSON");
        return ESP_ERR_INVALID_ARG;
    }

    cJSON *type = cJSON_GetObjectItemCaseSensitive(root, "type");
    cJSON *data = cJSON_GetObjectItemCaseSensitive(root, "data");
    if (!cJSON_IsString(type) || !cJSON_IsString(data)) {
        cJSON_Delete(root);
        return ESP_ERR_INVALID_ARG;
    }
    if (strcmp(type->valuestring, "image_data") != 0) {
        cJSON_Delete(root);
        return ESP_ERR_INVALID_ARG;
    }

    size_t payload_len = strlen(data->valuestring);
    if (payload_len == 0 || payload_len > UART_PAYLOAD_HEX_MAX_LEN) {
        cJSON_Delete(root);
        return ESP_ERR_INVALID_SIZE;
    }
    if (payload_len >= payload_hex_out_size) {
        cJSON_Delete(root);
        return ESP_ERR_INVALID_SIZE;
    }

    memcpy(payload_hex_out, data->valuestring, payload_len + 1);
    cJSON_Delete(root);
    return ESP_OK;
}

esp_err_t uart_send_result(const uint8_t final_hash[32], const char *timestamp)
{
    if (!final_hash || !timestamp) {
        return ESP_ERR_INVALID_ARG;
    }

    char final_hash_hex[65];
    esp_err_t err = bytes_to_hex(final_hash, 32, final_hash_hex, sizeof(final_hash_hex));
    if (err != ESP_OK) {
        return err;
    }

    cJSON *root = cJSON_CreateObject();
    if (!root) {
        return ESP_FAIL;
    }
    cJSON_AddStringToObject(root, "type", "processed");
    cJSON_AddStringToObject(root, "hash", final_hash_hex);
    cJSON_AddStringToObject(root, "timestamp", timestamp);

    err = uart_send_json(root);
    cJSON_Delete(root);
    return err;
}

esp_err_t uart_send_error(const char *message)
{
    cJSON *root = cJSON_CreateObject();
    if (!root) {
        return ESP_FAIL;
    }
    cJSON_AddStringToObject(root, "type", "error");
    cJSON_AddStringToObject(root, "message", message ? message : "unknown_error");

    esp_err_t err = uart_send_json(root);
    cJSON_Delete(root);
    return err;
}

