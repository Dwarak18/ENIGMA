/**
 * @file image_chunking.c
 * @brief Image processing pipeline: capture → encrypt → hash → chunk
 *
 * Integrates with:
 *   - camera.c (bitstream capture)
 *   - aes_encryption.c (AES-256-CBC)
 *   - mbedTLS SHA-256 (integrity hash)
 *   - crypto.c (hex conversion utilities)
 */

#include "image_chunking.h"
#include "config.h"
#include "crypto.h"
#include "esp_log.h"

#if CAMERA_ENABLED
#include "camera.h"
#include "aes_encryption.h"
#endif

#include "mbedtls/sha256.h"

#include <string.h>
#include <stdio.h>

static const char *TAG = "img_chunk";

/* ── Internal state ──────────────────────────────────────────────────– */
typedef struct {
    bool initialized;
} image_chunking_ctx_t;

static image_chunking_ctx_t s_ctx = { .initialized = false };

/* ── Helper: Compute integrity hash ──────────────────────────────────– */

/**
 * Compute SHA-256(encrypted_data || timestamp || device_id) as raw bytes
 * This is the critical integrity hash per the spec.
 */
static void compute_integrity_hash_raw(
    const uint8_t *encrypted_data,
    size_t encrypted_len,
    uint64_t timestamp,
    const char *device_id,
    uint8_t *out_hash_raw)  /* 32 bytes */
{
    mbedtls_sha256_context sha_ctx;
    
    mbedtls_sha256_init(&sha_ctx);
    mbedtls_sha256_starts(&sha_ctx, 0);  /* SHA-256, not SHA-224 */
    
    /* Hash: encrypted_data || timestamp (as 8-byte big-endian) || device_id */
    mbedtls_sha256_update(&sha_ctx, encrypted_data, encrypted_len);
    
    uint8_t ts_bytes[8];
    for (int i = 0; i < 8; i++) {
        ts_bytes[i] = (timestamp >> (8 * (7 - i))) & 0xFF;
    }
    mbedtls_sha256_update(&sha_ctx, ts_bytes, 8);
    
    mbedtls_sha256_update(&sha_ctx, (const uint8_t *)device_id, strlen(device_id));
    
    mbedtls_sha256_finish(&sha_ctx, out_hash_raw);
    mbedtls_sha256_free(&sha_ctx);
    
    ESP_LOGD(TAG, "Integrity hash computed");
}

/* ── Public API ──────────────────────────────────────────────────────– */

esp_err_t image_chunking_init(void) {
    /* Camera init is already handled in main.c, just mark as ready */
    s_ctx.initialized = true;
    ESP_LOGI(TAG, "Image chunking initialized");
    return ESP_OK;
}

esp_err_t image_chunking_process_frame(
    const uint8_t *entropy_key,
    uint64_t timestamp,
    const char *device_id,
    image_chunk_t *out_chunk)
{
    if (!s_ctx.initialized || !entropy_key || !device_id || !out_chunk) {
        return ESP_ERR_INVALID_ARG;
    }
    
#if !CAMERA_ENABLED
    /* Stubbed for non-camera builds */
    ESP_LOGW(TAG, "Camera disabled, stubbing chunk");
    memset(out_chunk, 0, sizeof(*out_chunk));
    strcpy(out_chunk->hash, "0000000000000000000000000000000000000000000000000000000000000000");
    return ESP_OK;
#endif

    /* 1. Capture and extract bitstream using existing camera module */
    uint8_t bitstream[16];  /* 128 bits = 16 bytes */
    size_t bits_len = 0;
    esp_err_t ret = camera_capture_bitstream(bitstream, &bits_len);
    if (ret != ESP_OK || bits_len == 0) {
        ESP_LOGE(TAG, "Failed to capture bitstream");
        return ESP_FAIL;
    }
    
    /* 2. Generate random IV and encrypt using existing AES module */
    uint8_t iv_raw[16];
    ret = aes_generate_iv(iv_raw);
    if (ret != ESP_OK) {
        ESP_LOGE(TAG, "Failed to generate IV");
        return ESP_FAIL;
    }
    memcpy(out_chunk->iv, iv_raw, 16);
    
    /* 3. Encrypt bitstream using entropy as AES key */
    ret = aes_encrypt_bitstream(
        bitstream, bits_len,
        entropy_key,  /* 32 bytes for AES-256 */
        iv_raw,
        out_chunk->encrypted_data,
        &out_chunk->encrypted_len
    );
    if (ret != ESP_OK) {
        ESP_LOGE(TAG, "Encryption failed");
        return ESP_FAIL;
    }
    
    /* 4. Compute integrity hash: SHA-256(encrypted_data + timestamp + device_id) */
    uint8_t hash_raw[32];
    compute_integrity_hash_raw(
        out_chunk->encrypted_data,
        out_chunk->encrypted_len,
        timestamp,
        device_id,
        hash_raw
    );
    
    /* 5. Convert hash to hex string using existing crypto utility */
    crypto_bytes_to_hex(hash_raw, 32, out_chunk->hash);
    
    /* 6. Fill in chunk metadata */
    out_chunk->chunk_id = 0;      /* Single chunk per frame for now */
    out_chunk->total_chunks = 1;
    
    ESP_LOGI(TAG, "Processed frame: %u bytes encrypted, hash: %.8s...",
             (unsigned)out_chunk->encrypted_len, out_chunk->hash);
    
    return ESP_OK;
}
