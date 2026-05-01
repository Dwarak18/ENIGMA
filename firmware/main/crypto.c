/**
 * @file crypto.c
 * @brief AES-128, SHA-256 and hex helpers implemented with ESP-IDF mbedTLS.
 */

#include "crypto.h"

#include "esp_log.h"
#include "mbedtls/aes.h"
#include "mbedtls/sha256.h"

#include <stdio.h>
#include <string.h>

static const char *TAG = "crypto";
static const uint8_t AES_FIXED_KEY[CRYPTO_AES_KEY_LEN] = {
    0x2a, 0x7d, 0x11, 0x95,
    0xf0, 0x3c, 0x4e, 0x88,
    0x1b, 0xe2, 0x5a, 0x6f,
    0x99, 0x00, 0xcd, 0x73
};

static int hex_nibble(char c)
{
    if (c >= '0' && c <= '9') return c - '0';
    if (c >= 'a' && c <= 'f') return 10 + (c - 'a');
    if (c >= 'A' && c <= 'F') return 10 + (c - 'A');
    return -1;
}

esp_err_t compute_sha256(const uint8_t *input, size_t len, uint8_t output[CRYPTO_SHA256_LEN])
{
    if (!output || (!input && len > 0)) {
        return ESP_ERR_INVALID_ARG;
    }

    mbedtls_sha256_context ctx;
    mbedtls_sha256_init(&ctx);

    int ret = mbedtls_sha256_starts_ret(&ctx, 0);
    if (ret == 0) ret = mbedtls_sha256_update_ret(&ctx, input, len);
    if (ret == 0) ret = mbedtls_sha256_finish_ret(&ctx, output);

    mbedtls_sha256_free(&ctx);

    if (ret != 0) {
        ESP_LOGE(TAG, "mbedTLS sha256 failed: %d", ret);
        return ESP_FAIL;
    }
    return ESP_OK;
}

esp_err_t aes_encrypt(const uint8_t *input,
                      size_t len,
                      uint8_t *output,
                      size_t output_capacity,
                      size_t *output_len)
{
    if (!output || !output_len || (!input && len > 0)) {
        return ESP_ERR_INVALID_ARG;
    }

    size_t pad_len = CRYPTO_AES_BLOCK_LEN - (len % CRYPTO_AES_BLOCK_LEN);
    if (pad_len == 0) {
        pad_len = CRYPTO_AES_BLOCK_LEN;
    }
    size_t padded_len = len + pad_len;
    if (padded_len > output_capacity) {
        return ESP_ERR_INVALID_SIZE;
    }

    if (len > 0) {
        memcpy(output, input, len);
    }
    memset(output + len, (int)pad_len, pad_len);

    mbedtls_aes_context aes;
    mbedtls_aes_init(&aes);
    int ret = mbedtls_aes_setkey_enc(&aes, AES_FIXED_KEY, 128);
    if (ret == 0) {
        for (size_t offset = 0; offset < padded_len; offset += CRYPTO_AES_BLOCK_LEN) {
            ret = mbedtls_aes_crypt_ecb(
                &aes,
                MBEDTLS_AES_ENCRYPT,
                output + offset,
                output + offset
            );
            if (ret != 0) {
                break;
            }
        }
    }
    mbedtls_aes_free(&aes);

    if (ret != 0) {
        ESP_LOGE(TAG, "AES encryption failed: %d", ret);
        return ESP_FAIL;
    }

    *output_len = padded_len;
    return ESP_OK;
}

esp_err_t compute_integrity_hash(const uint8_t *encrypted_data,
                             size_t encrypted_len,
                             const char *timestamp,
                             uint8_t output[CRYPTO_SHA256_LEN])
{
    if (!encrypted_data || !timestamp || !output) {
        return ESP_ERR_INVALID_ARG;
    }

    mbedtls_sha256_context ctx;
    mbedtls_sha256_init(&ctx);

    int ret = mbedtls_sha256_starts_ret(&ctx, 0);
    if (ret == 0) ret = mbedtls_sha256_update_ret(&ctx, encrypted_data, encrypted_len);
    if (ret == 0) ret = mbedtls_sha256_update_ret(&ctx, (const unsigned char *)timestamp, strlen(timestamp));
    if (ret == 0) ret = mbedtls_sha256_finish_ret(&ctx, output);

    mbedtls_sha256_free(&ctx);

    if (ret != 0) {
        ESP_LOGE(TAG, "integrity hash failed: %d", ret);
        return ESP_FAIL;
    }
    return ESP_OK;
}

esp_err_t bytes_to_hex(const uint8_t *bytes, size_t len, char *hex_out, size_t hex_out_len)
{
    if (!bytes || !hex_out) {
        return ESP_ERR_INVALID_ARG;
    }
    if (hex_out_len < (len * 2 + 1)) {
        return ESP_ERR_INVALID_SIZE;
    }

    for (size_t i = 0; i < len; i++) {
        snprintf(hex_out + (i * 2), 3, "%02x", bytes[i]);
    }
    hex_out[len * 2] = '\0';
    return ESP_OK;
}

esp_err_t hex_to_bytes(const char *hex, uint8_t *out, size_t out_capacity, size_t *out_len)
{
    if (!hex || !out || !out_len) {
        return ESP_ERR_INVALID_ARG;
    }

    size_t hex_len = strlen(hex);
    if (hex_len == 0 || (hex_len % 2) != 0) {
        return ESP_ERR_INVALID_ARG;
    }

    size_t bytes_needed = hex_len / 2;
    if (bytes_needed > out_capacity) {
        return ESP_ERR_INVALID_SIZE;
    }

    for (size_t i = 0; i < bytes_needed; i++) {
        int hi = hex_nibble(hex[i * 2]);
        int lo = hex_nibble(hex[i * 2 + 1]);
        if (hi < 0 || lo < 0) {
            return ESP_ERR_INVALID_ARG;
        }
        out[i] = (uint8_t)((hi << 4) | lo);
    }

    *out_len = bytes_needed;
    return ESP_OK;
}
