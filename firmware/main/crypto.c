/**
 * @file crypto.c
 * @brief Software ECDSA signing, SHA-256, and AES-128-CTR (mbedTLS)
 *
 * Implements the crypto abstraction layer defined in crypto.h.
 * Uses ESP32-S3 hardware acceleration via mbedTLS when enabled in menuconfig.
 */

#include "crypto.h"
#include "storage.h"
#include "config.h"

#include "mbedtls/ecdsa.h"
#include "mbedtls/ecp.h"
#include "mbedtls/sha256.h"
#include "mbedtls/aes.h"
#include "mbedtls/entropy.h"
#include "mbedtls/ctr_drbg.h"
#include "mbedtls/bignum.h"
#include "mbedtls/error.h"

#include "esp_log.h"
#include <string.h>
#include <stdio.h>
#include <inttypes.h>

static const char *TAG = "crypto";

/* ── Internal state ──────────────────────────────────────────────────── */
typedef struct {
    mbedtls_ecdsa_context   ecdsa;
    mbedtls_entropy_context entropy;
    mbedtls_ctr_drbg_context ctr_drbg;
    bool                    initialized;
} crypto_ctx_t;

static crypto_ctx_t s_ctx = { .initialized = false };

/* ── Helpers ─────────────────────────────────────────────────────────── */

static void log_mbedtls_error(int ret, const char *op)
{
    char buf[128];
    mbedtls_strerror(ret, buf, sizeof(buf));
    ESP_LOGE(TAG, "%s failed: -0x%04X %s", op, (unsigned)(-ret), buf);
}

/**
 * mbedTLS random callback – bridges to ESP32 TRNG via CTR-DRBG.
 */
static int mbedtls_rng_wrap(void *ctx, uint8_t *buf, size_t len)
{
    return mbedtls_ctr_drbg_random(ctx, buf, len);
}

/* ── Public API ──────────────────────────────────────────────────────── */

esp_err_t crypto_init(void)
{
    int ret;
    const char *pers = "enigma_ecdsa";

    mbedtls_ecdsa_init(&s_ctx.ecdsa);
    mbedtls_entropy_init(&s_ctx.entropy);
    mbedtls_ctr_drbg_init(&s_ctx.ctr_drbg);

    /* Seed CTR-DRBG with mbedTLS entropy (backed by ESP32 TRNG) */
    ret = mbedtls_ctr_drbg_seed(&s_ctx.ctr_drbg, mbedtls_entropy_func,
                                 &s_ctx.entropy,
                                 (const uint8_t *)pers, strlen(pers));
    if (ret != 0) {
        log_mbedtls_error(ret, "ctr_drbg_seed");
        return ESP_FAIL;
    }

    /* ── Try to load existing keypair from NVS ── */
    uint8_t priv_raw[PRIVKEY_BYTES];
    uint8_t pub_raw[CRYPTO_PUBKEY_LEN];
    size_t  priv_len = PRIVKEY_BYTES;
    size_t  pub_len  = CRYPTO_PUBKEY_LEN;

    bool have_priv = (storage_load_blob(NVS_KEY_PRIVKEY, priv_raw, &priv_len) == ESP_OK);
    bool have_pub  = (storage_load_blob(NVS_KEY_PUBKEY,  pub_raw,  &pub_len)  == ESP_OK);

    if (have_priv && have_pub) {
        ESP_LOGI(TAG, "Loading keypair from NVS");

        mbedtls_ecp_group_id grp_id = MBEDTLS_ECP_DP_SECP256R1;
        mbedtls_ecp_group_load(&s_ctx.ecdsa.MBEDTLS_PRIVATE(grp), grp_id);

        ret = mbedtls_mpi_read_binary(&s_ctx.ecdsa.MBEDTLS_PRIVATE(d),
                                      priv_raw, PRIVKEY_BYTES);
        if (ret != 0) { log_mbedtls_error(ret, "mpi_read_binary(priv)"); return ESP_FAIL; }

        ret = mbedtls_ecp_point_read_binary(
                &s_ctx.ecdsa.MBEDTLS_PRIVATE(grp),
                &s_ctx.ecdsa.MBEDTLS_PRIVATE(Q),
                pub_raw, pub_len);
        if (ret != 0) { log_mbedtls_error(ret, "ecp_point_read_binary"); return ESP_FAIL; }

    } else {
        ESP_LOGI(TAG, "Generating new secp256r1 keypair...");

        ret = mbedtls_ecdsa_genkey(&s_ctx.ecdsa, MBEDTLS_ECP_DP_SECP256R1,
                                   mbedtls_rng_wrap, &s_ctx.ctr_drbg);
        if (ret != 0) { log_mbedtls_error(ret, "ecdsa_genkey"); return ESP_FAIL; }

        ret = mbedtls_mpi_write_binary(&s_ctx.ecdsa.MBEDTLS_PRIVATE(d),
                                       priv_raw, PRIVKEY_BYTES);
        if (ret != 0) { log_mbedtls_error(ret, "mpi_write_binary(priv)"); return ESP_FAIL; }

        size_t olen = 0;
        ret = mbedtls_ecp_point_write_binary(
                &s_ctx.ecdsa.MBEDTLS_PRIVATE(grp),
                &s_ctx.ecdsa.MBEDTLS_PRIVATE(Q),
                MBEDTLS_ECP_PF_UNCOMPRESSED, &olen, pub_raw, CRYPTO_PUBKEY_LEN);
        if (ret != 0 || olen != CRYPTO_PUBKEY_LEN) {
            log_mbedtls_error(ret, "ecp_point_write_binary"); return ESP_FAIL;
        }

        ESP_ERROR_CHECK(storage_save_blob(NVS_KEY_PRIVKEY, priv_raw, PRIVKEY_BYTES));
        ESP_ERROR_CHECK(storage_save_blob(NVS_KEY_PUBKEY,  pub_raw,  CRYPTO_PUBKEY_LEN));
        ESP_LOGI(TAG, "Keypair saved to NVS");
    }

    memset(priv_raw, 0, PRIVKEY_BYTES);
    s_ctx.initialized = true;
    ESP_LOGI(TAG, "Crypto subsystem ready (secp256r1 / mbedTLS)");
    return ESP_OK;
}

