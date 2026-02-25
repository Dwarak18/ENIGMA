/**
 * @file crypto.c
 * @brief Software ECDSA signing (mbedTLS) – secp256r1
 *
 * Implements the crypto abstraction layer defined in crypto.h.
 *
 * ┌─────────────────────────────────────────────────────────────────────┐
 * │  HARDWARE UPGRADE PATH                                              │
 * │  To replace with ATECC608A:                                         │
 * │    1. Remove mbedTLS keypair fields from s_ctx                      │
 * │    2. Replace sign_hash() body with atcab_sign()                    │
 * │    3. Replace crypto_get_pubkey() with atcab_get_pubkey()           │
 * │    4. Remove crypto_init() keypair generation (ATECC generates it)  │
 * │  crypto_hash() and crypto_bytes_to_hex() remain unchanged.         │
 * └─────────────────────────────────────────────────────────────────────┘
 */

#include "crypto.h"
#include "mbedtls/sha256.h"
#include <string.h>
#include <stdio.h>

void generate_hash(char *input, char *output_hex)
{
    unsigned char hash[32];
    mbedtls_sha256_context ctx;

    mbedtls_sha256_init(&ctx);
    mbedtls_sha256_starts(&ctx, 0);  // 0 = SHA-256
    mbedtls_sha256_update(&ctx, (const unsigned char *)input, strlen(input));
    mbedtls_sha256_finish(&ctx, hash);
    mbedtls_sha256_free(&ctx);

    for (int i = 0; i < 32; i++) {
        sprintf(output_hex + (i * 2), "%02x", hash[i]);
    }

    output_hex[64] = '\0';  // null terminate
}
