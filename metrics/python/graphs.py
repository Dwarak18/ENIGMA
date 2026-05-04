#!/usr/bin/env python3
"""
Generate performance visualization graphs for ENIGMA metrics data.

Creates 7 matplotlib graphs:
1. Latency Breakdown (stacked bar)
2. Throughput Over Time (line)
3. Crypto Overhead (pie)
4. Network Reliability (bar)
5. Power Consumption (line)
6. Storage Growth (line)
7. Latency Distribution (histogram)

Usage:
  python graphs.py --input ../data/sample_metrics.json --output ../graphs/
"""

import json
import statistics
import sys
from pathlib import Path
from datetime import datetime

import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
import numpy as np


def load_metrics(filepath):
    """Load metrics JSON file."""
    with open(filepath) as f:
        return json.load(f)


def graph_latency_breakdown(data, output_dir):
    """
    Create stacked bar chart showing latency breakdown by stage.
    
    Stages: Firmware -> Network -> Backend
    """
    stages = ['firmware', 'network', 'backend']
    stage_data = {}
    
    for stage in stages:
        if stage == 'firmware':
            stage_data[stage] = [d['firmware']['total_ms'] for d in data]
        elif stage == 'network':
            stage_data[stage] = [d['network']['total_latency_ms'] for d in data]
        else:  # backend
            stage_data[stage] = [d['backend']['total_ms'] for d in data]
    
    # Calculate averages
    avg_fw = statistics.mean(stage_data['firmware'])
    avg_net = statistics.mean(stage_data['network'])
    avg_be = statistics.mean(stage_data['backend'])
    
    fig, ax = plt.subplots(figsize=(10, 6))
    
    x = np.arange(1)
    width = 0.5
    
    # Use a colormap for consistent colors
    colors = plt.cm.Set2(np.linspace(0, 1, 3))
    
    ax.bar(x, avg_fw, width, label='Firmware', color=colors[0])
    ax.bar(x, avg_net, width, bottom=avg_fw, label='Network', color=colors[1])
    ax.bar(x, avg_be, width, bottom=avg_fw+avg_net, label='Backend', color=colors[2])
    
    ax.set_ylabel('Latency (ms)')
    ax.set_title('Average Latency Breakdown by Stage', fontsize=14, fontweight='bold')
    ax.set_xticks(x)
    ax.set_xticklabels(['E2E Latency'])
    ax.legend(loc='upper right')
    ax.grid(axis='y', alpha=0.3)
    
    # Add value labels on bars
    ax.text(0, avg_fw/2, f'{avg_fw:.0f}ms', ha='center', va='center', fontweight='bold')
    ax.text(0, avg_fw + avg_net/2, f'{avg_net:.0f}ms', ha='center', va='center', fontweight='bold')
    ax.text(0, avg_fw + avg_net + avg_be/2, f'{avg_be:.0f}ms', ha='center', va='center', fontweight='bold')
    
    plt.tight_layout()
    plt.savefig(output_dir / 'latency_breakdown.png', dpi=150)
    print('✓ Generated latency_breakdown.png')
    plt.close()


def graph_throughput(data, output_dir):
    """
    Create line graph showing throughput (requests/sec) over time.
    """
    timestamps = [d['timestamp'] for d in data]
    min_ts = min(timestamps)
    
    # Bin data into 10-second windows
    window_size = 10  # seconds
    windows = {}
    
    for d in data:
        window_idx = (d['timestamp'] - min_ts) // window_size
        if window_idx not in windows:
            windows[window_idx] = {'total': 0, 'success': 0}
        windows[window_idx]['total'] += 1
        if d['backend']['status'] == 'success':
            windows[window_idx]['success'] += 1
    
    # Convert to arrays
    window_indices = sorted(windows.keys())
    throughputs = [windows[w]['total'] / window_size for w in window_indices]
    success_rates = [windows[w]['success'] / windows[w]['total'] * 100 for w in window_indices]
    
    fig, ax1 = plt.subplots(figsize=(12, 6))
    
    x_pos = range(len(window_indices))
    
    # Throughput line
    color = plt.cm.Set2(0)
    ax1.plot(x_pos, throughputs, marker='o', color=color, linewidth=2, label='Throughput')
    ax1.set_xlabel('Time Window (10s)')
    ax1.set_ylabel('Requests/second', color=color)
    ax1.tick_params(axis='y', labelcolor=color)
    ax1.grid(alpha=0.3)
    
    # Success rate on secondary axis
    ax2 = ax1.twinx()
    color = plt.cm.Set2(1)
    ax2.plot(x_pos, success_rates, marker='s', color=color, linewidth=2, label='Success Rate')
    ax2.set_ylabel('Success Rate (%)', color=color)
    ax2.tick_params(axis='y', labelcolor=color)
    ax2.set_ylim([0, 105])
    
    ax1.set_title('Throughput and Success Rate Over Time', fontsize=14, fontweight='bold')
    
    # Combined legend
    lines1, labels1 = ax1.get_legend_handles_labels()
    lines2, labels2 = ax2.get_legend_handles_labels()
    ax1.legend(lines1 + lines2, labels1 + labels2, loc='lower left')
    
    plt.tight_layout()
    plt.savefig(output_dir / 'throughput.png', dpi=150)
    print('✓ Generated throughput.png')
    plt.close()


