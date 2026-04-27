import { uploadAndHash } from '../storage/minioClient.js';
import { addToBatch, getPendingBatchSize } from '../batch/batchProcessor.js';

export async function processRecord(rawData) {
  if (rawData === undefined || rawData === null) {
    throw new Error('processRecord requires raw data');
  }

  const hash = await uploadAndHash(rawData);
  await addToBatch(hash);

  return {
    hash,
    pendingBatchSize: getPendingBatchSize(),
  };
}
