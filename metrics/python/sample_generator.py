#!/usr/bin/env python3
"""
Generate realistic sample metrics data for ENIGMA performance analysis.

Creates 100-500 pipeline runs with realistic variations:
- Normal operation (60%)
- Network delays (20%)
- Validation failures (10%)
- Retries (10%)

Usage:
  python sample_generator.py --runs 200 --output ../data/sample_metrics.json
"""

import json
import random
import sys
from datetime import datetime
from pathlib import Path

def generate_sample_run(run_id, sequence):
    """Generate a single realistic metrics data point."""
    
    # Determine run category (60% normal, 20% network_delay, 10% fail, 10% retry)
    category = random.choices(
        ['normal', 'network_delay', 'fail', 'retry'],
        weights=[60, 20, 10, 10],
        k=1
    )[0]
    
    # Base timings (normal case)
    fw_encrypt = random.randint(15, 40)  # AES encryption: 15-40ms
    fw_hash = random.randint(5, 15)      # SHA-256: 5-15ms
    fw_serialize = random.randint(1, 5)  # JSON encoding: 1-5ms
    fw_total = fw_encrypt + fw_hash + fw_serialize
    
    payload_bytes = random.choice([32, 48, 64])  # Common entropy sizes
    encrypted_bytes = payload_bytes + 16  # AES CBC adds one block
    
    # Signature verification and DB insert
    backend_validation = random.randint(3, 10)
    backend_sig_verify = random.randint(8, 15)
    backend_db_insert = random.randint(10, 30)
    backend_total = backend_validation + backend_sig_verify + backend_db_insert
    
    # Network timing
    uart_latency = random.randint(10, 50)
    http_base = random.randint(30, 80)
    retries = 0
    
    # Apply category variations
    if category == 'network_delay':
        # Add 100-300ms extra network delay
        extra_delay = random.randint(100, 300)
        http_base += extra_delay
    elif category == 'retry':
        # Add retry attempt (doubles network latency)
        http_base = http_base * 2
        retries = 1
    
    network_latency = uart_latency + http_base
    
    # Determine status based on category
    if category == 'fail':
        # Random failure
        failure_reasons = ['invalid_signature', 'replay_detected', 'timestamp_stale']
        status = random.choice(failure_reasons)
        error_code = status
    else:
        status = 'success'
        error_code = None
    
    # Power consumption (simulated)
    # Crypto ops draw more current
    base_current = 80  # mA baseline
    encrypt_current = random.randint(100, 130)
    hash_current = random.randint(80, 110)
    sign_current = 0  # Not implemented yet in firmware
    
    # Temperature (simulated, can vary with load)
    temperature = random.uniform(25, 35)
    
    # Compute total end-to-end latency
    total_e2e = fw_total + network_latency + backend_total
    
    # Create data point
    data_point = {
        'run_id': run_id,
        'device_id': f'esp32-{random.randint(1, 5):03d}',
        'sequence': sequence,
        'category': category,
        'firmware': {
            'capture_ms': 0,  # Already included in serialize
            'encrypt_ms': fw_encrypt,
            'hash_ms': fw_hash,
            'sign_ms': sign_current,
            'serialize_ms': fw_serialize,
            'total_ms': fw_total,
            'payload_bytes': payload_bytes,
            'encrypted_bytes': encrypted_bytes,
            'current_ma': encrypt_current,
            'temperature_c': round(temperature, 1),
        },
        'network': {
            'uart_latency_ms': uart_latency,
            'http_latency_ms': http_base,
            'total_latency_ms': network_latency,
            'retries': retries,
            'packet_loss': False,
        },
        'backend': {
            'validation_ms': backend_validation,
            'signature_verify_ms': backend_sig_verify,
            'db_insert_ms': backend_db_insert,
            'total_ms': backend_total,
            'status': status,
            'error_code': error_code,
        },
        'end_to_end_ms': total_e2e,
        'timestamp': int(datetime.now().timestamp()),
    }
    
    return data_point


def generate_samples(num_runs):
    """Generate num_runs sample data points."""
    samples = []
    for i in range(num_runs):
        run_id = f'run-{i+1:03d}'
        sample = generate_sample_run(run_id, i + 1)
        samples.append(sample)
    return samples


def main():
    import argparse
    
    parser = argparse.ArgumentParser(
        description='Generate realistic ENIGMA metrics sample data'
    )
    parser.add_argument(
        '--runs', type=int, default=200,
        help='Number of sample runs to generate (default: 200)'
    )
    parser.add_argument(
        '--output', type=str, default='../data/sample_metrics.json',
        help='Output JSON file path (default: ../data/sample_metrics.json)'
    )
    parser.add_argument(
        '--seed', type=int, default=None,
        help='Random seed for reproducibility'
    )
    
    args = parser.parse_args()
    
    if args.seed is not None:
        random.seed(args.seed)
    
    print(f'Generating {args.runs} sample metrics runs...')
    samples = generate_samples(args.runs)
    
    # Create output directory if needed
    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    
    # Write JSON
    with open(output_path, 'w') as f:
        json.dump(samples, f, indent=2)
    
    print(f'✓ Wrote {len(samples)} samples to {output_path}')
    
    # Print summary
    successful = [s for s in samples if s['backend']['status'] == 'success']
    failed = [s for s in samples if s['backend']['status'] != 'success']
    
    total_e2e = [s['end_to_end_ms'] for s in successful]
    
    print(f'\nSummary:')
    print(f'  Total runs: {len(samples)}')
    print(f'  Successful: {len(successful)} ({len(successful)/len(samples)*100:.1f}%)')
    print(f'  Failed: {len(failed)} ({len(failed)/len(samples)*100:.1f}%)')
    print(f'  Median E2E latency: {sorted(total_e2e)[len(total_e2e)//2]:.0f}ms')
    print(f'  P95 E2E latency: {sorted(total_e2e)[int(len(total_e2e)*0.95)]:.0f}ms')
    print(f'  P99 E2E latency: {sorted(total_e2e)[int(len(total_e2e)*0.99)]:.0f}ms')
    print(f'  Max E2E latency: {max(total_e2e):.0f}ms')
    

if __name__ == '__main__':
    main()
