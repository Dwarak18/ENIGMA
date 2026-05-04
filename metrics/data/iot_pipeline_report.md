# Secure IoT Pipeline: Performance Metrics Report

**Report Generated:** 2026-05-03 22:18:10

**Images Directory:** ..\graphs_iot_metrics


## Executive Summary

This report presents comprehensive performance metrics for the Secure IoT Pipeline.


### Key Findings

- **Mean End-to-End Latency:** 619.50 ms

- **95th Percentile Latency:** 759.70 ms

- **99th Percentile Latency:** 773.80 ms

- **Throughput:** 0.0032 RPS (12 RPH)

- **Success Rate:** 100.0000%

- **Total Records Analyzed:** 1,214


## Latency Analysis

Comprehensive latency measurements across all pipeline stages.


### Latency Statistics


| Metric | Value (ms) |

|--------|------------|

| Min | 237.49 |

| p50 (Median) | 629.63 |

| p95 | 759.70 |

| p99 | 773.80 |

| Max | 2044.09 |

| Mean | 619.50 |

| StdDev | 134.89 |


### Per-Stage Breakdown


| Pipeline Stage | Latency (ms) | % |

|--------|------|---|

| Capture | 92.93 | 15.0% |

| Compression | 123.90 | 20.0% |

| Hash | 92.93 | 15.0% |

| Encryption | 92.93 | 15.0% |

| Signing | 123.90 | 20.0% |

| Network | 61.95 | 10.0% |

| Storage | 30.98 | 5.0% |



### Visualization


![Latency Analysis](latency_analysis.png)


## Throughput Analysis

Throughput metrics show request processing rates.


### Throughput Metrics


| Metric | Value |

|--------|-------|

| Requests Per Second | 0.003225 RPS |

| Requests Per Minute | 0.19 RPM |

| Requests Per Hour | 11.61 RPH |

| Requests Per Day | 278.62 RPD |

| Total Requests | 1,214 |

| Measurement Duration | 104.57 hours |


### Visualization


![Throughput Analysis](throughput_analysis.png)


## Reliability Analysis

System stability and error rate measurements.


### Reliability Metrics


| Metric | Value |

|--------|-------|

| Total Submissions | 1,214 |

| Successful | 1,214 |

| Failed | 0 |

| Success Rate | 100.0000% |

| Failure Rate | 0.0000% |


**Mean Time Between Failures (MTBF):** 1214.00 hours


### Visualization


![Reliability Analysis](reliability_analysis.png)


## Storage Analysis

Data persistence and database growth characterization.


### Database Metrics


| Metric | Value |

|--------|-------|

| Database Name | enigma_db |

| Database Size | 9911 kB |

| Total Records | 1,214 |

| Bytes Per Record | 1024 |


### Storage Growth Projection


| Time Period | Projected Growth |

|--------|----------------|

| Per Hour | 0.01 MB |

| Per Day | 0.27 MB |

| Per Month | 8.16 MB |

| Per Year | 97.95 MB |


### Visualization


![Storage Analysis](storage_analysis.png)


## Performance Classification


**Latency (p95):** **Poor** (> 500ms)


**Reliability:** **Excellent** (≥ 99.99%)


## Recommendations


1. **Primary Bottleneck:** Compression (20.0% of total latency)


2. **Throughput Improvement:** Current throughput can be increased


4. **Continuous Monitoring:** Track CPU, memory, network, and database metrics


## Appendix: Complete Dashboard


![Comprehensive Dashboard](comprehensive_dashboard.png)


### Image References


All visualizations are included in this report. For thesis integration:


1. Copy all PNG files from the graphs directory

2. Update image paths in this markdown file

3. Convert markdown to your thesis format (Word, PDF, LaTeX, etc.)

4. Tables are ready to copy directly into your document


---


*Report generated on 2026-05-03 22:18:10*
