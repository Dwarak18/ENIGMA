/**
 * @file Enigma_pro.c
 * @brief ENIGMA Pro – AES-256-CBC entropy pipeline
 *
 * Pipeline per cycle (every ENTROPY_INTERVAL_MS):
 *   1. Generate 16 random bytes  ←  ESP32 hardware RNG  (the plaintext entropy)
 *   2. AES-256-CBC encrypt those bytes
 *        key  = 32-byte device AES key  (generated once, stored in NVS)
 *        IV   = 16 fresh random bytes   (new every cycle)
 *        → 16-byte ciphertext
 *   3. Build IST datetime string from SNTP epoch: "YYYY-MM-DD HH:MM:SS"
 *   4. SHA-256( AES_key[32] ‖ datetime_string )  →  32-byte hash
 *   5. ECDSA-secp256r1 sign the hash  →  64-byte raw signature
 *   6. Pretty-print all fields to serial monitor
 *   7. POST JSON to backend
 *
 * Boot sequence:
 *   NVS  →  Wi-Fi  →  SNTP (IST via in.pool.ntp.org)
 *         →  DS3231 set  →  AES key init  →  ECDSA key init
 */

#include <stdio.h>
#include <string.h>
#include <time.h>
#include <inttypes.h>

#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "nvs_flash.h"
#include "esp_log.h"
#include "esp_timer.h"
#include "esp_random.h"

#include "mbedtls/aes.h"
#include "mbedtls/sha256.h"

#include "config.h"
#include "rtc.h"
#include "crypto.h"
#include "storage.h"
#include "network.h"

static const char *TAG = "enigma_pro";

/* ── AES key constants ─────────────────────────────────────────────── */
#define AES_KEY_BYTES    32          /* AES-256 */
#define AES_BLOCK_BYTES  16          /* CBC block / plaintext / IV size */
#define NVS_KEY_AES      "aes_key"  /* NVS blob key for the AES key    */

/* ── Module-level AES key (loaded once at boot) ─────────────────────── */
static uint8_t s_aes_key[AES_KEY_BYTES];

/* ════════════════════════════════════════════════════════════════════ */
/*  AES key initialisation                                              */
/* ════════════════════════════════════════════════════════════════════ */

/**
 * Load AES-256 key from NVS.  If none exists, generate a random one
 * and persist it so it survives reboots.
 */
static esp_err_t aes_key_init(void)
{
    size_t len = AES_KEY_BYTES;
    esp_err_t err = storage_load_blob(NVS_KEY_AES, s_aes_key, &len);

    if (err == ESP_OK && len == AES_KEY_BYTES) {
        ESP_LOGI(TAG, "AES-256 key loaded from NVS");
        return ESP_OK;
    }

    /* Not found or corrupt – generate a fresh one */
    ESP_LOGI(TAG, "Generating new AES-256 key…");
    esp_fill_random(s_aes_key, AES_KEY_BYTES);

    err = storage_save_blob(NVS_KEY_AES, s_aes_key, AES_KEY_BYTES);
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "Failed to save AES key to NVS");
        return err;
    }
    ESP_LOGI(TAG, "AES-256 key saved to NVS");
    return ESP_OK;
}

/* ════════════════════════════════════════════════════════════════════ */
/*  Helpers                                                             */
/* ════════════════════════════════════════════════════════════════════ */

/** Binary → hex string.  dst must hold 2*len+1 bytes. */
static void to_hex(const uint8_t *src, size_t len, char *dst)
{
    for (size_t i = 0; i < len; i++) sprintf(dst + 2 * i, "%02x", src[i]);
    dst[2 * len] = '\0';
}

/**
 * Encrypt `plain[AES_BLOCK_BYTES]` with AES-256-CBC.
 * iv_in  : 16-byte IV (consumed / modified by mbedTLS – pass a copy).
 * cipher : 16-byte output buffer.
 */
static esp_err_t aes_encrypt_block(const uint8_t *plain,
                                   uint8_t       *iv_in,
                                   uint8_t       *cipher)
{
    mbedtls_aes_context ctx;
    mbedtls_aes_init(&ctx);

    int ret = mbedtls_aes_setkey_enc(&ctx, s_aes_key, AES_KEY_BYTES * 8);
    if (ret == 0) {
        ret = mbedtls_aes_crypt_cbc(&ctx, MBEDTLS_AES_ENCRYPT,
                                    AES_BLOCK_BYTES, iv_in, plain, cipher);
    }
    mbedtls_aes_free(&ctx);
    return (ret == 0) ? ESP_OK : ESP_FAIL;
}

