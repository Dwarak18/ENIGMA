# ENIGMA – Hardware Secure Element Upgrade Guide

## Overview

The firmware is designed so that replacing the software signing implementation
(mbedTLS) with a hardware secure element (ATECC608A) requires changes to
**exactly one function** and **zero changes** to the backend or frontend.

---

## Abstraction Boundary

```
┌─────────────────────────────────────────────────────────────────┐
│  Function: sign_hash()                                          │
│  Location: firmware/main/crypto.c                               │
│                                                                 │
│  Contract:                                                      │
│    Input:  uint8_t hash[32]  – SHA-256 digest                  │
│    Output: uint8_t sig[64]   – raw ECDSA r‖s                   │
│    Return: ESP_OK on success                                    │
│                                                                 │
│  Current implementation: mbedTLS software ECDSA                │
│  Future  implementation: ATECC608A hardware signing             │
└─────────────────────────────────────────────────────────────────┘
```

The function signature is declared in `crypto.h` as:

```c
esp_err_t sign_hash(const uint8_t hash[CRYPTO_HASH_LEN],
                    uint8_t sig_out[CRYPTO_SIG_LEN]);
```

---

## Current Implementation (mbedTLS)

```c
esp_err_t sign_hash(const uint8_t hash[32], uint8_t sig_out[64])
{
    // mbedtls_ecdsa_sign() → extract r, s → write 32-byte big-endian each
    // See firmware/main/crypto.c for full implementation
}
```

---

## Hardware Replacement (ATECC608A)

### Step 1 – Hardware wiring

Connect ATECC608A to the ESP32-S3 via I2C:

| ATECC608A Pin | ESP32-S3 Pin |
|---------------|--------------|
| SDA           | GPIO 17      |
| SCL           | GPIO 18      |
| VCC           | 3.3V         |
| GND           | GND          |

### Step 2 – Add cryptoauthlib component

In `firmware/main/CMakeLists.txt`, add `cryptoauthlib` to `REQUIRES`:

```cmake
REQUIRES
    ...
    cryptoauthlib
```

### Step 3 – Replace sign_hash() body

Replace the entire body of `sign_hash()` in `crypto.c`:

```c
// ── HARDWARE PATH (ATECC608A) ─────────────────────────────────────────
#include "cryptoauthlib.h"

#define ATECC_KEY_SLOT  0   // slot holding the device private key

esp_err_t sign_hash(const uint8_t hash[CRYPTO_HASH_LEN],
                    uint8_t sig_out[CRYPTO_SIG_LEN])
{
    ATCA_STATUS status = atcab_sign(ATECC_KEY_SLOT, hash, sig_out);
    if (status != ATCA_SUCCESS) {
        ESP_LOGE("crypto", "atcab_sign failed: 0x%02X", status);
        return ESP_FAIL;
    }
    return ESP_OK;
}
```

### Step 4 – Replace crypto_get_pubkey() (optional)

If the key is stored on the ATECC608A:

```c
esp_err_t crypto_get_pubkey(uint8_t pub_out[CRYPTO_PUBKEY_LEN])
{
    // ATECC returns 64-byte raw X‖Y; prepend 0x04 for uncompressed format
    uint8_t raw[64];
    ATCA_STATUS status = atcab_get_pubkey(ATECC_KEY_SLOT, raw);
    if (status != ATCA_SUCCESS) return ESP_FAIL;
    pub_out[0] = 0x04;
    memcpy(pub_out + 1, raw, 64);
    return ESP_OK;
}
```

### Step 5 – Remove mbedTLS keypair code from crypto_init()

The ATECC608A generates and protects its own key (provisioned at factory
or via `atcab_genkey()`). Remove the keypair generation and NVS storage
from `crypto_init()`. The `crypto_hash()` function remains unchanged.

---

## Impact Summary

| File           | Change required? | What changes                          |
|----------------|------------------|---------------------------------------|
| `crypto.c`     | ✓ Yes            | `sign_hash()` body; `crypto_init()` simplified |
| `crypto.h`     | No               | Interface is identical                |
| `entropy.c`    | No               | –                                     |
| `network.c`    | No               | –                                     |
| `storage.c`    | No               | –                                     |
| `main.c`       | No               | –                                     |
| **Backend**    | **No**           | Signature format (r‖s hex) is the same |
| **Frontend**   | **No**           | –                                     |
| **Database**   | **No**           | –                                     |

---

## Key Provisioning

For production ATECC608A deployment:

1. Generate P-256 key in a locked slot during factory provisioning.
2. Lock the configuration and data zones.
3. Extract the public key and store in the backend `devices` table
   during device onboarding/registration (separate provisioning flow).
4. The device does **not** need to include `public_key` in every payload
   once pre-registered.
