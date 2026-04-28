# Sepolia Image Proof System

A full-stack pipeline for secure image capture, AES-256 encryption, SHA-256 hashing, and blockchain storage on the Ethereum Sepolia test network.

## Project Structure

```text
sepolia_pipeline/
├── client/
│   ├── capture.py        # Python client (OpenCV + AES)
│   └── requirements.txt  # Python dependencies
├── backend/
│   ├── server.js         # Node.js Express server (ethers.js)
│   └── package.json      # Node.js dependencies
└── contract/
    └── ImageProof.sol    # Solidity Smart Contract
```

---

## Setup Instructions

### 1. Smart Contract Deployment
1. Open [Remix IDE](https://remix.ethereum.org/).
2. Create a new file `ImageProof.sol` and paste the content from `contract/ImageProof.sol`.
3. Compile using version `0.8.0` or higher.
4. Deploy to **Injected Provider - MetaMask** (ensure your MetaMask is on the **Sepolia** network).
5. Copy the **Contract Address** once deployed.

### 2. Backend Configuration
1. Navigate to the `backend/` directory:
   ```bash
   cd backend
   npm install
   ```
2. Create a `.env` file in the `backend/` folder:
   ```env
   PORT=3000
   PRIVATE_KEY=your_metamask_private_key
   INFURA_URL=https://sepolia.infura.io/v3/your_infura_project_id
   CONTRACT_ADDRESS=your_deployed_contract_address
   SECRET_KEY=your_shared_secret_for_hashing
   ```
3. Start the server:
   ```bash
   npm start
   ```

### 3. Client Configuration
1. Navigate to the `client/` directory:
   ```bash
   cd client
   pip install -r requirements.txt
   ```
2. Ensure the `BACKEND_URL` in `capture.py` matches your backend address.
3. Run the client:
   ```bash
   python capture.py
   ```

---

## How it Works
1. **Laptop Client**: Captures a frame from the webcam using OpenCV, encrypts the JPEG stream with AES-256-CBC, and sends the encrypted binary to the backend.
2. **Backend Server**: Receives the binary data, combines it with the timestamp and a server-side secret, generates a SHA-256 hash, and submits a transaction to the Sepolia testnet.
3. **Blockchain**: The `ImageProof` contract stores the 32-byte hash in an immutable array.

## Security Features
*   **AES-256-CBC**: Strong encryption for image data in transit.
*   **Tamper-Evidence**: The hash on the blockchain proves that the image and its metadata have not been altered.
*   **Privacy**: Only hashes are stored on the blockchain; raw image data never leaves the local environment in unencrypted form.
