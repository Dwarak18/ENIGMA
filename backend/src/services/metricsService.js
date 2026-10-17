/**
 * src/services/metricsService.js
 * Real-time pipeline metrics tracking.
 * Tracks latency and success rates for each pipeline stage.
 */
'use strict';

const logger = require('../logger');

/**
 * Pipeline stages and their tracking windows
 * Each stage tracks: count, successes, total_latency_ms
 */
const STAGES = {
  capture: { name: 'Image Capture', windowSize: 100 },
  preproc: { name: 'Pre-processing', windowSize: 100 },
  trng: { name: 'TRNG Gen', windowSize: 100 },
  hash: { name: 'Hashing', windowSize: 100 },
  time: { name: 'Trusted Time', windowSize: 100 },
  sign: { name: 'HW Signing', windowSize: 100 },
  ledger: { name: 'Ledger Entry', windowSize: 100 },
  blockchain: { name: 'Blockchain', windowSize: 100 },
};

// Rolling window for each stage: { count, successes, latencies: [] }
const _metrics = new Map();

// Initialize all stages
for (const [stageId, stage] of Object.entries(STAGES)) {
  _metrics.set(stageId, {
    count: 0,
    successes: 0,
    failures: 0,
    latencies: [],
    lastLatency: 0,
  });
}

/**
 * Record a metric event for a pipeline stage.
 * @param {string} stageId - Stage identifier (capture, preproc, etc)
 * @param {boolean} success - Whether the operation succeeded
 * @param {number} latencyMs - Operation latency in milliseconds
 */
function recordMetric(stageId, success, latencyMs) {
  if (!_metrics.has(stageId)) {
    logger.warn('Unknown metric stage', { stageId });
    return;
  }

  const m = _metrics.get(stageId);
  m.count += 1;
  m.lastLatency = latencyMs;

  if (success) {
    m.successes += 1;
  } else {
    m.failures += 1;
  }

  // Keep rolling window of latencies
  m.latencies.push(latencyMs);
  if (m.latencies.length > STAGES[stageId].windowSize) {
    m.latencies.shift();
  }
}

/**
 * Get current metrics for all stages.
 * @returns {Object} { stageId: { latency, successRate, status } }
 */
function getMetrics() {
  const result = {};

  for (const [stageId, stage] of Object.entries(STAGES)) {
    const m = _metrics.get(stageId);
    const successRate = m.count > 0 ? (m.successes / m.count) * 100 : 100;
    const avgLatency = m.latencies.length > 0
      ? Math.round(m.latencies.reduce((a, b) => a + b, 0) / m.latencies.length)
      : m.lastLatency || 0;

    result[stageId] = {
      name: stage.name,
      latency: avgLatency,
      lastLatency: m.lastLatency,
      successRate: parseFloat(successRate.toFixed(1)),
      count: m.count,
      successes: m.successes,
      failures: m.failures,
    };
  }

  return result;
}

/**
 * Get formatted pipeline array for dashboard.
 * @returns {Array} Pipeline steps with metrics
 */
function getPipelineWithMetrics() {
  const metrics = getMetrics();
  const stages = [
    'capture', 'preproc', 'trng', 'hash', 'time', 'sign', 'ledger', 'blockchain'
  ];

  return stages.map(stageId => {
    const m = metrics[stageId];
    // Determine status based on recent success
    let status = 'idle';
    if (m.count === 0) {
      status = 'idle';
    } else if (m.failures === 0) {
      status = 'success';
    } else if (m.successRate >= 95) {
      status = 'success';
    } else if (m.successRate >= 80) {
      status = 'warning';
    } else {
      status = 'error';
    }

    return {
      id: stageId,
      name: m.name,
      status,
      latency: m.latency,
      successRate: m.successRate,
    };
  });
}

/**
 * Reset all metrics (useful for testing/development).
 */
function resetMetrics() {
  for (const [stageId] of Object.entries(STAGES)) {
    _metrics.set(stageId, {
      count: 0,
      successes: 0,
      failures: 0,
      latencies: [],
      lastLatency: 0,
    });
  }
  logger.info('Metrics reset');
}

module.exports = {
  recordMetric,
  getMetrics,
  getPipelineWithMetrics,
  resetMetrics,
};
