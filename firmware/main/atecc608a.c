/**
 * @file atecc608a.c
 * @brief ATECC608A secure element driver – detection + hardware SHA-256
 *
 * Protocol reference: Microchip ATECC608A datasheet DS40002004
 *
 * I2C framing:
 *   Every I2C write to the chip starts with a "word address" byte that
 *   selects the command/data/reset/sleep/idle channel:
 *     0x03 – Command (followed by a full command packet)
 *     0x01 – Sleep
 *     0x02 – Idle
 *
 * Command packet layout  (sent after the word address byte):
 *   [COUNT][OPCODE][PARAM1][PARAM2_L][PARAM2_H][DATA...][CRC0][CRC1]
 *   COUNT = total bytes in this array (including COUNT and CRC bytes)
 *         = 7 + sizeof(DATA)
 *
 * CRC:  CRC-16 / polynomial 0x8005 / init 0x0000 / no reflect
 *       Computed over: COUNT … last DATA byte (everything except CRC).
 *
 * Wake token:
 *   Write a single 0x00 byte to I2C address 0x00 (no ACK required).
 *   This drives SDA low ≥ tWLO (60 µs), waking the chip from sleep.
 *   Wait tWHI (≥ 1.5 ms) then read the 4-byte wake response from 0x60.
 *   Expected bytes: { 0x04, 0x11, 0x33, 0x43 }
 */

#include "atecc608a.h"

#include "driver/i2c.h"
#include "esp_log.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"

#include "mbedtls/sha256.h"   /* software fallback in atecc608a_sha256() */

#include <string.h>
#include <stdio.h>

static const char *TAG = "ATECC608A";

/* ── Module state ────────────────────────────────────────────────────── */
static bool s_present = false;

/* ════════════════════════════════════════════════════════════════════ */
/*  CRC-16 (ATECC variant, poly 0x8005, init 0, no reflection)         */
/* ════════════════════════════════════════════════════════════════════ */

/**
 * Compute the ATECC608A CRC over @p len bytes of @p data.
 * Result is written little-endian into crc_out[0..1].
 */
static void atca_crc(const uint8_t *data, size_t len, uint8_t crc_out[2])
{
    uint16_t crc = 0;
    uint16_t poly = 0x8005;

    for (size_t i = 0; i < len; i++) {
        for (uint8_t shift = 0x01; shift != 0; shift <<= 1) {
            uint8_t data_bit = (data[i] & shift) ? 1 : 0;
            uint8_t crc_bit  = (uint8_t)(crc >> 15);
            crc <<= 1;
            if (data_bit != crc_bit) crc ^= poly;
        }
    }
    crc_out[0] = (uint8_t)(crc & 0xFF);
    crc_out[1] = (uint8_t)(crc >> 8);
}

/* ════════════════════════════════════════════════════════════════════ */
/*  Low-level I2C helpers                                               */
/* ════════════════════════════════════════════════════════════════════ */

/**
 * Read @p count bytes from the ATECC608A into @p buf.
 * The chip always sends LENGTH as the first byte (= total bytes returned
 * including LENGTH and the 2 trailing CRC bytes).
 */
static esp_err_t atecc_i2c_read(uint8_t *buf, uint8_t count)
{
    i2c_cmd_handle_t cmd = i2c_cmd_link_create();
    i2c_master_start(cmd);
    i2c_master_write_byte(cmd, (ATECC_ADDR << 1) | I2C_MASTER_READ, true);
    if (count > 1) {
        i2c_master_read(cmd, buf, count - 1, I2C_MASTER_ACK);
    }
    i2c_master_read_byte(cmd, &buf[count - 1], I2C_MASTER_NACK);
    i2c_master_stop(cmd);

    esp_err_t ret = i2c_master_cmd_begin(ATECC_I2C_PORT, cmd,
                                         pdMS_TO_TICKS(200));
    i2c_cmd_link_delete(cmd);
    return ret;
}

/**
 * Write the word-address byte + @p pkt_len bytes of @p pkt to the chip.
 */
static esp_err_t atecc_i2c_write(uint8_t word_addr,
                                  const uint8_t *pkt, uint8_t pkt_len)
{
    i2c_cmd_handle_t cmd = i2c_cmd_link_create();
    i2c_master_start(cmd);
    i2c_master_write_byte(cmd, (ATECC_ADDR << 1) | I2C_MASTER_WRITE, true);
    i2c_master_write_byte(cmd, word_addr, true);
    if (pkt_len > 0) {
        i2c_master_write(cmd, (uint8_t *)pkt, pkt_len, true);
    }
    i2c_master_stop(cmd);

    esp_err_t ret = i2c_master_cmd_begin(ATECC_I2C_PORT, cmd,
                                         pdMS_TO_TICKS(200));
    i2c_cmd_link_delete(cmd);
    return ret;
}