/**
 * SHA-256( aes_key[32] ‖ datetime_str )  →  hash_out[32]
 */
static esp_err_t sha256_key_datetime(const char *datetime_str,
                                     uint8_t     hash_out[CRYPTO_HASH_LEN])
{
    mbedtls_sha256_context ctx;
    mbedtls_sha256_init(&ctx);

    int ret = mbedtls_sha256_starts(&ctx, 0 /* SHA-256 */);
    if (ret == 0) ret = mbedtls_sha256_update(&ctx, s_aes_key, AES_KEY_BYTES);
    if (ret == 0) ret = mbedtls_sha256_update(&ctx,
                            (const uint8_t *)datetime_str, strlen(datetime_str));
    if (ret == 0) ret = mbedtls_sha256_finish(&ctx, hash_out);

    mbedtls_sha256_free(&ctx);
    return (ret == 0) ? ESP_OK : ESP_FAIL;
}

/* ════════════════════════════════════════════════════════════════════ */
/*  Entropy loop task                                                   */
/* ════════════════════════════════════════════════════════════════════ */

static void entropy_task(void *pvParam)
{
    (void)pvParam;

    bool pubkey_sent = false;

    /* Raw buffers */
    uint8_t plain  [AES_BLOCK_BYTES];   /* 16-byte random plaintext      */
    uint8_t iv_orig[AES_BLOCK_BYTES];   /* IV kept for display / JSON    */
    uint8_t iv_work[AES_BLOCK_BYTES];   /* IV copy fed to mbedTLS (consumed) */
    uint8_t cipher [AES_BLOCK_BYTES];   /* AES-256-CBC ciphertext        */
    uint8_t hash   [CRYPTO_HASH_LEN];   /* SHA-256 output                */
    uint8_t sig    [CRYPTO_SIG_LEN];    /* ECDSA signature               */
    uint8_t pub    [CRYPTO_PUBKEY_LEN]; /* uncompressed public key       */

    /* Hex string buffers */
    char plain_hex [AES_BLOCK_BYTES   * 2 + 1];
    char iv_hex    [AES_BLOCK_BYTES   * 2 + 1];
    char cipher_hex[AES_BLOCK_BYTES   * 2 + 1];
    char aes_key_hex[AES_KEY_BYTES    * 2 + 1];
    char hash_hex  [CRYPTO_HASH_LEN   * 2 + 1];
    char sig_hex   [CRYPTO_SIG_LEN    * 2 + 1];
    char pub_hex   [CRYPTO_PUBKEY_LEN * 2 + 1];

    /* Time strings */
    char rtc_time_str[20];        /* "HH:MM:SS"            from DS3231  */
    char ist_datetime[32];        /* "YYYY-MM-DD HH:MM:SS" from epoch   */

    for (;;) {
        int64_t cycle_start = esp_timer_get_time();

        /* ── 1. SNTP epoch + IST datetime ─────────────────────────── */
        time_t utc_now = 0;
        time(&utc_now);
        uint64_t timestamp = (uint64_t)utc_now;

        if (timestamp < 1700000000ULL) {
            ESP_LOGW(TAG, "Clock not synced – skipping cycle");
            vTaskDelay(pdMS_TO_TICKS(ENTROPY_INTERVAL_MS));
            continue;
        }

        /* Build full IST datetime string */
        time_t ist_epoch = (time_t)(timestamp) + IST_OFFSET_SECS;
        struct tm ist_tm;
        gmtime_r(&ist_epoch, &ist_tm);
        snprintf(ist_datetime, sizeof(ist_datetime),
                 "%04d-%02d-%02d %02d:%02d:%02d",
                 ist_tm.tm_year + 1900, ist_tm.tm_mon + 1, ist_tm.tm_mday,
                 ist_tm.tm_hour, ist_tm.tm_min, ist_tm.tm_sec);

        /* ── 2. DS3231 IST time (HH:MM:SS) ───────────────────────── */
        rtc_get_time(rtc_time_str);

        /* ── 3. Generate 16 random bytes (plaintext entropy) ─────── */
        esp_fill_random(plain, AES_BLOCK_BYTES);

        /* ── 4. Fresh random IV ───────────────────────────────────── */
        esp_fill_random(iv_orig, AES_BLOCK_BYTES);
        memcpy(iv_work, iv_orig, AES_BLOCK_BYTES);   /* mbedTLS modifies iv */

        /* ── 5. AES-256-CBC encrypt ───────────────────────────────── */
        if (aes_encrypt_block(plain, iv_work, cipher) != ESP_OK) {
            ESP_LOGE(TAG, "AES encryption failed");
            goto sleep;
        }

        /* ── 6. SHA-256( AES_key ‖ IST_datetime ) ────────────────── */
        if (sha256_key_datetime(ist_datetime, hash) != ESP_OK) {
            ESP_LOGE(TAG, "SHA-256 failed");
            goto sleep;
        }

        /* ── 7. ECDSA sign the hash ───────────────────────────────── */
        if (sign_hash(hash, sig) != ESP_OK) {
            ESP_LOGE(TAG, "ECDSA sign failed");
            goto sleep;
        }

        /* ── 8. Build hex strings ─────────────────────────────────── */
        to_hex(plain,   AES_BLOCK_BYTES,  plain_hex);
        to_hex(iv_orig, AES_BLOCK_BYTES,  iv_hex);
        to_hex(cipher,  AES_BLOCK_BYTES,  cipher_hex);
        to_hex(s_aes_key, AES_KEY_BYTES,  aes_key_hex);
        crypto_bytes_to_hex(hash, CRYPTO_HASH_LEN, hash_hex);
        crypto_bytes_to_hex(sig,  CRYPTO_SIG_LEN,  sig_hex);

        /* ── 9. Public key (first cycle only) ────────────────────── */
        const char *pubkey_arg = NULL;
        if (!pubkey_sent && crypto_get_pubkey(pub) == ESP_OK) {
            crypto_bytes_to_hex(pub, CRYPTO_PUBKEY_LEN, pub_hex);
            pubkey_arg = pub_hex;
        }

        /* ── 10. Pretty-print ─────────────────────────────────────── */
        printf("\n╔══════════════════════════════════════════════════════════════╗\n");
        printf("║                  ENIGMA – Entropy Emission                  ║\n");
        printf("╠══════════════════════════════════════════════════════════════╣\n");
        printf("  Device ID    : %s\n",           DEVICE_ID);
        printf("  IST DateTime : %s\n",           ist_datetime);
        printf("  RTC (DS3231) : %s\n",           rtc_time_str);
        printf("  UNIX Epoch   : %" PRIu64 "\n",  timestamp);
        printf("──────────────────────────────────────────────────────────────\n");
        printf("  Random Plain : %s\n",           plain_hex);
        printf("  AES-256 Key  : %.32s\n"
               "                 %.32s\n",        aes_key_hex, aes_key_hex + 32);
        printf("  AES IV       : %s\n",           iv_hex);
        printf("  AES Cipher   : %s\n",           cipher_hex);
        printf("──────────────────────────────────────────────────────────────\n");
        printf("  SHA-256 Hash : %.32s\n"
               "  (key‖datetime) %.32s\n",        hash_hex, hash_hex + 32);
        printf("  ECDSA Sig    : %.32s\n"
               "                 %.32s\n"
               "                 %.32s\n"
               "                 %.32s\n",
               sig_hex, sig_hex + 32, sig_hex + 64, sig_hex + 96);
        if (pubkey_arg) {
            printf("  Public Key   : %.32s\n"
                   "                 %.32s\n"
                   "                 %.32s\n"
                   "                 %.38s\n",
                   pub_hex, pub_hex + 32, pub_hex + 64, pub_hex + 96);
        }
        printf("╚══════════════════════════════════════════════════════════════╝\n");

        /* ── 11. POST to backend ──────────────────────────────────── */
        esp_err_t err = network_post_entropy(timestamp, hash_hex, sig_hex,
                                             pubkey_arg, rtc_time_str,
                                             cipher_hex, iv_hex);
        if (err == ESP_OK) {
            printf("  [POST] Backend accepted ✓\n\n");
            pubkey_sent = true;
        } else {
            printf("  [POST] Failed – will retry next cycle\n\n");
        }

sleep:
        int64_t elapsed_us = esp_timer_get_time() - cycle_start;
        int64_t sleep_us   = (int64_t)ENTROPY_INTERVAL_MS * 1000LL - elapsed_us;
        if (sleep_us > 0) vTaskDelay(pdMS_TO_TICKS(sleep_us / 1000));
    }
}

