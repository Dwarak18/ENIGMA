/**
 * @file camera.c
 * @brief ESP32-CAM image capture and bitstream extraction
 *
 * Captures image and extracts 64 or 128 bits from pixel data.
 * The extracted bits are then AES-256 encrypted before transmission.
 */

#include "camera.h"
#include "config.h"

#if CAMERA_ENABLED

#include "esp_camera.h"
#include "esp_log.h"
#include <string.h>
#include <stdint.h>

static const char *TAG = "camera";

/* ── Camera pin configuration for AI-Thinker ESP32-CAM ──────────────── */
#if CAMERA_MODEL_AI_THINKER
#define CAM_PIN_PWDN    32
#define CAM_PIN_RESET   -1
#define CAM_PIN_XCLK    0
#define CAM_PIN_SIOD    26
#define CAM_PIN_SIOC    27
#define CAM_PIN_D7      35
#define CAM_PIN_D6      34
#define CAM_PIN_D5      39
#define CAM_PIN_D4      36
#define CAM_PIN_D3      21
#define CAM_PIN_D2      19
#define CAM_PIN_D1      18
#define CAM_PIN_D0       5
#define CAM_PIN_VSYNC   25
#define CAM_PIN_HREF    23
#define CAM_PIN_PCLK    22
#define CAM_PIN_XCLK_FREQ 20000000  /* 20 MHz */
#endif

/* ── Camera initialization ──────────────────────────────────────────── */

esp_err_t camera_init(void)
{
    camera_config_t config = {
        .pin_pwdn       = CAM_PIN_PWDN,
        .pin_reset      = CAM_PIN_RESET,
        .pin_xclk       = CAM_PIN_XCLK,
        .pin_sscb_sda   = CAM_PIN_SIOD,
        .pin_sscb_scl   = CAM_PIN_SIOC,
        .pin_d7         = CAM_PIN_D7,
        .pin_d6         = CAM_PIN_D6,
        .pin_d5         = CAM_PIN_D5,
        .pin_d4         = CAM_PIN_D4,
        .pin_d3         = CAM_PIN_D3,
        .pin_d2         = CAM_PIN_D2,
        .pin_d1         = CAM_PIN_D1,
        .pin_d0         = CAM_PIN_D0,
        .pin_vsync      = CAM_PIN_VSYNC,
        .pin_href       = CAM_PIN_HREF,
        .pin_pclk       = CAM_PIN_PCLK,
        .xclk_freq_hz   = CAM_PIN_XCLK_FREQ,
        .ledc_timer     = LEDC_TIMER_0,
        .ledc_channel   = LEDC_CHANNEL_0,
        .pixel_format   = PIXFORMAT_GRAYSCALE,  /* 1 byte per pixel for simplicity */
        .frame_size     = FRAMESIZE_QVGA,       /* 320x240 */
        .jpeg_quality   = 12,
        .fb_count       = 2,
        .grab_mode      = CAMERA_GRAB_WHEN_EMPTY
    };

    esp_err_t err = esp_camera_init(&config);
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "Camera init failed: 0x%x", err);
        return err;
    }

    ESP_LOGI(TAG, "Camera initialized (%dx%d grayscale)", 
             config.frame_size == FRAMESIZE_QVGA ? 320 : 640,
             config.frame_size == FRAMESIZE_QVGA ? 240 : 480);
    
    return ESP_OK;
}

/* ── Capture image and extract bitstream ────────────────────────────── */

esp_err_t camera_capture_bitstream(uint8_t *bitstream_out, size_t *out_len)
{
    if (!bitstream_out || !out_len) {
        return ESP_ERR_INVALID_ARG;
    }

    /* Calculate bytes needed: 128 bits = 16 bytes, 64 bits = 8 bytes */
    size_t bytes_needed = IMAGE_BITSTREAM_BITS / 8;
    if (bytes_needed > 16) {
        ESP_LOGE(TAG, "Invalid bitstream size: %d bits", IMAGE_BITSTREAM_BITS);
        return ESP_ERR_INVALID_ARG;
    }

    /* Capture frame */
    camera_fb_t *fb = esp_camera_fb_get();
    if (!fb) {
        ESP_LOGE(TAG, "Frame buffer capture failed");
        return ESP_ERR_NOT_FOUND;
    }

    ESP_LOGI(TAG, "Captured image: %dx%d, size: %zu bytes", 
             fb->width, fb->height, fb->len);

    /* Extract bitstream from image pixels */
    /* Strategy: Sample pixels at regular intervals and extract LSB */
    memset(bitstream_out, 0, bytes_needed);
    
    size_t pixel_stride = fb->len / (IMAGE_BITSTREAM_BITS * 2);
    if (pixel_stride < 1) pixel_stride = 1;
    
    for (int i = 0; i < IMAGE_BITSTREAM_BITS; i++) {
        size_t pixel_idx = i * pixel_stride;
        if (pixel_idx >= fb->len) {
            pixel_idx = fb->len - 1;
        }
        
        uint8_t pixel = fb->buf[pixel_idx];
        uint8_t bit = pixel & 0x01;  /* Extract LSB */
        
        /* Set bit in output buffer */
        size_t byte_idx = i / 8;
        size_t bit_idx = i % 8;
        if (bit) {
            bitstream_out[byte_idx] |= (1 << (7 - bit_idx));
        }
    }

    *out_len = bytes_needed;

    ESP_LOGI(TAG, "Extracted %d-bit bitstream from image", IMAGE_BITSTREAM_BITS);
    ESP_LOG_BUFFER_HEXDUMP(TAG, bitstream_out, bytes_needed, ESP_LOG_DEBUG);

    /* Return frame buffer */
    esp_camera_fb_return(fb);

    return ESP_OK;
}

/* ── Compute SHA-256 hash of bitstream ──────────────────────────────── */

esp_err_t camera_hash_bitstream(const uint8_t *bitstream, size_t len, 
                                uint8_t *hash_out)
{
    if (!bitstream || !hash_out || len == 0) {
        return ESP_ERR_INVALID_ARG;
    }

    /* Use mbedTLS SHA-256 */
    mbedtls_sha256_context sha_ctx;
    mbedtls_sha256_init(&sha_ctx);
    
    int ret = mbedtls_sha256_starts_ret(&sha_ctx, 0);  /* 0 = SHA-256 */
    if (ret != 0) {
        ESP_LOGE(TAG, "SHA-256 start failed: -0x%04X", -ret);
        mbedtls_sha256_free(&sha_ctx);
        return ESP_FAIL;
    }

    ret = mbedtls_sha256_update_ret(&sha_ctx, bitstream, len);
    if (ret != 0) {
        ESP_LOGE(TAG, "SHA-256 update failed: -0x%04X", -ret);
        mbedtls_sha256_free(&sha_ctx);
        return ESP_FAIL;
    }

    ret = mbedtls_sha256_finish_ret(&sha_ctx, hash_out);
    if (ret != 0) {
        ESP_LOGE(TAG, "SHA-256 finish failed: -0x%04X", -ret);
        mbedtls_sha256_free(&sha_ctx);
        return ESP_FAIL;
    }

    mbedtls_sha256_free(&sha_ctx);

    ESP_LOGI(TAG, "Computed SHA-256 hash of bitstream");
    return ESP_OK;
}

#endif /* CAMERA_ENABLED */
