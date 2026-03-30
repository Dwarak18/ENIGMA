/**
 * @file aes_encryption.c
 * @brief AES-256 encryption for image bitstream
 *
 * Uses ESP32 hardware AES accelerator (esp_aes) for efficiency.
 * Encrypts image bitstream using entropy-derived key.
 */

#include "aes_encryption.h"
#include "config.h"

#if CAMERA_ENABLED

#include "esp_aes.h"
#include "esp_log.h"
#include <string.h>
#include <stdint.h>

static const char *TAG = "aes_enc";

/* ── AES-256 encryption (CBC mode) ──────────────────────────────────── */

esp_err_t aes_encrypt_bitstream(const uint8_t *plaintext, size_t pt_len,
                                const uint8_t *key_256, const uint8_t *iv_16,
                                uint8_t *ciphertext_out, size_t *out_len)
{
    if (!plaintext || !key_256 || !iv_16 || !ciphertext_out || !out_len) {
        return ESP_ERR_INVALID_ARG;
    }

    /* AES block size is 16 bytes */
    if (pt_len == 0 || pt_len > 32) {  /* Max 256 bits (32 bytes) */
        ESP_LOGE(TAG, "Invalid plaintext length: %zu", pt_len);
        return ESP_ERR_INVALID_ARG;
    }

    /* Pad to 16-byte boundary using PKCS7 padding */
    uint8_t padded[32];  /* Max 2 blocks */
    size_t padded_len = ((pt_len + 15) / 16) * 16;
    
    memcpy(padded, plaintext, pt_len);
    
    /* PKCS7 padding */
    uint8_t pad_value = 16 - (pt_len % 16);
    memset(padded + pt_len, pad_value, pad_value);

    ESP_LOGI(TAG, "AES-256 encrypting %zu bytes (padded to %zu)", pt_len, padded_len);

    /* Initialize AES context */
    esp_aes_context aes;
    esp_aes_init(&aes);

    /* Set 256-bit key */
    int ret = esp_aes_setkey(&aes, key_256, 256);  /* 256 = key bits */
    if (ret != 0) {
        ESP_LOGE(TAG, "AES setkey failed: %d", ret);
        esp_aes_free(&aes);
        return ESP_FAIL;
    }

    /* Set IV */
    uint8_t iv[16];
    memcpy(iv, iv_16, 16);

    /* Encrypt in CBC mode */
    ret = esp_aes_crypt_cbc(&aes, ESP_AES_ENCRYPT, padded_len, iv, padded, ciphertext_out);
    if (ret != 0) {
        ESP_LOGE(TAG, "AES CBC encrypt failed: %d", ret);
        esp_aes_free(&aes);
        return ESP_FAIL;
    }

    *out_len = padded_len;

    ESP_LOGI(TAG, "AES encryption complete: %zu bytes", padded_len);
    ESP_LOG_BUFFER_HEXDUMP(TAG, ciphertext_out, padded_len, ESP_LOG_DEBUG);

    esp_aes_free(&aes);
    return ESP_OK;
}

/* ── AES-256 decryption (for verification) ──────────────────────────── */

esp_err_t aes_decrypt_bitstream(const uint8_t *ciphertext, size_t ct_len,
                                const uint8_t *key_256, const uint8_t *iv_16,
                                uint8_t *plaintext_out, size_t *out_len)
{
    if (!ciphertext || !key_256 || !iv_16 || !plaintext_out || !out_len) {
        return ESP_ERR_INVALID_ARG;
    }

    /* Ciphertext must be multiple of 16 bytes */
    if (ct_len == 0 || ct_len % 16 != 0) {
        ESP_LOGE(TAG, "Invalid ciphertext length: %zu", ct_len);
        return ESP_ERR_INVALID_ARG;
    }

    ESP_LOGI(TAG, "AES-256 decrypting %zu bytes", ct_len);

    /* Initialize AES context */
    esp_aes_context aes;
    esp_aes_init(&aes);

    /* Set 256-bit key */
    int ret = esp_aes_setkey(&aes, key_256, 256);
    if (ret != 0) {
        ESP_LOGE(TAG, "AES setkey failed: %d", ret);
        esp_aes_free(&aes);
        return ESP_FAIL;
    }

    /* Set IV */
    uint8_t iv[16];
    memcpy(iv, iv_16, 16);

    /* Decrypt in CBC mode */
    ret = esp_aes_crypt_cbc(&aes, ESP_AES_DECRYPT, ct_len, iv, ciphertext, plaintext_out);
    if (ret != 0) {
        ESP_LOGE(TAG, "AES CBC decrypt failed: %d", ret);
        esp_aes_free(&aes);
        return ESP_FAIL;
    }

    /* Remove PKCS7 padding */
    uint8_t pad_value = plaintext_out[ct_len - 1];
    if (pad_value > 16 || pad_value == 0) {
        ESP_LOGE(TAG, "Invalid PKCS7 padding: %d", pad_value);
        esp_aes_free(&aes);
        return ESP_FAIL;
    }

    *out_len = ct_len - pad_value;

    ESP_LOGI(TAG, "AES decryption complete: %zu bytes", *out_len);
    ESP_LOG_BUFFER_HEXDUMP(TAG, plaintext_out, *out_len, ESP_LOG_DEBUG);

    esp_aes_free(&aes);
    return ESP_OK;
}

/* ── Generate random IV from hardware TRNG ──────────────────────────── */

esp_err_t aes_generate_iv(uint8_t *iv_out)
{
    if (!iv_out) {
        return ESP_ERR_INVALID_ARG;
    }

    /* Use ESP32 hardware random number generator */
    for (int i = 0; i < 16; i++) {
        iv_out[i] = esp_random() & 0xFF;
    }

    ESP_LOGI(TAG, "Generated random IV");
    ESP_LOG_BUFFER_HEXDUMP(TAG, iv_out, 16, ESP_LOG_DEBUG);

    return ESP_OK;
}

#endif /* CAMERA_ENABLED */
