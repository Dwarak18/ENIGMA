/**
 * @file camera.h
 * @brief ESP32-CAM image capture and bitstream extraction interface
 */

#pragma once

#include "esp_err.h"
#include <stdint.h>
#include <stddef.h>

#include "config.h"

#if CAMERA_ENABLED

#include "mbedtls/sha256.h"

/**
 * Initialize camera hardware
 * @return ESP_OK on success
 */
esp_err_t camera_init(void);

/**
 * Capture image and extract bitstream (64 or 128 bits)
 * @param bitstream_out Output buffer for extracted bits
 * @param out_len       Pointer to store actual length (bytes)
 * @return ESP_OK on success
 */
esp_err_t camera_capture_bitstream(uint8_t *bitstream_out, size_t *out_len);

/**
 * Compute SHA-256 hash of bitstream
 * @param bitstream  Input bitstream bytes
 * @param len        Length of bitstream
 * @param hash_out   Output buffer (32 bytes)
 * @return ESP_OK on success
 */
esp_err_t camera_hash_bitstream(const uint8_t *bitstream, size_t len, 
                                uint8_t *hash_out);

#endif /* CAMERA_ENABLED */
