import 'dotenv/config';
import { processRecord } from './services/recordService.js';
import { flushBatch, getPendingBatchSize } from './batch/batchProcessor.js';

async function runDemo() {
  const sampleInputs = [
    { deviceId: 'esp32-001', ts: Date.now(), payload: 'entropy-001' },
    { deviceId: 'esp32-002', ts: Date.now(), payload: 'entropy-002' },
    { deviceId: 'esp32-003', ts: Date.now(), payload: 'entropy-003' },
    { deviceId: 'esp32-004', ts: Date.now(), payload: 'entropy-004' },
    { deviceId: 'esp32-005', ts: Date.now(), payload: 'entropy-005' },
    { deviceId: 'esp32-006', ts: Date.now(), payload: 'entropy-006' },
  ];

  for (const input of sampleInputs) {
    const result = await processRecord(input);
    console.info('Record processed', {
      hash: result.hash,
      pendingBatchSize: result.pendingBatchSize,
    });
  }

  if (getPendingBatchSize() > 0) {
    const txHash = await flushBatch();
    console.info('Final batch flushed', { txHash });
  }
}

async function flushBeforeExit(signal) {
  console.info('Shutdown signal received', { signal });
  try {
    if (getPendingBatchSize() > 0) {
      await flushBatch();
    }
  } finally {
    process.exit(0);
  }
}

process.on('SIGINT', () => {
  void flushBeforeExit('SIGINT');
});

process.on('SIGTERM', () => {
  void flushBeforeExit('SIGTERM');
});

runDemo().catch(async (err) => {
  console.error('Backend pipeline failed', { error: err?.message || String(err) });
  try {
    if (getPendingBatchSize() > 0) {
      await flushBatch();
    }
  } catch (flushErr) {
    console.error('Final flush failed', { error: flushErr?.message || String(flushErr) });
  }
  process.exit(1);
});
