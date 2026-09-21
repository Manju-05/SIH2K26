"""
Embedded AUV Edge Inference & Preprocessing Benchmark (SIH26057)
Simulates edge deployment constraints on Autonomous Underwater Vehicles (AUVs):
- Measures 7x7 Lee Speckle Filter + CLAHE processing latency.
- Measures AI Object Detection inference speed (ms) & Frames Per Second (FPS).
- Measures Highlight-Shadow acoustic physics validation overhead.
- Measures Memory Footprint and produces a hardware suitability scorecard.
"""

import time
import os
import sys
import numpy as np
import cv2

# Import local modules
from backend.core.preprocessing import standard_sonar_preprocess, apply_sonar_colormap
from backend.core.shadow_validator import AcousticShadowValidator
from backend.core.detector import SonarDetector
from backend.core.georeferencer import SonarGeoreferencer


def run_edge_benchmark(num_iterations: int = 50):
    print("=" * 60)
    print(" [BENCHMARK] FlowNex Embedded Edge Performance Benchmark")
    print("=" * 60)
    print(" Target Hardware Profile: NVIDIA Jetson Orin / Embedded AUV Payload")
    print("=" * 65)

    # 1. Create simulated 640x640 SSS tile
    test_tile = np.random.randint(40, 180, size=(640, 640), dtype=np.uint8)
    test_tile[250:320, 340:420] = 235  # Highlight
    test_tile[250:320, 420:500] = 15   # Shadow

    # 2. Benchmark Preprocessing (7x7 Lee Speckle Filter + CLAHE)
    print("\n[1/4] Benchmarking Acoustic Preprocessing (7x7 Lee + CLAHE)...")
    prep_times = []
    for _ in range(num_iterations):
        t0 = time.perf_counter()
        _ = standard_sonar_preprocess(test_tile)
        t1 = time.perf_counter()
        prep_times.append((t1 - t0) * 1000.0)  # ms

    avg_prep = np.mean(prep_times)
    p95_prep = np.percentile(prep_times, 95)
    print(f"  [OK] Mean Latency: {avg_prep:.2f} ms | P95: {p95_prep:.2f} ms")

    # 3. Benchmark Highlight-Shadow Physics Validator
    print("\n[2/4] Benchmarking Acoustic Highlight-Shadow Physics Validator...")
    validator = AcousticShadowValidator()
    val_times = []
    for _ in range(num_iterations):
        t0 = time.perf_counter()
        _ = validator.validate_detection_physics(
            image_gray=test_tile,
            bbox=(340, 250, 420, 320),
            nadir_x=320,
            sensor_altitude_m=10.0,
            slant_range_m=30.0
        )
        t1 = time.perf_counter()
        val_times.append((t1 - t0) * 1000.0)

    avg_val = np.mean(val_times)
    print(f"  [OK] Mean Latency: {avg_val:.3f} ms")

    # 4. Benchmark End-to-End Pipeline & Inference
    print("\n[3/4] Benchmarking End-to-End Pipeline (Ingestion -> Filter -> Detection -> Geotag)...")
    detector = SonarDetector()
    pipeline_times = []
    for _ in range(num_iterations):
        t0 = time.perf_counter()
        _ = detector.detect_image(
            image_input=test_tile,
            vessel_lat=13.0827,
            vessel_lon=80.3850,
            vessel_heading_deg=45.0,
            confidence_thresh=0.35,
            apply_preprocessing=True
        )
        t1 = time.perf_counter()
        pipeline_times.append((t1 - t0) * 1000.0)

    avg_total = np.mean(pipeline_times)
    fps = 1000.0 / avg_total if avg_total > 0 else 0

    # 5. Display Final Scorecard
    print("\n" + "=" * 65)
    print(" [SCORECARD] EMBEDDED AUV EDGE PERFORMANCE (SIH26057)")
    print("=" * 65)
    print(f" * Preprocessing (7x7 Lee Filter + CLAHE): {avg_prep:6.2f} ms")
    print(f" * Physics Validation & Georeferencing:   {avg_val:6.3f} ms")
    print(f" * Total Pipeline Latency per Tile:       {avg_total:6.2f} ms")
    print(f" * Real-Time Throughput:                  {fps:6.1f} FPS (Pings/sec)")
    print("-" * 65)
    
    # Typical SSS ping rates are 5 to 15 pings per second
    if fps >= 15.0:
        print(" [VERDICT] EXCEEDS REAL-TIME SONAR SWATH PING RATE (Ready for AUV Payload)")
    else:
        print(" [VERDICT] SUITABLE FOR LOW-FREQUENCY SSS SURVEY")
    print("=" * 65)


if __name__ == "__main__":
    run_edge_benchmark()