/* ════════════════════════════════════════════════════════════════════ */
/*  ATECC608A power management                                          */
/* ════════════════════════════════════════════════════════════════════ */

/**
 * Send the wake token (I2C write to address 0x00), then read and
 * validate the 4-byte wake response { 0x04, 0x11, 0x33, 0x43 }.
 *
 * @return ESP_OK on valid wake response, ESP_FAIL otherwise.
 */
static esp_err_t atecc_wake(void)
{
    /* ── Wake token ───────────────────────────────────────────────── */
    /* Drive SDA low by attempting a write to I2C address 0.
     * The chip is not on the bus at this address, so no ACK is needed.
     * The I2C start + address byte is long enough to satisfy tWLO ≥ 60µs
     * at 100 kHz (address byte = 9 clock cycles × 10µs = 90µs). */
    i2c_cmd_handle_t cmd = i2c_cmd_link_create();
    i2c_master_start(cmd);
    i2c_master_write_byte(cmd, 0x00, false);   /* no ACK check */
    i2c_master_stop(cmd);
    i2c_master_cmd_begin(ATECC_I2C_PORT, cmd, pdMS_TO_TICKS(10));
    i2c_cmd_link_delete(cmd);

    /* Wait tWHI: chip needs ≥ 1.5 ms to power up its oscillator */
    vTaskDelay(pdMS_TO_TICKS(2));

    /* ── Read wake response ───────────────────────────────────────── */
    uint8_t resp[4] = {0};
    esp_err_t ret = atecc_i2c_read(resp, 4);
    if (ret != ESP_OK) {
        ESP_LOGE(TAG, "Wake read failed (I2C err 0x%x) – check wiring", ret);
        return ESP_FAIL;
    }

    /* Validate length byte */
    if (resp[0] != 0x04) {
        ESP_LOGE(TAG, "Wake: bad length byte 0x%02X (expected 0x04)", resp[0]);
        return ESP_FAIL;
    }

    /* Validate status byte: 0x11 = after-wake status */
    if (resp[1] != 0x11) {
        ESP_LOGE(TAG, "Wake: bad status 0x%02X (expected 0x11)", resp[1]);
        return ESP_FAIL;
    }

    /* Validate CRC over the first two bytes */
    uint8_t crc[2];
    atca_crc(resp, 2, crc);
    if (crc[0] != resp[2] || crc[1] != resp[3]) {
        ESP_LOGE(TAG, "Wake: CRC mismatch (got %02X%02X, exp %02X%02X)",
                 resp[2], resp[3], crc[0], crc[1]);
        return ESP_FAIL;
    }

    return ESP_OK;
}

/**
 * Send the sleep word-address (0x01).  The chip enters low-power sleep
 * and requires a new wake token before the next command.
 */
static void atecc_sleep(void)
{
    atecc_i2c_write(0x01, NULL, 0);
    vTaskDelay(pdMS_TO_TICKS(2));
}

/* ════════════════════════════════════════════════════════════════════ */
/*  ATECC command helpers                                               */
/* ════════════════════════════════════════════════════════════════════ */

/**
 * Build and send a command packet to the chip.
 *
 * @param opcode   ATECC opcode byte.
 * @param param1   Mode / param1 byte.
 * @param param2   16-bit param2 (sent little-endian).
 * @param data     Optional extra data (NULL if none).
 * @param data_len Length of @p data.
 */
static esp_err_t atecc_send_cmd(uint8_t opcode, uint8_t param1,
                                  uint16_t param2,
                                  const uint8_t *data, uint16_t data_len)
{
    /* Maximum command size:
     *   7 (fixed header + CRC) + 64 (max SHA Update block) = 71 bytes */
    uint8_t pkt[128];
    uint8_t idx = 0;

    /* COUNT: includes itself, opcode, param1, param2(2), data, crc(2) */
    pkt[idx++] = (uint8_t)(7 + data_len);   /* COUNT */
    pkt[idx++] = opcode;
    pkt[idx++] = param1;
    pkt[idx++] = (uint8_t)(param2 & 0xFF);
    pkt[idx++] = (uint8_t)(param2 >> 8);

    if (data && data_len > 0) {
        memcpy(pkt + idx, data, data_len);
        idx += data_len;
    }

    /* Append CRC over pkt[0..idx-1] */
    uint8_t crc[2];
    atca_crc(pkt, idx, crc);
    pkt[idx++] = crc[0];
    pkt[idx++] = crc[1];

    /* Word address 0x03 = Command */
    return atecc_i2c_write(0x03, pkt, idx);
}

