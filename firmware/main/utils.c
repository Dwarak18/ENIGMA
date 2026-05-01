/**
 * @file utils.c
 * @brief Common utility helpers.
 */

#include "utils.h"

uint8_t bcd_to_dec(uint8_t bcd)
{
    return (uint8_t)(((bcd >> 4) * 10U) + (bcd & 0x0FU));
}

