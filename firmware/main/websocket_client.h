/**
 * @file websocket_client.h
 * @brief WebSocket client interface for real-time encrypted image streaming
 *
 * Provides:
 *   - Persistent WebSocket connection management
 *   - Auto-reconnect with exponential backoff
 *   - Binary frame handler for chunked image data
 *   - Non-blocking FreeRTOS task interface
 *
 * Usage:
 *   1. Call websocket_init() once at startup
 *   2. Call websocket_send_image_chunk() for each image chunk
 *   3. On OTA, call websocket_pause() / websocket_resume()
 */

#pragma once

#include "esp_err.h"
#include <stdint.h>
#include <stddef.h>

#ifdef __cplusplus
extern "C" {
#endif

/* ── Status codes ─────────────────────────────────────────────────── */
typedef enum {
    WS_CONNECTED,
    WS_CONNECTING,
    WS_RECONNECTING,
    WS_DISCONNECTED,
    WS_ERROR,
    WS_OTA_PAUSED,
} websocket_state_t;

/* ── Image chunk payload ──────────────────────────────────────────── */
typedef struct {
    char         device_id[32];
    uint64_t     timestamp;
    uint16_t     chunk_id;
    uint16_t     total_chunks;
    uint8_t      iv[16];                /* AES IV (random per chunk) */
    uint16_t     encrypted_data_len;
    uint8_t      encrypted_data[4096];  /* Encrypted chunk data */
    char         hash[65];               /* SHA-256(encrypted + timestamp + device_id) */
} websocket_chunk_t;

/* ── Lifecycle ─────────────────────────────────────────────────────– */

/**
 * Initialize WebSocket client.
 * - Spawns FreeRTOS task for connection management
 * - Configures auto-reconnect with exponential backoff
 * @return ESP_OK on success
 */
esp_err_t websocket_init(void);

/**
 * Get current WebSocket connection state
 */
websocket_state_t websocket_get_state(void);

/**
 * Check if WebSocket is ready to send
 */
bool websocket_is_ready(void);

/**
 * Pause WebSocket streaming (e.g., during OTA)
 */
void websocket_pause(void);

/**
 * Resume WebSocket streaming after OTA
 */
void websocket_resume(void);

/* ── Streaming ────────────────────────────────────────────────────– */

/**
 * Send an encrypted image chunk over WebSocket
 * - Non-blocking call
 * - Queues chunk for async transmission
 * @param chunk Pointer to chunk data (copied internally)
 * @return ESP_OK if queued, ESP_FAIL if not connected or queue full
 */
esp_err_t websocket_send_image_chunk(const websocket_chunk_t *chunk);

/* ── Callbacks (called from WebSocket task) ──────────────────────– */

/**
 * Optional callback on connection established
 * @param user_data Passed from websocket_init
 */
typedef void (*websocket_on_connect_t)(void *user_data);

/**
 * Optional callback on disconnection
 * @param reason Reason string (e.g., "network error", "normal close")
 * @param user_data Passed from websocket_init
 */
typedef void (*websocket_on_disconnect_t)(const char *reason, void *user_data);

/**
 * Optional callback on message received from backend
 * @param data Pointer to message data
 * @param len Message length
 * @param user_data Passed from websocket_init
 */
typedef void (*websocket_on_message_t)(const void *data, size_t len, void *user_data);

/**
 * Extended init with callbacks
 * @param host WebSocket host (e.g., "ws://172.20.137.1:3000")
 * @param on_connect Connect callback (can be NULL)
 * @param on_disconnect Disconnect callback (can be NULL)
 * @param on_message Message callback (can be NULL)
 * @param user_data Opaque data passed to callbacks
 * @return ESP_OK on success
 */
esp_err_t websocket_init_with_callbacks(
    const char *host,
    websocket_on_connect_t on_connect,
    websocket_on_disconnect_t on_disconnect,
    websocket_on_message_t on_message,
    void *user_data
);

#ifdef __cplusplus
}
#endif
