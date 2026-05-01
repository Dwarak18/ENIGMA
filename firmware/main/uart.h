/**
 * @file uart.h
 * @brief UART JSON request/response interface.
 */

#pragma once

#include "esp_err.h"
#include "driver/uart.h"
#include <stdint.h>
#include <stddef.h>

#define UART_PORT_NUM            UART_NUM_0
#define UART_BAUD_RATE           115200
#define UART_JSON_MAX_LEN        17408
#define UART_PAYLOAD_HEX_MAX_LEN 16384
#define UART_PAYLOAD_MAX_BYTES   (UART_PAYLOAD_HEX_MAX_LEN / 2)

/**
 * @brief Initialize UART driver.
 */
esp_err_t uart_module_init(void);

/**
 * @brief Read one JSON request and extract payload hex.
 *
 * Expected format:
 * {"type":"image_data","data":"<hex>"}
 */
esp_err_t uart_read_request(char *payload_hex_out, size_t payload_hex_out_size);

/**
 * @brief Send result JSON:
 * {"type":"processed","hash":"<hex>","timestamp":"<rtc_time>"}
 */
esp_err_t uart_send_result(const uint8_t final_hash[32], const char *timestamp);

/**
 * @brief Send error JSON:
 * {"type":"error","message":"<text>"}
 */
esp_err_t uart_send_error(const char *message);

