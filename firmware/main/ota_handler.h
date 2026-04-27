/**
 * @file ota_handler.h
 * @brief OTA update handler with WebSocket pause/resume logic
 *
 * Secure OTA update process:
 *   1. Begin OTA → pause WebSocket and entropy collection
 *   2. Download and verify firmware
 *   3. Write to OTA partition
 *   4. Verify rollback partition
 *   5. Reboot
 *   6. On successful boot → mark app valid and cancel rollback
 *   7. Auto-resume WebSocket
 *
 * This prevents partial image uploads during firmware replacement.
 */

#pragma once

#include "esp_err.h"
#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

/**
 * Initialize OTA handler
 * - Must be called after WebSocket and entropy task are running
 */
esp_err_t ota_handler_init(void);

/**
 * Mark OTA update in progress
 * - Pauses WebSocket streaming
 * - Stops entropy collection temporarily
 * - Called by OTA begin event
 */
void ota_handler_begin(void);

/**
 * Mark OTA update complete
 * - Called by OTA complete event (just before reboot)
 * - Does NOT resume tasks (reboot happens immediately)
 */
void ota_handler_complete(void);

/**
 * Handle post-OTA boot validation
 * - Call this in app_main AFTER successful boot
 * - Marks app as valid (prevents rollback)
 * - Resumes WebSocket streaming
 * - Resumes entropy collection
 */
esp_err_t ota_handler_validate_and_resume(void);

/**
 * Check if device is currently in OTA mode
 */
bool ota_handler_is_ota_in_progress(void);

#ifdef __cplusplus
}
#endif
