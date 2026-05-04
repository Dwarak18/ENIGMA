# ENIGMA Performance Analysis Report

**Generated**: 2026-05-03T21:42:37.792998

---

## Executive Summary

- **Total Runs**: 300
- **Success Rate**: 91.0%
- **Median E2E Latency**: 184ms
- **P95 E2E Latency**: 426ms
- **P99 E2E Latency**: 477ms

## Identified Bottlenecks

### 1. [HIGH] Network dominates latency: 63.3% of total
**Recommendation**: Check WiFi signal strength and UART baud rate

### 2. [MEDIUM] High failure rate: 9.0% of requests failed
**Recommendation**: Check error logs for root cause (replay, stale timestamp, etc)

## End-to-End Latency

| Metric | Value |
|--------|-------|
| Min | 113ms |
| p50 (Median) | 184ms |
| Mean | 218ms |
| p95 | 426ms |
| p99 | 477ms |
| Max | 490ms |
| StdDev | 90ms |

## Firmware Latency Breakdown

**Total**: p50=41ms, p95=55ms
- **AES Encrypt**: p50=28ms, p95=40ms
- **SHA-256**: p50=10ms, p95=15ms

## Network Latency

**Total Network**: p50=100ms, p95=343ms

## Backend Processing

**Total**: p50=39ms, p95=50ms
- **Validation**: p50=7ms, p95=10ms
- **Signature Verify**: p50=12ms, p95=15ms
- **DB Insert**: p50=21ms, p95=29ms

## Failure Analysis

| Error Code | Count |
|-----------|-------|
| timestamp_stale | 11 |
| invalid_signature | 9 |
| replay_detected | 7 |

## Recommendations

1. **Compare against benchmarks** in `performance-guide.md` to assess overall health
2. **Graph visualization** plots show trends and distribution details
3. **Focus on P95/P99** for production SLO planning
4. **Monitor trends** over time by running analysis weekly
