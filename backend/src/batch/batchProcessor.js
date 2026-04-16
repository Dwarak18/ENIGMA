import { contract } from '../blockchain/contractClient.js';

const batchSize = Number(process.env.BATCH_SIZE || 5);
const pendingHashes = [];
let flushInFlight = null;

function isBytes32(hash) {
  return /^0x[a-fA-F0-9]{64}$/.test(hash);
}

export function getPendingBatchSize() {
  return pendingHashes.length;
}

export async function addToBatch(hash) {
  if (!isBytes32(hash)) {
    throw new Error(`Invalid bytes32 hash: ${hash}`);
  }

  pendingHashes.push(hash);

  if (pendingHashes.length >= batchSize) {
    await flushBatch();
  }
}

export async function flushBatch() {
  if (flushInFlight) {
    await flushInFlight;
    return null;
  }

  if (pendingHashes.length === 0) {
    return null;
  }

  const batchToCommit = pendingHashes.splice(0, pendingHashes.length);

  flushInFlight = (async () => {
    try {
      const tx = await contract.storeBatch(batchToCommit);
      const receipt = await tx.wait(1);

      console.info('Batch committed on-chain', {
        batchSize: batchToCommit.length,
        txHash: receipt?.hash || tx.hash,
        blockNumber: receipt?.blockNumber,
        gasUsed: receipt?.gasUsed?.toString?.(),
      });

      return receipt?.hash || tx.hash;
    } catch (err) {
      pendingHashes.unshift(...batchToCommit);
      console.error('Batch commit failed', {
        batchSize: batchToCommit.length,
        pendingBatchSize: pendingHashes.length,
        error: err?.message || String(err),
      });
      throw err;
    } finally {
      flushInFlight = null;
    }
  })();

  return flushInFlight;
}