/* ── crypto_derive_aes_key ───────────────────────────────────────────── */

esp_err_t crypto_derive_aes_key(const char *device_id, 
                                uint64_t    timestamp, 
                                const char *server_seed,
                                uint8_t     key_out[CRYPTO_AES_KEY_LEN])
{
    char buf[256];
    int len = snprintf(buf, sizeof(buf), "%s%" PRIu64 "%s", 
                       device_id, timestamp, server_seed ? server_seed : "");
    if (len < 0 || len >= sizeof(buf)) return ESP_FAIL;

    uint8_t hash[32];
    mbedtls_sha256((const uint8_t *)buf, len, hash, 0);
    
    memcpy(key_out, hash, CRYPTO_AES_KEY_LEN);
    return ESP_OK;
}

/* ── sign_hash ───────────────────────────────────────────────────────── */

esp_err_t sign_hash(const uint8_t hash[CRYPTO_HASH_LEN],
                    uint8_t sig_out[CRYPTO_SIG_LEN])
{
    if (!s_ctx.initialized) { ESP_LOGE(TAG, "crypto not initialized"); return ESP_FAIL; }

    int ret;
    uint8_t digest[CRYPTO_HASH_LEN];
    {
        mbedtls_sha256_context sha;
        mbedtls_sha256_init(&sha);
        ret  = mbedtls_sha256_starts(&sha, 0); 
        ret |= mbedtls_sha256_update(&sha, hash, CRYPTO_HASH_LEN);
        ret |= mbedtls_sha256_finish(&sha, digest);
        mbedtls_sha256_free(&sha);
        if (ret != 0) { log_mbedtls_error(ret, "sha256(sign)"); return ESP_FAIL; }
    }

    mbedtls_mpi r, s;
    mbedtls_mpi_init(&r);
    mbedtls_mpi_init(&s);

    ret = mbedtls_ecdsa_sign(
            &s_ctx.ecdsa.MBEDTLS_PRIVATE(grp),
            &r, &s,
            &s_ctx.ecdsa.MBEDTLS_PRIVATE(d),
            digest, CRYPTO_HASH_LEN,
            mbedtls_rng_wrap, &s_ctx.ctr_drbg);
    if (ret != 0) {
        log_mbedtls_error(ret, "ecdsa_sign");
        mbedtls_mpi_free(&r); mbedtls_mpi_free(&s);
        return ESP_FAIL;
    }

    ret  = mbedtls_mpi_write_binary(&r, sig_out,       32);
    ret |= mbedtls_mpi_write_binary(&s, sig_out + 32,  32);
    mbedtls_mpi_free(&r); mbedtls_mpi_free(&s);

    if (ret != 0) { log_mbedtls_error(ret, "mpi_write_binary(sig)"); return ESP_FAIL; }

    return ESP_OK;
}

