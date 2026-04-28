# ENIGMA Firmware - Action Plan & Status Check

This document outlines everything needed to test, validate, and update the **ESP32-S3** firmware side of the ENIGMA project. Currently, the main focus is on configuring the ESP32-S3 as a dedicated cryptographic co-processor (Hashing, AES Encryption, and SNTP Time Synchronization) WITHOUT using external crypto elements or RTC modules.

## 🎯 1. Pre-Flight Check (Run Before Updating)

Before making any changes to the crypto logic, ensure the existing baseline can build and flash successfully for the ESP32-S3 target.

### Step 1: Clean and Prepare ESP-IDF Environment
Ensure you have the Espressif ESP-IDF environment activated in your terminal. We are stripping out external modules (DS3231, ATECC608A, ESP-CAM).

### Step 2: Set Target & Build Firmware
Navigate to the `firmware/` folder, set the target to ESP32-S3, and trigger a full build:
```bash
cd firmware
idf.py set-target esp32s3
idf.py build
```

### Step 3: Flash and Monitor
Connect your ESP32-S3 via USB, put it in upload mode if required, and run:
```bash
idf.py flash monitor
```
**What to observe in the serial output:**
1. Does it connect to the WiFi successfully?
2. Does the internal SNTP service initialize and fetch the current network time accurately? (Ensure no I2C DS3231 calls are made).
3. Is it successfully listening for incoming raw entropy data (via Serial/UART or network socket from the PC running the laptop camera)?
4. Are MbedTLS functions initializing?

## 🔍 2. Focus Areas & Code to Check

Looking at the firmware codebase, here is where we need to focus our attention for the Crypto Coprocessor integration:

### A. SNTP & Time Synchronization (No DS3231)
*   **Where to Check:** `rtc.c` / `network.c`.
*   **What needs updating:** Remove any I2C communication meant for the DS3231. The ESP32-S3 MUST have an accurate timestamp derived purely from its internal RTC synched over WiFi via SNTP.

### B. Cryptographic Pipeline (MbedTLS, No ATECC608A)
*   **Where to Check:** `crypto.c` and `crypto.h` / `CMakeLists.txt`.
*   **What needs updating:** 
    *   **Remove ATECC608A:** Strip out any references or I2C calls to `atecc608a.c`. Disconnect it from compiling in `CMakeLists.txt` if necessary.
    *   **SHA-256:** Validate that the native `mbedtls_sha256` correctly conditions the incoming raw bitstream.
    *   **Key Derivation:** Check the concatenation of `device_id` + `timestamp` + `server_seed` (Using the new SNTP time, not DS3231 time).
    *   **AES-128-CTR:** Verify the native `mbedtls_aes_crypt_ctr` implementation. Ensure MbedTLS hardware acceleration is used for the ESP32-S3.

### C. PC to ESP32-S3 Communication
*   **Where to Check:** `main.c`, `websocket_client.c` / `network.c`.
*   **What needs updating:** The mechanism by which the PC (Backend running the laptop camera) sends the raw bitstream to the ESP32-S3. Ensure the buffer parsing logic robustly handles incoming payloads.

## 🚀 3. Task List for the Next Gemini CLI Session

When you start your session working on the firmware, prompt the CLI with the following steps:

1. **"Clean up Legacy Code: Please review my project tree and help me delete or comment out `atecc608a.c`, `atecc608a.h`, the DS3231 logic in `rtc.c`, and any ESP-CAM driver dependencies entirely, as we are shifting completely to the ESP32-S3 native hardware."**
2. **"Analyze `crypto.c`: Let's review the MbedTLS implementations for SHA-256 and AES-128-CTR to ensure they replace the ATECC608A seamlessly."**
3. **"Check Time Sync: Help me verify that the ESP32-S3 internal SNTP synchronization (`sntp_setoperatingmode`) is replacing the DS3231 properly and blocking execution until a valid timestamp is acquired."**
4. **"Optimize MbedTLS for ESP32-S3: How can we enable hardware acceleration for AES and SHA functions in `menuconfig` to speed up the encryption?"**

---
*Use this checklist directly with Gemini when you dive into the C/C++ firmware codebase.*