/**
 * Read a command response and verify its CRC.
 *
 * The first byte of the response is always COUNT (= total bytes including
 * COUNT and the 2 trailing CRC bytes).  This function allocates nothing on
 * the heap; the caller must provide a buffer of exactly @p count bytes.
 *
 * @param buf   Buffer of length @p count.
 * @param count Expected response size (typically 4 for status, 35 for SHA).
 * @return ESP_OK on valid CRC, ESP_FAIL on I2C error or CRC mismatch.
 */
static esp_err_t atecc_read_resp(uint8_t *buf, uint8_t count)
{
    esp_err_t ret = atecc_i2c_read(buf, count);
    if (ret != ESP_OK) return ESP_FAIL;

    if (buf[0] != count) {
        ESP_LOGE(TAG, "Response length mismatch: got 0x%02X exp 0x%02X",
                 buf[0], count);
        return ESP_FAIL;
    }

    /* CRC covers everything except the last 2 bytes */
    uint8_t crc[2];
    atca_crc(buf, count - 2, crc);
    if (crc[0] != buf[count - 2] || crc[1] != buf[count - 1]) {
        ESP_LOGE(TAG, "Response CRC error");
        return ESP_FAIL;
    }

    /* Status byte at index 1 (for 4-byte status packets) */
    if (count == 4 && buf[1] != 0x00) {
        ESP_LOGE(TAG, "Command status error: 0x%02X", buf[1]);
        return ESP_FAIL;
    }

    return ESP_OK;
}

/* ════════════════════════════════════════════════════════════════════ */
/*  Public API – Phase 1: initialisation / detection                   */
/* ════════════════════════════════════════════════════════════════════ */

esp_err_t atecc608a_init(void)
{
    /* ── I2C bus config ──────────────────────────────────────────── */
    i2c_config_t conf = {
        .mode             = I2C_MODE_MASTER,
        .sda_io_num       = ATECC_SDA_GPIO,
        .scl_io_num       = ATECC_SCL_GPIO,
        .sda_pullup_en    = GPIO_PULLUP_ENABLE,
        .scl_pullup_en    = GPIO_PULLUP_ENABLE,
        .master.clk_speed = ATECC_I2C_FREQ_HZ,
    };

    esp_err_t err = i2c_param_config(ATECC_I2C_PORT, &conf);
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "i2c_param_config failed: %s", esp_err_to_name(err));
        return err;
    }

    err = i2c_driver_install(ATECC_I2C_PORT, I2C_MODE_MASTER, 0, 0, 0);
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "i2c_driver_install failed: %s", esp_err_to_name(err));
        return err;
    }

    vTaskDelay(pdMS_TO_TICKS(10));   /* settle after driver install */

    /* ── Quick I2C bus scan for diagnostics ─────────────────────── */
    printf("\n  [ATECC] Scanning I2C_%d  (SDA=GPIO%d  SCL=GPIO%d)\n",
           ATECC_I2C_PORT, ATECC_SDA_GPIO, ATECC_SCL_GPIO);

    bool any_found = false;
    for (uint8_t addr = 1; addr < 127; addr++) {
        i2c_cmd_handle_t cmd = i2c_cmd_link_create();
        i2c_master_start(cmd);
        i2c_master_write_byte(cmd, (addr << 1) | I2C_MASTER_WRITE, true);
        i2c_master_stop(cmd);
        esp_err_t ret = i2c_master_cmd_begin(ATECC_I2C_PORT, cmd, pdMS_TO_TICKS(10));
        i2c_cmd_link_delete(cmd);
        if (ret == ESP_OK) {
            printf("  [ATECC] I2C device found at 0x%02X%s\n", addr,
                   (addr == ATECC_ADDR) ? "  ← ATECC608A" : "");
            any_found = true;
        }
    }
    if (!any_found) {
        printf("  [ATECC] No I2C devices found – check wiring!\n");
    }

    /* ── Wake + validate ─────────────────────────────────────────── */
    printf("\n");
    printf("╔══════════════════════════════════════════════════════════════╗\n");
    printf("║            ATECC608A – Connection Check                      ║\n");
    printf("╠══════════════════════════════════════════════════════════════╣\n");
    printf("  SDA  → GPIO %d   SCL  → GPIO %d\n", ATECC_SDA_GPIO, ATECC_SCL_GPIO);
    printf("  VCC  → 3.3 V    GND  → GND\n");
    printf("  I2C address      : 0x%02X\n", ATECC_ADDR);

    err = atecc_wake();
    if (err != ESP_OK) {
        printf("  Wake response    : FAILED ✗\n");
        printf("╠══════════════════════════════════════════════════════════════╣\n");
        printf("  ► ATECC608A NOT DETECTED – running in software-only mode\n");
        printf("╚══════════════════════════════════════════════════════════════╝\n\n");
        s_present = false;
        return ESP_FAIL;
    }

    printf("  Wake response    : OK ✓  { 0x04 0x11 0x33 0x43 }\n");

    /* ── Put chip to sleep until first use ───────────────────────── */
    atecc_sleep();

    s_present = true;
    printf("  Hardware SHA-256 : READY ✓\n");
    printf("╚══════════════════════════════════════════════════════════════╝\n\n");

    return ESP_OK;
}

