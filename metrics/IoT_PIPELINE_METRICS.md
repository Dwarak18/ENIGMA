# SECURE IoT PIPELINE: COMPLETE METRICS LIST

## 1. LATENCY METRICS

### Overall
- end_to_end_latency_ms
- total_pipeline_latency_ms
- latency_p50_ms
- latency_p95_ms
- latency_p99_ms
- latency_p999_ms
- latency_min_ms
- latency_max_ms
- latency_mean_ms
- latency_std_dev_ms
- latency_variance_ms

### Per-Stage Breakdown
- camera_capture_latency_ms
- compression_latency_ms
- byte_conversion_latency_ms
- sha256_hash_latency_ms
- aes128_encryption_latency_ms
- hardware_signing_latency_ms
- ds3231_timestamp_latency_ms
- network_transmission_latency_ms
- backend_storage_latency_ms
- backend_database_write_latency_ms

### Per-Stage Statistics
- camera_capture_min_ms
- camera_capture_max_ms
- camera_capture_mean_ms
- camera_capture_stdev_ms
- compression_min_ms
- compression_max_ms
- compression_mean_ms
- compression_stdev_ms
- byte_conversion_min_ms
- byte_conversion_max_ms
- byte_conversion_mean_ms
- byte_conversion_stdev_ms
- sha256_min_ms
- sha256_max_ms
- sha256_mean_ms
- sha256_stdev_ms
- aes128_min_ms
- aes128_max_ms
- aes128_mean_ms
- aes128_stdev_ms
- signing_min_ms
- signing_max_ms
- signing_mean_ms
- signing_stdev_ms
- timestamp_min_ms
- timestamp_max_ms
- timestamp_mean_ms
- timestamp_stdev_ms
- transmission_min_ms
- transmission_max_ms
- transmission_mean_ms
- transmission_stdev_ms
- storage_min_ms
- storage_max_ms
- storage_mean_ms
- storage_stdev_ms

---

## 2. THROUGHPUT METRICS

### Frames & Requests
- frames_per_second_fps
- frames_per_minute
- frames_per_hour
- requests_per_second_rps
- requests_per_minute
- requests_per_hour
- requests_per_day
- peak_throughput_rps
- sustained_throughput_rps
- average_throughput_rps
- min_throughput_rps
- max_throughput_rps

### Capacity
- max_concurrent_frames
- max_concurrent_requests
- throughput_under_load_rps
- throughput_degradation_percent

---

## 3. CRYPTOGRAPHIC PERFORMANCE METRICS

### SHA-256
- sha256_execution_time_ms
- sha256_p50_ms
- sha256_p95_ms
- sha256_p99_ms
- sha256_throughput_hashes_per_second
- sha256_cpu_utilization_percent

### AES-128 Encryption
- aes128_encryption_time_ms
- aes128_encryption_p50_ms
- aes128_encryption_p95_ms
- aes128_encryption_p99_ms
- aes128_throughput_encryptions_per_second
- aes128_cpu_utilization_percent
- aes128_memory_usage_bytes

### Hardware Signing (ATECC608A)
- atecc608a_signing_time_ms
- atecc608a_signing_p50_ms
- atecc608a_signing_p95_ms
- atecc608a_signing_p99_ms
- atecc608a_throughput_signatures_per_second
- atecc608a_i2c_latency_ms
- atecc608a_communication_overhead_ms

### Crypto Overhead
- total_crypto_latency_ms
- crypto_overhead_percent
- crypto_latency_of_total_pipeline_percent
- sha256_percent_of_total
- aes128_percent_of_total
- signing_percent_of_total

### CPU Utilization During Crypto
- cpu_utilization_during_hashing_percent
- cpu_utilization_during_encryption_percent
- cpu_utilization_during_signing_percent
- cpu_utilization_total_percent
- core_0_utilization_percent
- core_1_utilization_percent

---

## 4. NETWORK METRICS

