# Copilot Skills Configuration

## Core Skills Required

### 1. Frontend (Browser APIs)

* MediaDevices API (getUserMedia)
* Canvas API (frame extraction)
* Web Crypto API (SHA-256)
* Timing control (setInterval)

### 2. Backend (Node.js)

* Express.js API design
* Data validation
* Async processing
* Secure key handling

### 3. Database (PostgreSQL)

* Schema design (relational integrity)
* Foreign keys (frame_id linking)
* Binary data handling
* Secure storage practices

### 4. Embedded Systems (ESP32)

* AES-128 encryption
* SNTP time synchronization
* Secure key generation
* Serial/WiFi communication

### 5. Blockchain (Hardhat)

* Smart contract development (Solidity)
* Local blockchain deployment
* Hash storage and verification
* Gas-efficient design

---

## Cross-Domain Skills

* Cryptographic hashing (SHA-256)
* Entropy extraction techniques
* Bitstream processing
* Secure system design
* Data pipeline validation

---

## Strict Requirements

* Deterministic outputs
* No hidden state
* No insecure key storage
* No mock implementations
* Full error handling

---

## Anti-Patterns to Avoid

* Using Math.random()
* Storing plaintext AES keys
* Treating camera data as secure entropy
* Writing large data to blockchain
* Mixing frontend and cryptographic authority

---

## Expected Output Quality

* Production-grade code
* Modular functions
* Clear separation of concerns
* Fully testable pipeline