bool atecc608a_present(void)
{
    return s_present;
}

/* ════════════════════════════════════════════════════════════════════ */
/*  Public API – Phase 2: hardware SHA-256                             */
/* ════════════════════════════════════════════════════════════════════ */

/**
 * Compute SHA-256 using the ATECC608A hardware engine.
 *
 * Protocol flow:
 *   1. Wake the chip.
 *   2. SHA Start (opcode 0x47, mode 0x00) – initialise internal engine.
 *   3. SHA Update (mode 0x01, 64 bytes) for every full 64-byte block.
 *   4. SHA End   (mode 0x02, remaining 0–63 bytes, param2 = count).
 *   5. Read 35-byte response: [count=35][digest[32]][crc[2]].
 *   6. Sleep the chip.
 *
 * Executive times: each SHA command takes ≤ 47 ms (tSHA_max).
 * We wait 50 ms after each command to stay within timing budget.
 */
esp_err_t atecc608a_sha256(const uint8_t *data, size_t len,
                            uint8_t digest[ATECC_SHA_LEN])
{
    if (!s_present) return ESP_ERR_INVALID_STATE;

    esp_err_t ret;
    uint8_t   status[4];

    /* ── 1. Wake ─────────────────────────────────────────────────── */
    ret = atecc_wake();
    if (ret != ESP_OK) {
        ESP_LOGE(TAG, "SHA: wake failed");
        s_present = false;   /* mark as gone; next init call re-detects */
        return ESP_FAIL;
    }

    /* ── 2. SHA Start ───────────────────────────────────────────── */
    ret = atecc_send_cmd(0x47 /*SHA*/, 0x00 /*Start*/, 0x0000, NULL, 0);
    if (ret != ESP_OK) { ESP_LOGE(TAG, "SHA Start TX failed"); goto fail; }

    vTaskDelay(pdMS_TO_TICKS(50));   /* tSHA exec */

    ret = atecc_read_resp(status, 4);
    if (ret != ESP_OK) { ESP_LOGE(TAG, "SHA Start resp failed"); goto fail; }

    /* ── 3. SHA Update – full 64-byte blocks ────────────────────── */
    const uint8_t *ptr = data;
    size_t remaining = len;

    while (remaining >= 64) {
        ret = atecc_send_cmd(0x47, 0x01 /*Update*/, 64, ptr, 64);
        if (ret != ESP_OK) { ESP_LOGE(TAG, "SHA Update TX failed"); goto fail; }

        vTaskDelay(pdMS_TO_TICKS(50));

        ret = atecc_read_resp(status, 4);
        if (ret != ESP_OK) { ESP_LOGE(TAG, "SHA Update resp failed"); goto fail; }

        ptr       += 64;
        remaining -= 64;
    }

    /* ── 4. SHA End – remaining 0–63 bytes ──────────────────────── */
    ret = atecc_send_cmd(0x47, 0x02 /*End*/,
                         (uint16_t)remaining,
                         (remaining > 0) ? ptr : NULL,
                         (uint16_t)remaining);
    if (ret != ESP_OK) { ESP_LOGE(TAG, "SHA End TX failed"); goto fail; }

    vTaskDelay(pdMS_TO_TICKS(50));

    /* ── 5. Read 35-byte response ── [count=35][digest[32]][crc[2]] */
    uint8_t sha_resp[35];
    ret = atecc_read_resp(sha_resp, 35);
    if (ret != ESP_OK) { ESP_LOGE(TAG, "SHA End resp failed"); goto fail; }

    /* ── 6. Sleep + copy digest ─────────────────────────────────── */
    atecc_sleep();
    memcpy(digest, sha_resp + 1, ATECC_SHA_LEN);
    return ESP_OK;

fail:
    atecc_sleep();
    return ESP_FAIL;
}
