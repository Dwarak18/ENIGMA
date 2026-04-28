# ENIGMA Project - Full Memory & Architecture Overview

## Project Summary
**ENIGMA** is a cryptographically secure, tamper-evident logging system. The system spans a full web stack and uses a dedicated **ESP32-S3** microcontroller as a hardware cryptographic co-processor to ensure secure hashing, encryption, and accurate timestamping via **SNTP**.

**Key Changes & Clarifications:**
- 🚫 **REMOVED:** DS3231 external RTC module (Now using ESP32-S3 internal RTC with SNTP).
- 🚫 **REMOVED:** ATECC608A crypto element (Now using ESP32-S3 hardware-accelerated MbedTLS).
- 🚫 **REMOVED:** ESP32-CAM / AI-Thinker Camera module.
- ✅ **ADDED:** Laptop camera for all image capturing.
- ✅ **ADDED:** ESP32-S3 acts purely as the embedded cryptography and time-sync engine.

## 🛠 Technology Stack & Current State

### Frontend (Strong)
*   **Technologies:** React 18, Vite, Tailwind CSS.
*   **Functionality:** Interfaces for Device Management, capturing images using the **Laptop Camera**, and a dedicated Verification UI to validate record integrity. 
*   **State:** Fully functional and solid.

### Backend (Strong)
*   **Technologies:** Python, FastAPI, SQLAlchemy, PostgreSQL 15, OpenCV.
*   **Functionality:** Handles REST API routes (`/devices`, `/capture`, `/records`, `/verify`). Manages the raw image processing (LSB extraction) before offloading cryptographic operations to the ESP32-S3. Links hashed records in a chain format.
*   **State:** Fully functional and solid, operating alongside PostgreSQL.

### Infrastructure & DevOps
*   **Technologies:** Docker, Docker Compose, Nginx.
*   **State:** Configured via `docker-compose.yml` for seamless `up`/`down`. 

### Firmware / IoT Hardware (ESP32-S3 Crypto Coprocessor)
*   **Hardware:** **ESP32-S3**.
*   **Technologies:** C/C++, ESP-IDF SDK (v5.1), native **MbedTLS** (hardware accelerated).
*   **Functionality:** 
    1. Receive raw bitstream/entropy from the PC/Backend.
    2. Synchronize accurate network time using internal RTC and **SNTP** over WiFi (no DS3231).
    3. Condition entropy via hashing (SHA-256) via MbedTLS (no ATECC608A).
    4. Derive encryption keys locally (`device_id` + `timestamp` + `server_seed`).
    5. Encrypt data locally via AES-128-CTR using native MbedTLS hardware acceleration.
    6. Generate an integrity hash and package the payload to send back to the backend.
*   **State:** This is the current development focus. The ESP32-S3 needs to be strictly validated for its serial/network communication, SNTP synchronization, and MbedTLS cryptographic pipeline.

## 🔐 Core Cryptographic & Blockchain Pipeline
1.  **Entropy Sourcing:** The **Laptop Camera** captures an image matrix (via frontend/backend).
2.  **Bitstream Extraction:** The backend/PC extracts the pseudo-random LSBs (least significant bits) to form raw binary entropy.
3.  **Hardware Offload:** Raw bitstream is transmitted to the ESP32-S3.
4.  **Time & Conditioning (ESP32-S3):** Grabs current SNTP time. `SHA256(Raw Bitstream) -> 32 bytes Conditioned Entropy` (using internal MbedTLS).
5.  **Key Derivation (ESP32-S3):** `SHA256(device_id + timestamp + server_seed) -> AES-128 Key`.
6.  **Encryption (ESP32-S3):** `AES-128-CTR(key, iv, conditioned_data) -> Ciphertext` (using internal MbedTLS).
7.  **Immutable Hash Chaining (Blockchain mechanism):** 
    `Current Integrity Hash = SHA256(ciphertext + timestamp + derived_key + Previous_Hash)`.
    If *any* historical record is altered, all future hashes become invalid.

## 📌 Next Steps & Open Items
*   **ESP32-S3 Crypto Pipeline:** Validate the `crypto.c` functions utilizing native MbedTLS for AES and SHA-256 on the ESP32-S3. Verify hardware acceleration is enabled in `menuconfig`.
*   **SNTP Synchronization:** Ensure the ESP32-S3 maintains a highly accurate clock via internal SNTP (no DS3231) before any encryption takes place.
*   **Remove Old Drivers:** Ensure all legacy driver files (like `atecc608a.c`, `rtc.c` configured for I2C/DS3231, and `esp_camera` logic) are fully purged or ignored in the CMake build.