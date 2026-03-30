/**
 * @file aes_encryption.h
 * @brief AES-256 encryption interface for image bitstream
 */

#pragma once

#include "esp_err.h"
#include <stdint.h>
#include <stddef.h>

#include "config.h"

#if CAMERA_ENABLED

/**
 * AES-256 encrypt bitstream in CBC mode with PKCS7 padding
 * @param plaintext      Input plaintext (8-32 bytes)
 * @param pt_len         Length of plaintext
 * @param key_256        32-byte AES-256 key
 * @param iv_16          16-byte initialization vector
 * @param ciphertext_out Output buffer (must be >= 32 bytes)
 * @param out_len        Pointer to store actual ciphertext length
 * @return ESP_OK on success
 */
esp_err_t aes_encrypt_bitstream(const uint8_t *plaintext, size_t pt_len,
                                const uint8_t *key_256, const uint8_t *iv_16,
                                uint8_t *ciphertext_out, size_t *out_len);

/**
 * AES-256 decrypt bitstream (for verification)
 * @param ciphertext     Input ciphertext
 * @param ct_len         Length of ciphertext (multiple of 16)
 * @param key_256        32-byte AES-256 key
 * @param iv_16          16-byte initialization vector
 * @param plaintext_out  Output buffer
 * @param out_len        Pointer to store actual plaintext length
 * @return ESP_OK on success
 */
esp_err_t aes_decrypt_bitstream(const uint8_t *ciphertext, size_t ct_len,
                                const uint8_t *key_256, const uint8_t *iv_16,
                                uint8_t *plaintext_out, size_t *out_len);

/**
 * Generate random 16-byte IV from hardware TRNG
 * @param iv_out Output buffer (16 bytes)
 * @return ESP_OK on success
 */
esp_err_t aes_generate_iv(uint8_t *iv_out);

#endif /* CAMERA_ENABLED */
