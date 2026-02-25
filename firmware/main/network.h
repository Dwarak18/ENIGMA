/**
 * @file network.h
 * @brief Wi-Fi connection and HTTPS POST interface
 */

#pragma once
#include "esp_err.h"
#include <stdint.h>

/**
 * @brief Connect to Wi-Fi (blocking until connected or max retries exceeded).
 * @return ESP_OK on successful association.
 */
esp_err_t network_wifi_connect(void);

/**
 * @brief Synchronise device clock via SNTP (blocking).
 * @return ESP_OK when time is synchronized.
 */
esp_err_t network_sntp_sync(void);

/**
 * @brief Send a signed entropy payload to the backend over HTTPS.
 *
 * Constructs and POSTs the JSON body:
 * {
 *   "device_id":    <string>,
 *   "timestamp":    <uint64>,
 *   "entropy_hash": <64-char hex>,
 *   "signature":    <128-char hex>,
 *   "public_key":   <130-char hex>  // sent only on first call
 * }
 *
 * @param timestamp     UNIX epoch seconds
 * @param hash_hex      Null-terminated 64-char hex string (SHA-256)
 * @param sig_hex       Null-terminated 128-char hex string (ECDSA r||s)
 * @param pubkey_hex    Null-terminated 130-char hex string (uncompressed)
 * @return ESP_OK if backend returned 2xx.
 */
esp_err_t network_post_entropy(uint64_t    timestamp,
                               const char *hash_hex,
                               const char *sig_hex,
                               const char *pubkey_hex);
