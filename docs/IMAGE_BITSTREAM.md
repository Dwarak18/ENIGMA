# ENIGMA – Image Bitstream Feature

## Overview

The Image Bitstream feature extends ENIGMA to capture visual data from an ESP32-CAM module, extract a cryptographic bitstream (64 or 128 bits), encrypt it using AES-256, and submit it to the backend for storage and verification.

---

## Architecture

```
ESP32-CAM → Image Capture → Bitstream Extraction → AES-256 Encryption → Backend → Frontend
```

### Data Flow

1. **Image Capture**: ESP32-CAM captures a grayscale image (320x240 QVGA)
2. **Bitstream Extraction**: Extracts 64 or 128 bits from pixel LSBs
3. **Hash Computation**: SHA-256 hash of original bitstream for integrity
4. **AES Encryption**: Encrypts bitstream using entropy bytes as AES-256 key
5. **POST to Backend**: Sends encrypted bits + IV + hash
6. **Storage**: PostgreSQL stores all fields
7. **Frontend Display**: Shows encrypted bitstream with visual representation

---

## Hardware Requirements

### ESP32-CAM Module
- **Recommended**: AI-Thinker ESP32-CAM
- **Camera**: OV2640 (2MP)
- **PSRAM**: Required for frame buffer
- **Power**: 5V 1A minimum (use proper power supply)

### Pin Configuration (AI-Thinker)
```c
PWDN:   32
RESET:  -1
XCLK:   0
SIOD:   26
SIOC:   27
D7:     35
D6:     34
D5:     39
D4:     36
D3:     21
D2:     19
D1:     18
D0:     5
VSYNC:  25
HREF:   23
PCLK:   22
```

---

## Firmware Implementation

### Configuration (`config.h`)

```c
#define CAMERA_ENABLED         1       /* Enable camera feature */
#define CAMERA_MODEL_AI_THINKER         /* Camera model */
#define IMAGE_BITSTREAM_BITS   128     /* 64 or 128 bits */
```

### Modules

#### `camera.c/h` - Image Capture
- Initializes ESP32-CAM hardware
- Captures grayscale frames (QVGA 320x240)
- Extracts bitstream from pixel LSBs
- Computes SHA-256 hash of bitstream

**Bitstream Extraction Algorithm**:
```c
// Sample pixels at regular intervals
for each bit position i:
    pixel_idx = i * stride
    bit = pixel[pixel_idx] & 0x01  // Extract LSB
    set bit in output buffer
```

#### `aes_encryption.c/h` - AES-256 Encryption
- Uses ESP32 hardware AES accelerator
- CBC mode with PKCS7 padding
- Random IV from hardware TRNG
- Key derived from entropy bytes

**Encryption Flow**:
```
plaintext (64/128 bits) 
    ↓
PKCS7 padding (to 16-byte boundary)
    ↓
AES-256-CBC encrypt (key = entropy_raw)
    ↓
ciphertext (16 or 32 bytes)
```

---

## Database Schema

### New Columns in `entropy_records`

```sql
image_bits      TEXT,        -- Original bitstream (optional, not sent)
image_encrypted TEXT,        -- AES-256 encrypted bitstream (hex)
image_iv        TEXT,        -- AES initialization vector (hex)
image_hash      TEXT,        -- SHA-256 of original bitstream (hex)
```

### Field Specifications

| Column            | Type | Length | Description                          |
|-------------------|------|--------|--------------------------------------|
| `image_encrypted` | TEXT | 16-64  | Hex-encoded AES ciphertext           |
| `image_iv`        | TEXT | 32     | Hex-encoded 16-byte IV               |
| `image_hash`      | TEXT | 64     | Hex-encoded SHA-256 hash             |

---

## API Changes

### POST `/api/v1/entropy` - New Fields

```json
{
  "device_id":       "esp32-001",
  "timestamp":       1700000000,
  "entropy_hash":    "a3f1...",
  "signature":       "4f2e...",
  "image_encrypted": "9a2f...",  // NEW
  "image_iv":        "5e7a...",  // NEW
  "image_hash":      "2d8c..."   // NEW
}
```

### Validation Rules

- `image_encrypted`: 16-64 character hex string (optional)
- `image_iv`: 32 character hex string (optional)
- `image_hash`: 64 character hex string (optional)

---

## Frontend Components

### `ImageBitstreamCard.jsx`
Main card component displaying:
- Encrypted bitstream hex value
- Initialization vector
- Original hash for verification
- Visual bit representation (4 bits per hex char)
- Decryption instructions

### `ImageBitstreamDisplay.jsx`
Low-level display component:
- Hex visualization
- Bit-level visualization (binary bars)
- Stats (lengths, bit count)

### Integration

