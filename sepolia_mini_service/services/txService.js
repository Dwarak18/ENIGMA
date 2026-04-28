const { getWallet } = require('../config/blockchain');
const { ethers } = require('ethers');

/**
 * Sends a transaction to the wallet's own address with the hash in the data field.
 */
async function sendHashTransaction(hashString) {
    const wallet = getWallet();
    
    // Convert string to hex (utf8 -> hex) and prefix with 0x
    const hexData = ethers.hexlify(ethers.toUtf8Bytes(hashString));

    console.log(`--- Initiating Transaction ---`);
    console.log(`Wallet Address: ${wallet.address}`);
    console.log(`Data (Hex): ${hexData}`);

    const txRequest = {
        to: wallet.address,
        value: 0,
        data: hexData
    };

    try {
        const txResponse = await wallet.sendTransaction(txRequest);
        console.log(`Transaction Sent! Hash: ${txResponse.hash}`);
        
        return {
            txHash: txResponse.hash,
            status: 'submitted',
            etherscanUrl: `https://sepolia.etherscan.io/tx/${txResponse.hash}`
        };
    } catch (error) {
        if (error.code === 'INSUFFICIENT_FUNDS') {
            throw new Error("Insufficient Sepolia ETH for gas fees.");
        }
        throw new Error(`Blockchain error: ${error.message}`);
    }
}

module.exports = { sendHashTransaction };
