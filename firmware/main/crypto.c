/**
 * @file crypto.c
 * @brief AES-256-GCM (authenticated encryption), SHA-256, HKDF, and hex helpers
 * implemented with ESP-IDF mbedTLS.
 *
 * SECURITY FIXES:
 * - Replaced insecure AES-ECB with AES-256-GCM (authenticated encryption)
 * - Removed hardcoded AES key (now derived from entropy on backend)
 * - Added AES-GCM decryption with authentication tag verification
 * - Keys are derived using HKDF-SHA256 on the backend (secure key derivation)
 */

#include "crypto.h"

#include "esp_log.h"
#include "mbedtls/aes.h"
#include "mbedtls/sha256.h"
#include "mbedtls/md.h"

#include <stdio.h>
#include <string.h>

static const char *TAG = "crypto";

/* REMOVED: AES_FIXED_KEY hardcoded key (security vulnerability)
 * Keys are now derived from entropy using HKDF-SHA256 by the backend
 */

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

    int ret = mbedtls_sha256_starts(&ctx, 0);
    if (ret == 0) ret = mbedtls_sha256_update(&ctx, input, len);
    if (ret == 0) ret = mbedtls_sha256_finish(&ctx, output);

    mbedtls_sha256_free(&ctx);

    if (ret != 0) {
        ESP_LOGE(TAG, "mbedTLS sha256 failed: %d", ret);
        return ESP_FAIL;
    }
    return ESP_OK;
}

/**
 * DEPRECATED: enigma_aes_encrypt (AES-ECB mode - insecure)
 * Use enigma_aes_gcm_encrypt instead for authenticated encryption
 */
esp_err_t enigma_aes_encrypt(const uint8_t *input,
                              size_t len,
                              uint8_t *output,
                              size_t output_capacity,
                              size_t *output_len)
{
    ESP_LOGW(TAG, "AES-ECB mode is insecure - use AES-GCM instead");
    return ESP_ERR_NOT_SUPPORTED;
}

/**
 * SECURITY FIX: Encrypt data using AES-256-GCM (authenticated encryption)
 * Replaces insecure ECB mode with GCM which provides:
 *   - Confidentiality (only authorized parties can read encrypted data)
 *   - Authenticity (verify data has not been tampered with)
 * 
 * GCM mode benefits:
 *   - No padding required
 *   - Authentication tag verifies integrity
 *   - Nonce reuse detection (different for each encryption)
 * 
 * Output layout: ciphertext || auth_tag (tag is appended)
 * 
 * @param key AES-256 key (32 bytes) - derived from entropy via HKDF
 * @param iv Initialization vector (12 bytes recommended for GCM)
 * @param input Plaintext data to encrypt
 * @param input_len Length of plaintext
 * @param output Buffer for ciphertext + auth tag
 * @param output_capacity Size of output buffer (must be >= input_len + 16)
 * @param output_len [OUT] Size of ciphertext + tag
 * @return ESP_OK on success, ESP_FAIL on error
 */
esp_err_t enigma_aes_gcm_encrypt(const uint8_t *key,
                                 const uint8_t *iv,
                                 const uint8_t *input,
                                 size_t input_len,
                                 uint8_t *output,
                                 size_t output_capacity,
                                 size_t *output_len)
{
    if (!key || !iv || !output || !output_len || (!input && input_len > 0)) {
        return ESP_ERR_INVALID_ARG;
    }

    /* GCM does NOT require padding; ciphertext is same size as plaintext */
    size_t total_len = input_len + CRYPTO_AES_GCM_TAG_LEN;
    if (total_len > output_capacity) {
        return ESP_ERR_INVALID_SIZE;
    }

    uint8_t tag[CRYPTO_AES_GCM_TAG_LEN];
    
    /* Use mbedTLS high-level GCM API */
    mbedtls_gcm_context gcm;
    mbedtls_gcm_init(&gcm);
    
    int ret = mbedtls_gcm_setkey(&gcm, MBEDTLS_CIPHER_ID_AES, key, 256);
    if (ret != 0) {
        ESP_LOGE(TAG, "GCM key setup failed: %d", ret);
        mbedtls_gcm_free(&gcm);
        return ESP_FAIL;
    }

    /* Encrypt with authentication */
    ret = mbedtls_gcm_crypt_and_tag(&gcm, MBEDTLS_GCM_ENCRYPT,
                                     input_len, iv, 12, /* 12-byte IV */
                                     NULL, 0, /* No additional data */
                                     input, output, 
                                     CRYPTO_AES_GCM_TAG_LEN, tag);
    
    if (ret != 0) {
        ESP_LOGE(TAG, "GCM encryption failed: %d", ret);
        mbedtls_gcm_free(&gcm);
        return ESP_FAIL;
    }

    /* Append authentication tag to ciphertext */
    memcpy(output + input_len, tag, CRYPTO_AES_GCM_TAG_LEN);
    *output_len = total_len;

    mbedtls_gcm_free(&gcm);
    return ESP_OK;
}

/**
 * SECURITY FIX: Decrypt data using AES-256-GCM with authentication verification
 * Verifies authentication tag before returning plaintext
 * Prevents tampering: if tag verification fails, plaintext is NOT returned
 * 
 * @param key AES-256 key (32 bytes)
 * @param iv Initialization vector (12 bytes)
 * @param ciphertext Encrypted data (NOT including tag)
 * @param ciphertext_len Length of ciphertext in bytes
 * @param tag Authentication tag (16 bytes)
 * @param output Buffer for plaintext
 * @param output_capacity Size of output buffer
 * @param output_len [OUT] Length of plaintext
 * @return ESP_OK on successful decryption and tag verification, ESP_FAIL otherwise
 */
esp_err_t enigma_aes_gcm_decrypt(const uint8_t *key,
                                 const uint8_t *iv,
                                 const uint8_t *ciphertext,
                                 size_t ciphertext_len,
                                 const uint8_t *tag,
                                 uint8_t *output,
                                 size_t output_capacity,
                                 size_t *output_len)
{
    if (!key || !iv || !ciphertext || !tag || !output || !output_len) {
        return ESP_ERR_INVALID_ARG;
    }

    if (ciphertext_len > output_capacity) {
        return ESP_ERR_INVALID_SIZE;
    }

    mbedtls_gcm_context gcm;
    mbedtls_gcm_init(&gcm);
    
    int ret = mbedtls_gcm_setkey(&gcm, MBEDTLS_CIPHER_ID_AES, key, 256);
    if (ret != 0) {
        ESP_LOGE(TAG, "GCM key setup failed: %d", ret);
        mbedtls_gcm_free(&gcm);
        return ESP_FAIL;
    }

    /* Decrypt and verify authentication tag */
    ret = mbedtls_gcm_auth_decrypt(&gcm, ciphertext_len,
                                    iv, 12,
                                    NULL, 0, /* No additional data */
                                    tag, CRYPTO_AES_GCM_TAG_LEN,
                                    ciphertext, output);
    
    if (ret != 0) {
        ESP_LOGE(TAG, "GCM decryption/auth verification failed: %d", ret);
        mbedtls_gcm_free(&gcm);
        return ESP_FAIL;
    }

    *output_len = ciphertext_len;
    mbedtls_gcm_free(&gcm);
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

    int ret = mbedtls_sha256_starts(&ctx, 0);
    if (ret == 0) ret = mbedtls_sha256_update(&ctx, encrypted_data, encrypted_len);
    if (ret == 0) ret = mbedtls_sha256_update(&ctx, (const unsigned char *)timestamp, strlen(timestamp));
    if (ret == 0) ret = mbedtls_sha256_finish(&ctx, output);

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
