/**
 * @file crypto.h
 * @brief Cryptographic abstraction layer
 *
 * ┌─────────────────────────────────────────────────────────────────────┐
 * │  ABSTRACTION LAYER – CRITICAL FOR HARDWARE UPGRADE PATH             │
 * │                                                                     │
 * │  Current implementation: mbedTLS software ECDSA (secp256r1)        │
 * │  Future implementation:  ATECC608A via sign_hash() → atcab_sign()  │
 * │                                                                     │
 * │  Backend and frontend require NO changes when switching.            │
 * └─────────────────────────────────────────────────────────────────────┘
 *
 * Public API contract:
 *   crypto_init()          – generate/load keypair once
 *   crypto_hash()          – SHA-256 of entropy + timestamp
 *   sign_hash()            – sign 32-byte hash → 64-byte raw ECDSA sig
 *   crypto_get_pubkey()    – export uncompressed public key (65 bytes)
 *   crypto_bytes_to_hex()  – utility: bin → hex string
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

/**
 * @brief Initialise crypto subsystem.
 *
 * On first boot: generate a secp256r1 keypair and persist it to NVS.
 * On subsequent boots: load the keypair from NVS.
 *
 * @return ESP_OK on success.
 */
esp_err_t crypto_init(void);

/**
 * @brief Compute SHA-256 over entropy buffer + 64-bit timestamp.
 *
 * Input is: entropy_bytes || uint64_t(timestamp) little-endian
 *
 * @param entropy    Raw entropy buffer
 * @param elen       Length of entropy buffer
 * @param timestamp  UNIX epoch seconds
 * @param hash_out   32-byte output buffer
 * @return ESP_OK on success.
 */
esp_err_t crypto_hash(const uint8_t *entropy, size_t elen,
                      uint64_t timestamp, uint8_t hash_out[CRYPTO_HASH_LEN]);

/**
 * @brief Sign a 32-byte hash using the device private key.
 *
 * ── ABSTRACTION BOUNDARY ──────────────────────────────────────────────
 * Software path (current):
 *   Uses mbedtls_ecdsa_write_signature() – raw r||s extracted manually.
 *
 * Hardware path (future – ATECC608A):
 *   Replace body with: return atcab_sign(key_slot, hash, sig_out);
 *   All other files remain unchanged.
 * ─────────────────────────────────────────────────────────────────────
 *
 * @param hash     32-byte message digest
 * @param sig_out  64-byte output buffer (raw r||s)
 * @return ESP_OK on success.
 */
esp_err_t sign_hash(const uint8_t hash[CRYPTO_HASH_LEN],
                    uint8_t sig_out[CRYPTO_SIG_LEN]);

/**
 * @brief Copy the uncompressed public key into @p pub_out.
 *
 * @param pub_out  65-byte output buffer
 * @return ESP_OK on success.
 */
esp_err_t crypto_get_pubkey(uint8_t pub_out[CRYPTO_PUBKEY_LEN]);

/**
 * @brief Convert binary buffer to a lowercase hex string (null-terminated).
 *
 * @param src   Input bytes
 * @param slen  Number of input bytes
 * @param dst   Output buffer; must be at least 2*slen+1 chars
 */
void crypto_bytes_to_hex(const uint8_t *src, size_t slen, char *dst);

/**
 * @brief Generate a hash from the input and output it as a hex string.
 *
 * @param input      The input string to be hashed.
 * @param output_hex The output buffer for the hex-encoded hash.
 */
void generate_hash(char *input, char *output_hex);