/* ── crypto_hash ─────────────────────────────────────────────────────── */

esp_err_t crypto_hash(const uint8_t *entropy, size_t elen,
                      uint64_t timestamp, const char *device_id,
                      uint8_t hash_out[CRYPTO_HASH_LEN])
{
    char ts_str[32];
    int ts_len = snprintf(ts_str, sizeof(ts_str), "%" PRIu64, timestamp);

    mbedtls_sha256_context ctx;
    mbedtls_sha256_init(&ctx);

    int ret = mbedtls_sha256_starts(&ctx, 0); 
    if (ret == 0) ret = mbedtls_sha256_update(&ctx, entropy, elen);
    if (ret == 0) ret = mbedtls_sha256_update(&ctx, (const uint8_t *)ts_str, ts_len);
    if (ret == 0) ret = mbedtls_sha256_update(&ctx, (const uint8_t *)device_id, strlen(device_id));
    if (ret == 0) ret = mbedtls_sha256_finish(&ctx, hash_out);

    mbedtls_sha256_free(&ctx);
    if (ret != 0) { log_mbedtls_error(ret, "sha256"); return ESP_FAIL; }

    return ESP_OK;
}

/* ── crypto_aes_encrypt_ctr ──────────────────────────────────────────── */

esp_err_t crypto_aes_encrypt_ctr(const uint8_t *data, size_t dlen,
                                 const uint8_t  key[CRYPTO_AES_KEY_LEN],
                                 uint8_t        iv_inout[CRYPTO_IV_LEN],
                                 uint8_t       *out)
{
    mbedtls_aes_context ctx;
    mbedtls_aes_init(&ctx);

    int ret = mbedtls_aes_setkey_enc(&ctx, key, CRYPTO_AES_KEY_LEN * 8);
    if (ret == 0) {
        size_t nc_off = 0;
        uint8_t stream_block[16];
        ret = mbedtls_aes_crypt_ctr(&ctx, dlen, &nc_off, iv_inout, stream_block, data, out);
    }

    mbedtls_aes_free(&ctx);
    if (ret != 0) { log_mbedtls_error(ret, "aes_crypt_ctr"); return ESP_FAIL; }

    return ESP_OK;
}

/* ── crypto_get_pubkey ───────────────────────────────────────────────── */

esp_err_t crypto_get_pubkey(uint8_t pub_out[CRYPTO_PUBKEY_LEN])
{
    if (!s_ctx.initialized) { ESP_LOGE(TAG, "crypto not initialized"); return ESP_FAIL; }

    size_t olen = 0;
    int ret = mbedtls_ecp_point_write_binary(
                  &s_ctx.ecdsa.MBEDTLS_PRIVATE(grp),
                  &s_ctx.ecdsa.MBEDTLS_PRIVATE(Q),
                  MBEDTLS_ECP_PF_UNCOMPRESSED, &olen,
                  pub_out, CRYPTO_PUBKEY_LEN);
    if (ret != 0 || olen != CRYPTO_PUBKEY_LEN) {
        log_mbedtls_error(ret, "ecp_point_write_binary");
        return ESP_FAIL;
    }
    return ESP_OK;
}

/* ── crypto_bytes_to_hex ─────────────────────────────────────────────── */

void crypto_bytes_to_hex(const uint8_t *src, size_t slen, char *dst)
{
    for (size_t i = 0; i < slen; i++) {
        sprintf(dst + 2 * i, "%02x", src[i]);
    }
    dst[2 * slen] = '\0';
}
