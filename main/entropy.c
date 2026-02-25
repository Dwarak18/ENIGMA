/**
 * @file entropy.c
 * @brief Entropy collection – hardware RNG (ESP32-S3)
 */

#include "entropy.h"
#include "esp_system.h"
#include "esp_random.h"

void entropy_init(void)
{
    // No init needed
}

uint32_t entropy_generate(void)
{
    return esp_random();
}
