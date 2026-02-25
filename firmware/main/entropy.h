/**
 * @file entropy.h
 * @brief Entropy collection interface
 *
 * Future extension: add camera-based noise source via
 * entropy_add_camera_noise() without changing callers.
 */

#pragma once
#include <stdint.h>
#include <stddef.h>

/**
 * @brief Collect raw entropy bytes from hardware RNG.
 *
 * Fills @p buf with @p len bytes from esp_fill_random().
 * Additional noise sources (camera, ADC) can be XOR-mixed here
 * in a future revision without changing the calling code.
 *
 * @param buf   Output buffer (must be at least @p len bytes)
 * @param len   Number of entropy bytes to collect
 */
void entropy_collect(uint8_t *buf, size_t len);