/* ════════════════════════════════════════════════════════════════════ */
/*  app_main                                                            */
/* ════════════════════════════════════════════════════════════════════ */

void app_main(void)
{
    printf("\n╔══════════════════════════════════════════════════════════════╗\n");
    printf("║              ENIGMA Pro – Firmware Booting                  ║\n");
    printf("╚══════════════════════════════════════════════════════════════╝\n\n");

    /* ── 1. NVS ──────────────────────────────────────────────────── */
    ESP_ERROR_CHECK(storage_init());

    /* ── 2. Wi-Fi + SNTP ─────────────────────────────────────────── */
    ESP_ERROR_CHECK(network_wifi_connect());
    ESP_ERROR_CHECK(network_sntp_sync());   /* logs full IST date-time */

    /* ── 3. DS3231 – I2C init + set IST from SNTP ────────────────── */
    external_rtc_init();
    {
        time_t utc_now = 0;
        time(&utc_now);
        printf("  [RTC] Writing IST to DS3231 (UTC %" PRId64 " + 5h30m)…\n",
               (int64_t)utc_now);
        rtc_set_time_from_epoch(utc_now);
    }

    /* ── 4. AES-256 key – load from NVS or generate ─────────────── */
    ESP_ERROR_CHECK(aes_key_init());

    /* ── 5. ECDSA keypair – load from NVS or generate ────────────── */
    ESP_ERROR_CHECK(crypto_init());

    /* ── 6. Start entropy loop ───────────────────────────────────── */
    printf("\n  ENIGMA operational – emitting every %d s\n\n",
           ENTROPY_INTERVAL_MS / 1000);

    xTaskCreate(entropy_task, "entropy_task", MAIN_TASK_STACK, NULL, 5, NULL);
}

