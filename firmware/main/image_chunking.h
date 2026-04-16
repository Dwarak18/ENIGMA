/**
 * @file image_chunking.h
 * @brief Image frame → encrypted chunks with SHA-256 integrity verification
 *
 * Pipeline:
 *   1. Capture raw image frame (320×240 grayscale)
 *   2. Extract bitstream (128 bits from sampled pixels)
 *   3. Generate random IV
 *   4. Encrypt bitstream with AES-256-CBC (key = entropy)
 *   5. Compute SHA-256(encrypted_data + timestamp + device_id)
 *   6. Queue chunk to WebSocket sender
 *
 * Uses AES hardware acceleration on ESP32-S3 for performance.
 */

#pragma once

#include "esp_err.h"
#include <stdint.h>
#include <stddef.h>

#ifdef __cplusplus
extern "C" {
#endif

/* ── Chunk format ────────────────────────────────────────────────── */
typedef struct {
    uint16_t  chunk_id;
    uint16_t  total_chunks;
    uint8_t   iv[16];
    uint8_t   encrypted_data[256];  /* For typical image bitstream */
    size_t    encrypted_len;
    char      hash[65];              /* SHA-256 hex, null-terminated */
} image_chunk_t;

/**
 * Initialize image chunking module
 * - Allocates buffers for frame capture / processing
 * @return ESP_OK on success
 */
esp_err_t image_chunking_init(void);

/**
 * Process camera frame → encrypted chunk
 *
 * Steps:
 *   1. Capture raw frame
 *   2. Extract bitstream
 *   3. Generate random IV
 *   4. Encrypt with AES-256-CBC
 *   5. Compute integrity hash
 *
 * @param entropy_key 32-byte AES key (raw entropy bytes)
 * @param timestamp UNIX time (included in hash)
 * @param device_id Device identifier (included in hash)
 * @param out_chunk Output chunk struct
 * @return ESP_OK on success, ESP_FAIL on capture/processing error
 */
esp_err_t image_chunking_process_frame(
    const uint8_t *entropy_key,  /* 32 bytes for AES-256 */
    uint64_t timestamp,
    const char *device_id,
    image_chunk_t *out_chunk
);

#ifdef __cplusplus
}
#endif