### Transmission
- transmission_latency_ms
- transmission_p50_ms
- transmission_p95_ms
- transmission_p99_ms
- transmission_min_ms
- transmission_max_ms
- transmission_mean_ms
- transmission_stdev_ms

### Reliability
- packet_loss_rate_percent
- packet_loss_count
- packets_sent
- packets_received
- packets_dropped
- packets_retransmitted
- retry_count
- retry_rate_percent
- max_retries_per_packet

### Bandwidth
- bandwidth_usage_mbps
- bandwidth_peak_mbps
- bandwidth_average_mbps
- data_transferred_mb
- data_transferred_gb
- bytes_sent
- bytes_received

### Network Quality
- jitter_ms
- jitter_p95_ms
- latency_variance_ms
- connection_stability_percent
- roundtrip_time_ms
- ping_latency_ms

---

## 5. DATA INTEGRITY & SECURITY METRICS

### Hash Verification
- sha256_verification_success_rate_percent
- sha256_verification_failures
- sha256_verification_total_attempts
- hash_mismatch_count
- hash_collision_count
- hash_verification_latency_ms

### Tamper Detection
- tamper_detection_rate_percent
- tamper_attempts_detected
- tamper_attempts_total
- false_positives
- false_negatives
- tamper_detection_false_positive_rate_percent
- tamper_detection_false_negative_rate_percent
- tamper_detection_accuracy_percent

### Signature Verification
- signature_verification_success_rate_percent
- signature_verification_failures
- signature_verification_total_attempts
- invalid_signature_count
- forged_signature_attempts_detected
- signature_verification_latency_ms

### Data Integrity
- crc_check_success_rate_percent
- crc_failures
- data_corruption_detected_count
- data_corruption_rate_percent

---

## 6. POWER & RESOURCE METRICS (ESP32)

### Current & Voltage
- current_consumption_ma
- current_p50_ma
- current_p95_ma
- current_p99_ma
- current_min_ma
- current_max_ma
- current_mean_ma
- current_stdev_ma
- voltage_v
- voltage_min_v
- voltage_max_v
- voltage_mean_v

### Power Consumption
- power_consumption_mw
- power_p50_mw
- power_p95_mw
- power_p99_mw
- power_min_mw
- power_max_mw
- power_mean_mw
- power_stdev_mw
- power_per_frame_mwh
- power_per_request_mwh

### Power Per Stage
- capture_power_consumption_mw
- compression_power_consumption_mw
- hashing_power_consumption_mw
- encryption_power_consumption_mw
- signing_power_consumption_mw
- transmission_power_consumption_mw

### Battery/Energy
- battery_voltage_v
- battery_percentage_percent
- estimated_battery_life_hours
- energy_consumed_mah
- energy_per_frame_mah
- energy_per_request_mah

### CPU Usage
- cpu_utilization_percent
- cpu_utilization_p50_percent
- cpu_utilization_p95_percent
- cpu_utilization_p99_percent
- cpu_utilization_min_percent
- cpu_utilization_max_percent
- cpu_utilization_mean_percent

### Memory Usage
- ram_usage_bytes
- ram_usage_percent
- ram_free_bytes
- ram_peak_usage_bytes
- flash_usage_bytes
- flash_usage_percent
- flash_free_bytes
- heap_fragmentation_percent
- stack_usage_bytes

### Temperature
- esp32_temperature_c
- esp32_temp_p50_c
- esp32_temp_p95_c
- esp32_temp_max_c
- esp32_temp_min_c
- atecc608a_temperature_c
- temperature_throttling_events

---

## 7. STORAGE METRICS (BACKEND)

### Data Size
- data_size_per_record_bytes
- image_size_bytes
- compressed_image_size_bytes
- hash_size_bytes
- signature_size_bytes
- metadata_size_bytes
- total_record_size_bytes