Components are automatically shown when `image_encrypted` is present in the record.

---

## Decryption Guide

To decrypt the image bitstream:

### 1. Extract Key from Entropy
```javascript
const key = Buffer.from(entropy_hash, 'hex');  // 32 bytes
```

### 2. Decrypt with AES-256-CBC
```javascript
const crypto = require('crypto');

function decryptImageBitstream(encryptedHex, ivHex, key) {
  const ciphertext = Buffer.from(encryptedHex, 'hex');
  const iv = Buffer.from(ivHex, 'hex');
  
  const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
  decipher.setAutoPadding(true);  // PKCS7 padding
  
  let plaintext = decipher.update(ciphertext);
  plaintext = Buffer.concat([plaintext, decipher.final()]);
  
  return plaintext;  // Original 8 or 16 bytes
}
```

### 3. Verify Integrity
```javascript
const hash = crypto.createHash('sha256').update(plaintext).digest('hex');
assert(hash === image_hash);  // Integrity check
```

---

## Configuration Options

### Bitstream Length
Edit `firmware/main/config.h`:
```c
#define IMAGE_BITSTREAM_BITS   64   // or 128
```

**Trade-offs**:
- **64 bits**: Smaller payload, faster encryption, less data
- **128 bits**: More entropy from image, larger ciphertext

### Image Resolution
Edit `firmware/main/camera.c`:
```c
.frame_size = FRAMESIZE_QVGA,  // 320x240
// or
.frame_size = FRAMESIZE_VGA,   // 640x480 (requires more PSRAM)
```

### Pixel Format
```c
.pixel_format = PIXFORMAT_GRAYSCALE,  // 1 byte/pixel
// or
.pixel_format = PIXFORMAT_RGB565,     // 2 bytes/pixel (color)
```

---

## Testing

### Firmware Test (simulate.py)
```python
# Test bitstream extraction
python firmware/simulate.py --camera --bits 128
```

### Backend Test
```bash
# POST test payload with image fields
curl -X POST http://localhost:3000/api/v1/entropy \
  -H "Content-Type: application/json" \
  -d '{
    "device_id": "esp32-001",
    "timestamp": 1700000000,
    "entropy_hash": "a3f1...",
    "signature": "4f2e...",
    "image_encrypted": "9a2f...",
    "image_iv": "5e7a...",
    "image_hash": "2d8c..."
  }'
```

### Frontend Test
1. Start dev server: `cd frontend && npm run dev`
2. Navigate to **Cameras** page
3. Verify image bitstream card appears with encrypted data

---

## Troubleshooting

### Camera Not Initializing
- Check power supply (5V 1A minimum)
- Verify PSRAM is enabled in `sdkconfig`
- Check pin connections match configuration

### Bitstream Extraction Fails
- Ensure frame buffer is captured successfully
- Check image size > 0 bytes
- Verify stride calculation doesn't exceed buffer

### Decryption Fails
- Confirm entropy_hash is used as AES-256 key (32 bytes)
- Verify IV is 16 bytes (32 hex chars)
- Check PKCS7 padding is enabled

### Frontend Shows "No image bitstream available"
- Check `image_encrypted` field in database
- Verify WebSocket is broadcasting new fields
- Ensure backend is returning all image fields

---

## Security Considerations

### Encryption Strength
- **AES-256-CBC**: Industry standard symmetric encryption
- **Random IV**: New IV per image (from hardware TRNG)
- **Key Derivation**: Uses entropy bytes (true random)

### Integrity Verification
- SHA-256 hash of original bitstream
- Hash is stored unencrypted for verification
- Allows integrity check without decryption key

### Privacy
- Original image is **never stored** (only 64/128 bits extracted)
- Encrypted bitstream cannot be reversed without key
- Key (entropy) is only known to device and backend

---

## Performance Impact

### Firmware
- **Capture**: ~100ms for QVGA image
- **Extraction**: ~10ms (simple bit operations)
- **Encryption**: ~5ms (hardware AES)
- **Total overhead**: ~115ms per cycle

### Backend
- **Validation**: Negligible (hex string length check)
- **Storage**: +96 bytes per record (3 new TEXT fields)
- **Broadcast**: +200 bytes per WebSocket message

### Frontend
- **Rendering**: Minimal (static hex display)
- **Visualization**: ~1ms (simple bit bars)

---

## Future Enhancements

1. **Image Reconstruction**: Store full compressed image
2. **Multiple Bitstreams**: Extract from different regions
3. **Compression**: Run-length encoding before encryption
4. **Blockchain Anchoring**: Hash image bitstream to ledger
5. **Machine Learning**: On-device image classification

---

## License

This feature is part of the ENIGMA project. See main LICENSE file.
