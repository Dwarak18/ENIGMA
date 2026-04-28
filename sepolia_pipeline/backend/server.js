const express = require('express');
const bodyParser = require('body-parser');
const crypto = require('crypto');
const { ethers } = require('ethers');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

// Configuration from Environment Variables
const PRIVATE_KEY = process.env.PRIVATE_KEY;
const INFURA_URL = process.env.INFURA_URL; // or other provider URL
const CONTRACT_ADDRESS = process.env.CONTRACT_ADDRESS;
const SECRET_KEY = process.env.SECRET_KEY || 'default_secret_key';

// ABI for the ImageProof contract (only the storeHash function is needed for the transaction)
const ABI = [
    "function storeHash(bytes32 _hash) public",
    "function getHash(uint256 _index) public view returns (bytes32)",
    "event HashStored(address indexed storer, bytes32 indexed hash, uint256 index)"
];

// Initialize Provider and Signer
let contract;
if (PRIVATE_KEY && INFURA_URL && CONTRACT_ADDRESS) {
    const provider = new ethers.JsonRpcProvider(INFURA_URL);
    const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
    contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, wallet);
    console.log(`✓ Blockchain layer initialized at ${CONTRACT_ADDRESS}`);
} else {
    console.warn('! Blockchain credentials missing in .env. Running in LOCAL HASH mode only.');
}

// Middleware to handle raw binary data (encrypted image)
app.use(bodyParser.raw({ type: 'application/octet-stream', limit: '10mb' }));

/**
 * POST /upload
 * Receives encrypted binary data, hashes it with metadata, and stores on Sepolia.
 * 
 * Headers:
 *   Content-Type: application/octet-stream
 *   X-Timestamp: unix_timestamp
 */
app.post('/upload', async (req, res) => {
    try {
        const encryptedData = req.body;
        const timestamp = req.headers['x-timestamp'] || Date.now().toString();

        if (!encryptedData || encryptedData.length === 0) {
            return res.status(400).json({ error: 'No data received' });
        }

        console.log(`Received ${encryptedData.length} bytes. Hashing...`);

        // Generate SHA-256 Hash: hash(encrypted_data + timestamp + secret_key)
        const hashInput = Buffer.concat([
            encryptedData,
            Buffer.from(timestamp),
            Buffer.from(SECRET_KEY)
        ]);
        const sha256Hash = crypto.createHash('sha256').update(hashInput).digest('hex');
        const bytes32Hash = '0x' + sha256Hash;

        console.log(`Generated Hash: ${bytes32Hash}`);

        let txHash = null;
        if (contract) {
            console.log('Submitting to Sepolia...');
            const tx = await contract.storeHash(bytes32Hash);
            console.log(`Transaction sent: ${tx.hash}`);
            await tx.wait();
            txHash = tx.hash;
            console.log('✓ Transaction confirmed on-chain');
        }

        res.status(200).json({
            success: true,
            hash: bytes32Hash,
            timestamp: timestamp,
            transactionHash: txHash,
            message: txHash ? 'Stored on blockchain' : 'Hash generated locally (no contract configured)'
        });

    } catch (error) {
        console.error('Error processing upload:', error);
        res.status(500).json({ error: error.message });
    }
});

app.listen(port, () => {
    console.log(`Backend listening at http://localhost:${port}`);
});