### Database Growth
- database_size_mb
- database_size_gb
- database_growth_rate_mb_per_hour
- database_growth_rate_mb_per_day
- database_growth_rate_percent_per_day
- storage_used_percent
- storage_available_gb

### Write Performance
- database_write_latency_ms
- database_write_p50_ms
- database_write_p95_ms
- database_write_p99_ms
- database_write_min_ms
- database_write_max_ms
- database_write_mean_ms
- database_write_stdev_ms
- records_written_per_second
- writes_per_hour
- writes_per_day

### Backup & Archive
- backup_size_gb
- backup_frequency_hours
- archive_size_gb
- retention_days
- purge_rate_records_per_hour

---

## 8. RELIABILITY METRICS

### Uptime
- system_uptime_percent
- system_downtime_percent
- mean_time_between_failures_hours
- mean_time_to_recovery_minutes
- availability_percent

### Failures
- failure_rate_percent
- total_failures
- total_attempts
- failure_per_hour
- failure_per_day
- unrecoverable_failure_count
- recoverable_failure_count

### Recovery
- recovery_time_minutes
- recovery_time_min_minutes
- recovery_time_max_minutes
- recovery_time_mean_minutes
- recovery_success_rate_percent
- automatic_recovery_rate_percent

### Transmission Success
- successful_transmission_rate_percent
- failed_transmission_count
- total_transmission_attempts
- transmission_success_per_hour
- transmission_failures_per_hour

### System Health
- error_rate_percent
- warning_rate_percent
- critical_error_count
- non_critical_error_count
- system_health_score_percent

---

## 9. SCALABILITY METRICS

### Load Performance
- latency_at_1_request_per_second_ms
- latency_at_10_requests_per_second_ms
- latency_at_50_requests_per_second_ms
- latency_at_100_requests_per_second_ms
- latency_at_peak_load_ms
- latency_degradation_percent_vs_baseline

### Throughput Under Load
- throughput_at_1_request_baseline_rps
- throughput_at_10_requests_per_second_rps
- throughput_at_50_requests_per_second_rps
- throughput_at_100_requests_per_second_rps
- throughput_degradation_percent_at_peak

### Resource Utilization Under Load
- cpu_utilization_at_peak_load_percent
- memory_utilization_at_peak_load_percent
- network_utilization_at_peak_load_percent
- database_utilization_at_peak_load_percent

### Concurrency
- max_concurrent_operations
- max_sustained_concurrent_operations
- queue_depth_at_peak
- request_queuing_latency_ms

---

## 10. TIMESTAMP & SYNCHRONIZATION METRICS

### RTC Accuracy (DS3231)
- rtc_timestamp_accuracy_ms
- rtc_drift_ppm
- rtc_frequency_stability_ppm
- rtc_absolute_error_seconds
- rtc_relative_error_percent

### Clock Drift
- clock_drift_seconds_per_day
- clock_drift_rate_ppm
- cumulative_clock_drift_seconds
- ntp_sync_error_ms
- ntp_sync_frequency_hours

### Timestamp Synchronization
- timestamp_mismatch_count
- timestamp_mismatch_rate_percent
- device_to_server_time_difference_ms
- max_time_difference_ms
- mean_time_difference_ms
- timestamp_outliers_count

### Synchronization Quality
- ntp_server_response_time_ms
- ntp_sync_success_rate_percent
- time_sync_failures
- resynchronization_frequency_hours
- time_correction_latency_ms

---

## AGGREGATED METRICS

### Overall Performance Score
- pipeline_performance_score_0_to_100
- security_score_0_to_100
- reliability_score_0_to_100
- efficiency_score_0_to_100

### Composite Indices
- crypto_efficiency_hashes_per_mw
- network_efficiency_mbps_per_ma
- storage_efficiency_records_per_gb
- power_efficiency_frames_per_mah

### Compliance Metrics
- security_compliance_percent
- sla_compliance_percent
- performance_sla_met_percent
- reliability_sla_met_percent