def graph_crypto_overhead(data, output_dir):
    """
    Create pie chart showing cryptographic overhead as percentage of total latency.
    """
    successful = [d for d in data if d['backend']['status'] == 'success']
    
    if not successful:
        print('⚠ No successful runs; skipping crypto overhead graph')
        return
    
    # Average times
    avg_encrypt = statistics.mean(d['firmware']['encrypt_ms'] for d in successful)
    avg_hash = statistics.mean(d['firmware']['hash_ms'] for d in successful)
    avg_sig = statistics.mean(d['backend']['signature_verify_ms'] for d in successful)
    avg_validation = statistics.mean(d['backend']['validation_ms'] for d in successful)
    avg_db = statistics.mean(d['backend']['db_insert_ms'] for d in successful)
    avg_network = statistics.mean(d['network']['total_latency_ms'] for d in successful)
    avg_other = statistics.mean(d['firmware']['serialize_ms'] for d in successful)
    
    labels = ['AES Encrypt', 'SHA-256 Hash', 'Signature Verify', 'Validation', 'DB Insert', 'Network', 'Other']
    sizes = [avg_encrypt, avg_hash, avg_sig, avg_validation, avg_db, avg_network, avg_other]
    
    # Use colormap
    colors = plt.cm.Set3(np.linspace(0, 1, len(labels)))
    
    fig, ax = plt.subplots(figsize=(10, 8))
    wedges, texts, autotexts = ax.pie(sizes, labels=labels, autopct='%1.1f%%',
                                        colors=colors, startangle=90)
    
    ax.set_title('Latency Contribution by Component', fontsize=14, fontweight='bold')
    
    # Improve text readability
    for autotext in autotexts:
        autotext.set_color('white')
        autotext.set_fontweight('bold')
        autotext.set_fontsize(9)
    
    plt.tight_layout()
    plt.savefig(output_dir / 'crypto_overhead.png', dpi=150)
    print('✓ Generated crypto_overhead.png')
    plt.close()


def graph_network_reliability(data, output_dir):
    """
    Create bar chart showing success vs failure by latency percentile.
    """
    # Sort by latency and split into quintiles
    sorted_data = sorted(data, key=lambda d: d['end_to_end_ms'])
    quintile_size = len(sorted_data) // 5
    
    quintiles = [
        sorted_data[i*quintile_size:(i+1)*quintile_size]
        for i in range(5)
    ]
    
    labels = ['0-20%', '20-40%', '40-60%', '60-80%', '80-100%']
    success_counts = []
    failure_counts = []
    
    for q in quintiles:
        success = sum(1 for d in q if d['backend']['status'] == 'success')
        failure = len(q) - success
        success_counts.append(success)
        failure_counts.append(failure)
    
    fig, ax = plt.subplots(figsize=(10, 6))
    
    x = np.arange(len(labels))
    width = 0.6
    
    colors_success = plt.cm.Set2(0)
    colors_failure = plt.cm.Set2(2)
    
    ax.bar(x, success_counts, width, label='Success', color=colors_success)
    ax.bar(x, failure_counts, width, bottom=success_counts, label='Failed', color=colors_failure)
    
    ax.set_ylabel('Request Count')
    ax.set_xlabel('Latency Percentile')
    ax.set_title('Request Success Rate by Latency Percentile', fontsize=14, fontweight='bold')
    ax.set_xticks(x)
    ax.set_xticklabels(labels)
    ax.legend()
    ax.grid(axis='y', alpha=0.3)
    
    plt.tight_layout()
    plt.savefig(output_dir / 'network_reliability.png', dpi=150)
    print('✓ Generated network_reliability.png')
    plt.close()


def graph_power_consumption(data, output_dir):
    """
    Create line graph showing simulated power consumption over time.
    """
    # Extract current measurements
    indices = range(len(data))
    currents = [d['firmware']['current_ma'] for d in data]
    
    fig, ax = plt.subplots(figsize=(12, 6))
    
    color = plt.cm.Set2(0)
    ax.plot(indices, currents, color=color, linewidth=1.5, alpha=0.7)
    
    # Add rolling average
    window = 10
    rolling_avg = [statistics.mean(currents[max(0, i-window):i+1]) for i in range(len(currents))]
    ax.plot(indices, rolling_avg, color=plt.cm.Set2(1), linewidth=2, label=f'{window}-point rolling avg')
    
    # Add threshold lines
    ax.axhline(y=120, color='orange', linestyle='--', alpha=0.5, label='Warning (120mA)')
    ax.axhline(y=150, color='red', linestyle='--', alpha=0.5, label='Critical (150mA)')
    
    ax.set_xlabel('Request Sequence')
    ax.set_ylabel('Current (mA)')
    ax.set_title('Simulated Power Consumption Over Time', fontsize=14, fontweight='bold')
    ax.legend()
    ax.grid(alpha=0.3)
    
    plt.tight_layout()
    plt.savefig(output_dir / 'power_consumption.png', dpi=150)
    print('✓ Generated power_consumption.png')
    plt.close()


