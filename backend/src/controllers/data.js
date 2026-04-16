'use strict';

const entropyService = require('../services/entropyService');
const blockchainService = require('../services/blockchain');
const logger = require('../logger');

async function uploadToObjectStorage(record, payload) {
  // Placeholder for MinIO/OCI integration. Keep non-blocking and fail-safe.
  // Existing pipeline remains intact even if object storage is not configured.
  if (!payload.image_encrypted) return null;

  try {
    logger.debug('Object storage upload step completed/skipped', {
      id: record.id,
      device_id: record.device_id,
      has_image_payload: Boolean(payload.image_encrypted),
    });
    return null;
  } catch (err) {
    logger.warn('Object storage upload failed; continuing pipeline', {
      id: record.id,
      device_id: record.device_id,
      error: err.message || String(err),
    });
    return null;
  }
}

async function handlePostData(payload) {
  // 1) Payload is already validated by middleware.
  // 2) Persist to DB through existing entropy service.
  const record = await entropyService.processEntropy(payload);

  // 3) Storage stage (MinIO/OCI extension point).
  await uploadToObjectStorage(record, payload);

  // 4) Fire-and-forget blockchain store after persistence + storage.
  blockchainService.runAsyncStore(record.device_id, Number(record.timestamp), record.entropy_hash);

  return record;
}

module.exports = {
  handlePostData,
};
