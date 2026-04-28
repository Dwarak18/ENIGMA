import cv2
import requests
import time
import os
import json
from Crypto.Cipher import AES
from Crypto.Util.Padding import pad
from Crypto.Random import get_random_bytes

# --- CONFIGURATION ---
BACKEND_URL = "http://localhost:3000/upload"
AES_KEY = get_random_bytes(32)  # In production, use a shared or derived key
# For demo purposes, we'll use a fixed key if not random
# AES_KEY = b'12345678901234567890123456789012' 

def encrypt_image(image_bytes, key):
    """Encrypts image bytes using AES-256-CBC."""
    iv = get_random_bytes(16)
    cipher = AES.new(key, AES.MODE_CBC, iv)
    ciphertext = cipher.encrypt(pad(image_bytes, AES.block_size))
    return iv + ciphertext  # Prepend IV for the receiver

def capture_and_send():
    # 1. Initialize Webcam
    cap = cv2.VideoCapture(0)
    if not cap.isOpened():
        print("Error: Could not open webcam.")
        return

    print("Webcam active. Press SPACE to capture, or ESC to quit.")

    while True:
        ret, frame = cap.read()
        if not ret:
            break

        cv2.imshow("Capture Image", frame)
        
        key_press = cv2.waitKey(1)
        if key_press == 27:  # ESC
            break
        elif key_press == 32:  # SPACE
            print("Capturing image...")
            
            # 2. Convert image to JPEG byte stream
            success, encoded_image = cv2.imencode('.jpg', frame)
            if not success:
                print("Error: Encoding failed.")
                continue
            
            image_bytes = encoded_image.tobytes()
            print(f"Original size: {len(image_bytes)} bytes")

            # 3. Encrypt Image
            print("Encrypting with AES-256-CBC...")
            encrypted_payload = encrypt_image(image_bytes, AES_KEY)
            print(f"Encrypted size: {len(encrypted_payload)} bytes")

            # 4. Generate Timestamp
            timestamp = str(int(time.time()))

            # 5. Send to Backend via HTTP POST
            print(f"Sending to backend: {BACKEND_URL}")
            headers = {
                'Content-Type': 'application/octet-stream',
                'X-Timestamp': timestamp
            }
            
            try:
                response = requests.post(BACKEND_URL, data=encrypted_payload, headers=headers)
                
                if response.status_code == 200:
                    print("✓ Success!")
                    print("Backend Response:", json.dumps(response.json(), indent=2))
                else:
                    print(f"✗ Failed (HTTP {response.status_code})")
                    print(response.text)
            except Exception as e:
                print(f"✗ Error: {str(e)}")
            
            # Wait a bit or break
            print("\nReady for next capture.")

    cap.release()
    cv2.destroyAllWindows()

if __name__ == "__main__":
    capture_and_send()
