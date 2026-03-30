/**
 * @file atecc608a.h
 * @brief ATECC608A secure element driver
 *
 * Hardware wiring (I2C_NUM_1):
 *   VCC  → 3.3 V  (board pin 8)
 *   GND  → GND    (board pin 4)
 *   SDA  → GPIO 3 (board pin 3)
 *   SCL  → GPIO 7 (board pin 7)
 *
 * Phase 1 – Detection
 *   atecc608a_init()     initialises I2C_NUM_1 and verifies the chip
 *                        is alive by checking the 4-byte wake response.
 *
 * Phase 2 – Hardware SHA-256
 *   atecc608a_sha256()   delegates a SHA-256 computation to the
 *                        ATECC608A hardware engine (SHA-Start → Update
 *                        → End flow).  Falls back to mbedTLS if the
 *                        chip is absent.
 */

#pragma once
#include "esp_err.h"
#include <stdint.h>
#include <stddef.h>
#include <stdbool.h>

/* ── Pin / bus constants ─────────────────────────────────────────────── */
#define ATECC_SDA_GPIO      3
#define ATECC_SCL_GPIO      7
#define ATECC_I2C_PORT      I2C_NUM_1
#define ATECC_I2C_FREQ_HZ   100000      /* 100 kHz – conservative, chip ok to 1 MHz */
#define ATECC_ADDR          0x60        /* 7-bit I2C address (A0/A1/A2 = GND) */

/* ── Digest size ─────────────────────────────────────────────────────── */
#define ATECC_SHA_LEN       32

/**
 * @brief Initialise I2C_NUM_1 and verify the ATECC608A is present.
 *
 * Sends the wake token, reads the 4-byte wake response and validates it.
 * Logs a prominent OK / FAIL banner to the serial monitor so you can
 * confirm the physical connection before the entropy loop starts.
 *
 * After this call use atecc608a_present() to query the result.
 *
 * @return ESP_OK  – chip responded with a valid wake packet.
 *         ESP_FAIL – chip not found / CRC mismatch / wiring error.
 */
esp_err_t atecc608a_init(void);

/**
 * @brief Query whether the ATECC608A was successfully detected at boot.
 *
 * @return true if atecc608a_init() previously returned ESP_OK.
 */
bool atecc608a_present(void);

/**
 * @brief Compute SHA-256 using the ATECC608A hardware engine.
 *
 * Handles arbitrary-length input by streaming 64-byte Update blocks
 * followed by a final End block for the remaining bytes (0–63).
 *
 * @param data    Input buffer.
 * @param len     Number of bytes to hash.
 * @param digest  32-byte output buffer.
 * @return ESP_OK on success, ESP_FAIL on I2C or CRC error.
 */
esp_err_t atecc608a_sha256(const uint8_t *data, size_t len,
                            uint8_t digest[ATECC_SHA_LEN]);
