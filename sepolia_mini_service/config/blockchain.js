require('dotenv').config();
const { ethers } = require('ethers');

/**
 * Initialize Provider and Wallet
 */
function getWallet() {
    const rpcUrl = process.env.SEPOLIA_RPC_URL;
    const privateKey = process.env.PRIVATE_KEY;

    if (!rpcUrl || !privateKey || privateKey === 'YOUR_PRIVATE_KEY_HERE') {
        throw new Error("Missing SEPOLIA_RPC_URL or PRIVATE_KEY in .env file");
    }

    try {
        const provider = new ethers.JsonRpcProvider(rpcUrl);
        const wallet = new ethers.Wallet(privateKey, provider);
        return wallet;
    } catch (error) {
        throw new Error(`Failed to initialize wallet: ${error.message}`);
    }
}

module.exports = { getWallet };
