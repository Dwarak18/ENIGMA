/**
 * @file crypto.h
 * @brief AES-128 + SHA-256 + hex utility API using ESP-IDF mbedTLS.
 */

#pragma once

#include "esp_err.h"
#include <stdint.h>
#include <stddef.h>

#define CRYPTO_SHA256_LEN 32
#define CRYPTO_AES_BLOCK_LEN 16
#define CRYPTO_AES_KEY_LEN 16
#define CRYPTO_ENCRYPTED_MAX_LEN(input_len) ((((input_len) / CRYPTO_AES_BLOCK_LEN) + 1) * CRYPTO_AES_BLOCK_LEN)

/**
 * @brief AES-128 encryption (ECB + PKCS#7 padding) using fixed 16-byte key.
 */
esp_err_t aes_encrypt(const uint8_t *input,
                      size_t len,
                      uint8_t *output,
                      size_t output_capacity,
                      size_t *output_len);

/**
 * @brief Compute SHA-256 for arbitrary input.
 */
esp_err_t compute_sha256(const uint8_t *input, size_t len, uint8_t output[CRYPTO_SHA256_LEN]);

/**
 * @brief Compute SHA256(encrypted_data || timestamp_string).
 */
esp_err_t compute_integrity_hash(const uint8_t *encrypted_data,
                                 size_t encrypted_len,
                                 const char *timestamp,
                                 uint8_t output[CRYPTO_SHA256_LEN]);

/**
 * @brief Convert bytes to lowercase hex string.
 *
 * @param bytes Input bytes
 * @param len Input byte length
 * @param hex_out Output string
 * @param hex_out_len Output buffer length (must be at least len*2 + 1)
 */
esp_err_t bytes_to_hex(const uint8_t *bytes, size_t len, char *hex_out, size_t hex_out_len);

/**
 * @brief Convert lowercase/uppercase hex string to bytes.
 *
 * @param hex Input hex string (without 0x prefix)
 * @param out Output bytes
 * @param out_capacity Output capacity
 * @param out_len Decoded byte count
 */
esp_err_t hex_to_bytes(const char *hex, uint8_t *out, size_t out_capacity, size_t *out_len);