#include <stdio.h>
#include <string.h>
#include <time.h>
#include <inttypes.h>

#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "nvs_flash.h"
#include "esp_log.h"
#include "esp_timer.h"

#include "config.h"
#include "rtc.h"
#include "entropy.h"
#include "crypto.h"
#include "storage.h"
#include "network.h"

static const char *TAG = "enigma_pro";

/* ══════════════════════════════════════════════════════════════════════ */
/*  Entropy loop                                                          */
/* ══════════════════════════════════════════════════════════════════════ */

static void entropy_task(void *pvParam)
{
    (void)pvParam;

    bool pubkey_sent = false;

    /* Raw byte buffers */
    uint8_t entropy_raw[ENTROPY_BYTES];
    uint8_t hash_raw   [CRYPTO_HASH_LEN];
    uint8_t sig_raw    [CRYPTO_SIG_LEN];
    uint8_t pub_raw    [CRYPTO_PUBKEY_LEN];

    /* Hex string buffers */
    char hash_hex[CRYPTO_HASH_LEN    * 2 + 1];
    char sig_hex [CRYPTO_SIG_LEN     * 2 + 1];
    char pub_hex [CRYPTO_PUBKEY_LEN  * 2 + 1];

    /* RTC time */
    char rtc_time_str[20];

    for (;;) {
        int64_t cycle_start = esp_timer_get_time();

        /* ── 1. Entropy ────────────────────────────────────────────── */
        entropy_collect(entropy_raw, ENTROPY_BYTES);

        /* ── 2. DS3231 IST time ────────────────────────────────────── */
        rtc_get_time(rtc_time_str);

        /* ── 3. SNTP timestamp (UTC epoch) ────────────────────────── */
        time_t now = 0;
        time(&now);
        uint64_t timestamp = (uint64_t)now;

        if (timestamp < 1700000000ULL) {
            ESP_LOGW(TAG, "Clock not synced yet, skipping cycle");
            vTaskDelay(pdMS_TO_TICKS(ENTROPY_INTERVAL_MS));
            continue;
        }

        /* ── 4. SHA-256 hash ───────────────────────────────────────── */
        if (crypto_hash(entropy_raw, ENTROPY_BYTES, timestamp, hash_raw) != ESP_OK) {
            ESP_LOGE(TAG, "Hash failed");
            goto sleep;
        }
        crypto_bytes_to_hex(hash_raw, CRYPTO_HASH_LEN, hash_hex);

        /* ── 5. ECDSA signature ────────────────────────────────────── */
        if (sign_hash(hash_raw, sig_raw) != ESP_OK) {
            ESP_LOGE(TAG, "Sign failed");
            goto sleep;
        }
        crypto_bytes_to_hex(sig_raw, CRYPTO_SIG_LEN, sig_hex);

        /* ── 6. Public key (first cycle only) ─────────────────────── */
        const char *pubkey_arg = NULL;
        if (!pubkey_sent) {
            if (crypto_get_pubkey(pub_raw) == ESP_OK) {
                crypto_bytes_to_hex(pub_raw, CRYPTO_PUBKEY_LEN, pub_hex);
                pubkey_arg = pub_hex;
            }
        }

        /* ── 7. Pretty console output ─────────────────────────────── */
        printf("\n╔══════════════════════════════════════════════════════════╗\n");
        printf("║               ENIGMA – Entropy Emission                 ║\n");
        printf("╠══════════════════════════════════════════════════════════╣\n");
        printf("  Device ID  : %s\n",            DEVICE_ID);
        printf("  IST Time   : %s\n",            rtc_time_str);
        printf("  Timestamp  : %" PRIu64 "\n",  timestamp);
        printf("  Hash       : %.32s\n"
               "               %.32s\n",         hash_hex, hash_hex + 32);
        printf("  Signature  : %.32s\n"
               "               %.32s\n"
               "               %.32s\n"
               "               %.32s\n",
               sig_hex,      sig_hex + 32,
               sig_hex + 64, sig_hex + 96);
        if (pubkey_arg) {
            printf("  Public Key : %.32s\n"
                   "               %.32s\n"
                   "               %.32s\n"
                   "               %.38s\n",
                   pub_hex,      pub_hex + 32,
                   pub_hex + 64, pub_hex + 96);
        }
        printf("╚══════════════════════════════════════════════════════════╝\n");

        /* ── 8. POST to backend ────────────────────────────────────── */
        esp_err_t err = network_post_entropy(timestamp, hash_hex, sig_hex,
                                             pubkey_arg, rtc_time_str);
        if (err == ESP_OK) {
            printf("  [POST] Backend accepted  ✓\n\n");
            pubkey_sent = true;
        } else {
            printf("  [POST] Failed – will retry next cycle\n\n");
        }

sleep:
        /* ── Sleep for remainder of interval ──────────────────────── */
        int64_t elapsed_us = esp_timer_get_time() - cycle_start;
        int64_t sleep_us   = (int64_t)ENTROPY_INTERVAL_MS * 1000LL - elapsed_us;
        if (sleep_us > 0) {
            vTaskDelay(pdMS_TO_TICKS(sleep_us / 1000));
        }
    }
}