def graph_storage_growth(data, output_dir):
    """
    Create line graph showing simulated storage growth over time.
    
    Assuming ~5.5KB per record.
    """
    avg_record_size = 5.5  # KB
    indices = range(1, len(data) + 1)
    
    # Cumulative storage (KB)
    storage_kb = [i * avg_record_size for i in indices]
    storage_mb = [s / 1024 for s in storage_kb]
    
    fig, ax = plt.subplots(figsize=(12, 6))
    
    color = plt.cm.Set2(0)
    ax.plot(indices, storage_mb, color=color, linewidth=2)
    ax.fill_between(indices, storage_mb, alpha=0.3, color=color)
    
    # Add linear regression
    z = np.polyfit(indices, storage_mb, 1)
    p = np.poly1d(z)
    ax.plot(indices, p(indices), color=plt.cm.Set2(1), linestyle='--', linewidth=2, label='Trend')
    
    # Growth rate
    growth_rate = (storage_mb[-1] - storage_mb[0]) / len(data) * 3600  # MB per hour (if 1 req/sec)
    
    ax.set_xlabel('Request Sequence')
    ax.set_ylabel('Cumulative Storage (MB)')
    ax.set_title(f'Storage Growth Over Time (Growth rate: {growth_rate:.2f} MB/hour)', 
                 fontsize=14, fontweight='bold')
    ax.legend()
    ax.grid(alpha=0.3)
    
    plt.tight_layout()
    plt.savefig(output_dir / 'storage_growth.png', dpi=150)
    print('✓ Generated storage_growth.png')
    plt.close()


def graph_latency_distribution(data, output_dir):
    """
    Create histogram showing latency distribution with percentile markers.
    """
    latencies = [d['end_to_end_ms'] for d in data]
    
    fig, ax = plt.subplots(figsize=(10, 6))
    
    # Bins - ensure monotonic increase
    max_latency = max(latencies)
    bins = [0, 50, 100, 150, 200, 300, 500, 1000]
    bins = [b for b in bins if b <= max_latency]
    if bins[-1] < max_latency:
        bins.append(int(max_latency) + 10)
    
    bin_labels = ['<50ms', '50-100ms', '100-150ms', '150-200ms', '200-300ms', '300-500ms', '500-1s', '>1s'][:len(bins)-1]
    
    counts, edges, patches = ax.hist(latencies, bins=bins, edgecolor='black', alpha=0.7)
    
    # Color bars by percentile
    colors = plt.cm.RdYlGn_r(np.linspace(0.2, 0.8, len(patches)))
    for patch, color in zip(patches, colors):
        patch.set_facecolor(color)
    
    # Add percentile lines
    p50 = np.percentile(latencies, 50)
    p95 = np.percentile(latencies, 95)
    p99 = np.percentile(latencies, 99)
    
    ax.axvline(p50, color='green', linestyle='--', linewidth=2, label=f'Median (p50): {p50:.0f}ms')
    ax.axvline(p95, color='orange', linestyle='--', linewidth=2, label=f'p95: {p95:.0f}ms')
    ax.axvline(p99, color='red', linestyle='--', linewidth=2, label=f'p99: {p99:.0f}ms')
    
    ax.set_xlabel('End-to-End Latency (ms)')
    ax.set_ylabel('Request Count')
    ax.set_title('Latency Distribution', fontsize=14, fontweight='bold')
    ax.set_xticklabels(bin_labels, rotation=45)
    ax.legend(loc='upper right')
    ax.grid(axis='y', alpha=0.3)
    
    plt.tight_layout()
    plt.savefig(output_dir / 'latency_distribution.png', dpi=150)
    print('✓ Generated latency_distribution.png')
    plt.close()


def main():
    import argparse
    
    parser = argparse.ArgumentParser(
        description='Generate performance visualization graphs from ENIGMA metrics'
    )
    parser.add_argument(
        '--input', type=str, required=True,
        help='Input JSON metrics file'
    )
    parser.add_argument(
        '--output', type=str, default='../graphs/',
        help='Output directory for graphs (default: ../graphs/)'
    )
    
    args = parser.parse_args()
    
    # Load metrics
    input_path = Path(args.input)
    if not input_path.exists():
        print(f'✗ Error: Input file not found: {input_path}')
        sys.exit(1)
    
    print(f'Loading metrics from {input_path}...')
    data = load_metrics(input_path)
    print(f'Loaded {len(data)} metrics records')
    
    # Create output directory
    output_dir = Path(args.output)
    output_dir.mkdir(parents=True, exist_ok=True)
    
    # Generate graphs
    print('\nGenerating graphs...')
    graph_latency_breakdown(data, output_dir)
    graph_throughput(data, output_dir)
    graph_crypto_overhead(data, output_dir)
    graph_network_reliability(data, output_dir)
    graph_power_consumption(data, output_dir)
    graph_storage_growth(data, output_dir)
    graph_latency_distribution(data, output_dir)
    
    print(f'\n✓ All graphs saved to {output_dir}')


if __name__ == '__main__':
    main()
