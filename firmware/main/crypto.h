/**
 * @file crypto.h
 * @brief Cryptographic abstraction layer for ENIGMA (ESP32-S3 MbedTLS)
 *
 * This module handles ECDSA signing, SHA-256 hashing, and AES-128-CTR encryption.
 * It is optimized for the ESP32-S3 using hardware-accelerated MbedTLS.
 */

#pragma once
#include <stdint.h>
#include <stddef.h>
#include "esp_err.h"

/** Raw secp256r1 public key: 0x04 || X(32) || Y(32) = 65 bytes */
#define CRYPTO_PUBKEY_LEN   65
/** Raw ECDSA signature: r(32) || s(32) = 64 bytes */
#define CRYPTO_SIG_LEN      64
/** SHA-256 digest = 32 bytes */
#define CRYPTO_HASH_LEN     32
/** AES-128 key = 16 bytes */
#define CRYPTO_AES_KEY_LEN  16
/** AES IV / Nonce = 16 bytes */
#define CRYPTO_IV_LEN       16

/**
 * @brief Initialise crypto subsystem (ECDSA, RNG).
 * @return ESP_OK on success.
 */
esp_err_t crypto_init(void);

/**
 * @brief Derive a 128-bit AES key from device identity and timestamp.
 * 
 * Logic: SHA256(device_id + timestamp + server_seed) -> first 16 bytes.
 */
esp_err_t crypto_derive_aes_key(const char *device_id, 
                                uint64_t    timestamp, 
                                const char *server_seed,
                                uint8_t     key_out[CRYPTO_AES_KEY_LEN]);

/**
 * @brief Compute SHA-256 over entropy buffer + timestamp + device_id.
 */
esp_err_t crypto_hash(const uint8_t *entropy, size_t elen,
                      uint64_t timestamp, const char *device_id,
                      uint8_t hash_out[CRYPTO_HASH_LEN]);

/**
 * @brief Sign a 32-byte hash using the device private key (secp256r1).
 */
esp_err_t sign_hash(const uint8_t hash[CRYPTO_HASH_LEN],
                    uint8_t sig_out[CRYPTO_SIG_LEN]);

/**
 * @brief Encrypt data using AES-128-CTR.
 * 
 * @param data      Input plaintext
 * @param dlen      Length of input
 * @param key       16-byte AES key
 * @param iv_inout  16-byte IV (modified by function)
 * @param out       Output ciphertext (same length as input)
 */
esp_err_t crypto_aes_encrypt_ctr(const uint8_t *data, size_t dlen,
                                 const uint8_t  key[CRYPTO_AES_KEY_LEN],
                                 uint8_t        iv_inout[CRYPTO_IV_LEN],
                                 uint8_t       *out);

/**
 * @brief Copy the uncompressed public key into @p pub_out.
 */
esp_err_t crypto_get_pubkey(uint8_t pub_out[CRYPTO_PUBKEY_LEN]);

/**
 * @brief Convert binary buffer to a lowercase hex string.
 */
void crypto_bytes_to_hex(const uint8_t *src, size_t slen, char *dst);
