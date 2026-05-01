import express from 'express';
import { ethers } from 'ethers';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3001;
const RPC_URL = "http://127.0.0.1:8545";
const PRIVATE_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"; // Default Hardhat account #0

// You'll need to update this address after deployment
let CONTRACT_ADDRESS = "0x5FbDB2315678afecb367f032d93F642f64180aa3"; 
const ABI = [
    "function setData(string memory _data) public",
    "function data() public view returns (string memory)"
];

let provider;
let wallet;

async function init() {
    provider = new ethers.JsonRpcProvider(RPC_URL);
    wallet = new ethers.Wallet(PRIVATE_KEY, provider);
}

app.post('/submit-hash', async (req, res) => {
    const { hash } = req.body;
    if (!hash) return res.status(400).json({ error: "Hash is required" });

    try {
        if (!CONTRACT_ADDRESS) return res.status(500).json({ error: "Contract address not set" });
        
        const storageContract = new ethers.Contract(CONTRACT_ADDRESS, ABI, wallet);
        const tx = await storageContract.setData(hash);
        await tx.wait();

        res.json({
            txHash: tx.hash,
            stored: true
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: error.message });
    }
});

app.get('/get-data', async (req, res) => {
    try {
        if (!CONTRACT_ADDRESS) return res.status(500).json({ error: "Contract address not set" });

        const storageContract = new ethers.Contract(CONTRACT_ADDRESS, ABI, provider);
        const data = await storageContract.data();
        res.json({ data });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: error.message });
    }
});

// Endpoint to set contract address dynamically for demo purposes or after deployment
app.post('/set-contract', (req, res) => {
    const { address } = req.body;
    if (!address) return res.status(400).json({ error: "Address is required" });
    CONTRACT_ADDRESS = address;
    res.json({ status: "Contract address updated", address });
});

init().then(() => {
    app.listen(PORT, () => {
        console.log(`Backend API running at http://localhost:${PORT}`);
    });
});
