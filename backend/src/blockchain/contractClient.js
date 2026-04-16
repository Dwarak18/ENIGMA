import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Contract, JsonRpcProvider, Wallet, isAddress } from 'ethers';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const rpcUrl = process.env.RPC_URL;
const privateKey = process.env.PRIVATE_KEY;
const contractAddress = process.env.CONTRACT_ADDRESS;

if (!rpcUrl || !privateKey || !contractAddress) {
  throw new Error('RPC_URL, PRIVATE_KEY, and CONTRACT_ADDRESS must be set');
}

if (!/^0x[a-fA-F0-9]{64}$/.test(privateKey)) {
  throw new Error('PRIVATE_KEY must be a 0x-prefixed 32-byte hex string');
}

if (!isAddress(contractAddress)) {
  throw new Error('CONTRACT_ADDRESS must be a valid Ethereum address');
}

const abiPath = path.resolve(__dirname, '../../abi/RecordStorage.json');
const abiFile = await readFile(abiPath, 'utf8');
const abiJson = JSON.parse(abiFile);
const abi = Array.isArray(abiJson) ? abiJson : abiJson.abi;

export const provider = new JsonRpcProvider(rpcUrl);
export const wallet = new Wallet(privateKey, provider);
export const contract = new Contract(contractAddress, abi, wallet);