/* ══════════════════════════════════════════════════════════════════════ */
/*  app_main                                                              */
/* ══════════════════════════════════════════════════════════════════════ */

void app_main(void)
{
    printf("\n╔══════════════════════════════════════════════════════════╗\n");
    printf("║           ENIGMA Pro – Firmware Booting                 ║\n");
    printf("╚══════════════════════════════════════════════════════════╝\n\n");

    /* ── 1. NVS ─────────────────────────────────────────────────── */
    ESP_ERROR_CHECK(storage_init());

    /* ── 2. Wi-Fi + SNTP ────────────────────────────────────────── */
    ESP_ERROR_CHECK(network_wifi_connect());
    ESP_ERROR_CHECK(network_sntp_sync());   /* logs IST date-time after sync */

    /* ── 3. DS3231 – initialise I2C, then push IST from SNTP ────── */
    external_rtc_init();
    {
        time_t utc_now = 0;
        time(&utc_now);
        printf("  [RTC] Setting DS3231 to IST (UTC %" PRId64 " + 5h30m)…\n",
               (int64_t)utc_now);
        rtc_set_time_from_epoch(utc_now);   /* converts to IST inside rtc.c */
    }

    /* ── 4. Crypto – load or generate ECDSA keypair ─────────────── */
    ESP_ERROR_CHECK(crypto_init());

    /* ── 5. Launch entropy loop ──────────────────────────────────── */
    printf("\n  ENIGMA operational – emitting every %d s\n\n",
           ENTROPY_INTERVAL_MS / 1000);

    xTaskCreate(entropy_task, "entropy_task", MAIN_TASK_STACK, NULL, 5, NULL);
}
