/**
 * @file wifi.h
 * @brief Wi-Fi station connection interface.
 */

#pragma once

#include "esp_err.h"
#include <stdint.h>
#include <stdbool.h>

/**
 * @brief Connect to Wi-Fi in station mode.
 *
 * @param ssid Wi-Fi SSID
 * @param password Wi-Fi password
 * @param max_retry Maximum reconnect attempts
 * @return ESP_OK on successful connection
 */
esp_err_t wifi_connect_sta(const char *ssid, const char *password, uint8_t max_retry);

/**
 * @brief Returns true if station is currently connected.
 */
bool wifi_is_connected(void);

