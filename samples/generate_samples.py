"""
FlowNex Sonar Test Data & CSV Generator
Ministry of Earth Sciences (MoES) / NIOT - SIH26057

This script generates:
1. Standardized Side-Scan Sonar (SSS) test images (.jpg) for 5 distinct seafloor scenarios.
2. Hydrographic survey navigation ping stream CSV files (AUV telemetry) for mission playback and ingestion.
3. Official SIH26057 structured debris detection target report CSV files for GIS and recovery vessel operations.
4. Ground-truth test benchmark index CSV for automated evaluation.
5. Live inference detection results CSV produced by running the FlowNex AI detector.
"""

import os
import sys
import csv
import io
import math
from datetime import datetime, timezone, timedelta
import cv2
import numpy as np

# Ensure project root is in path
CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(CURRENT_DIR)
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from backend.core.detector import SonarDetector
from backend.core.report_generator import ReportGenerator
from backend.core.parser_xtf import SonarLogParser


def create_realistic_sonar_swath(sample_type: str, seed: int = 42) -> np.ndarray:
    """
    Generates a realistic 640x640 Side-Scan Sonar (SSS) acoustic image tile with:
    - Seafloor reverberation & sand ripples
    - Multiplicative speckle noise (Rayleigh/exponential)
    - Central nadir blind zone (AUV flight track)
    - Target acoustic backscatter highlight and physics-compliant acoustic shadow
    """
    np.random.seed(seed)
    h, w = 640, 640
    y_coords, x_coords = np.mgrid[0:h, 0:w]

    # Geological sand ripples and background ambient reverberation
    ripples = np.sin(x_coords / 9.0 + np.sin(y_coords / 22.0)) * 16.0
    speckle = np.random.exponential(scale=18.0, size=(h, w))
    seabed = np.clip(68.0 + ripples + speckle, 0, 255).astype(np.uint8)

    # Center nadir acoustic blind track (port/starboard channel separation)
    mid = w // 2
    seabed[:, mid - 4: mid + 4] = np.random.randint(12, 28, size=(h, 8))

    # Inject acoustic anomalies based on class physics
    if sample_type == "shipwreck":
        # Sunken wooden/metallic hull highlight (high acoustic impedance)
        cv2.rectangle(seabed, (360, 250), (450, 340), 238, -1)
        cv2.circle(seabed, (405, 295), 25, 255, -1)
        # Acoustic shadow extending starboard away from nadir
        cv2.rectangle(seabed, (450, 250), (550, 340), 10, -1)

    elif sample_type == "ghost_net":
        # Discarded gillnet mesh / rope cluster with irregular acoustic backscatter
        cv2.ellipse(seabed, (230, 290), (50, 32), 25, 0, 360, 225, -1)
        cv2.ellipse(seabed, (250, 310), (35, 22), -15, 0, 360, 235, -1)
        # Trailing acoustic shadow cast toward port side (away from nadir)
        cv2.ellipse(seabed, (155, 290), (40, 28), 25, 0, 360, 12, -1)

    elif sample_type == "submarine_pipeline":
        # Continuous cylindrical seabed pipeline running along-track
        cv2.line(seabed, (375, 50), (415, 590), 242, 14)
        # Pipeline cast shadow directly adjacent (starboard)
        cv2.line(seabed, (415, 50), (465, 590), 12, 18)

    elif sample_type == "mine_cylinder":
        # Anthropogenic metallic cylinder / unexploded ordnance (UXO)
        cv2.circle(seabed, (255, 225), 22, 248, -1)
        cv2.rectangle(seabed, (245, 215), (265, 235), 255, -1)
        # Acoustic shadow cast away from nadir line toward port
        cv2.ellipse(seabed, (200, 225), (32, 16), 0, 0, 360, 8, -1)

    elif sample_type == "clean_seabed":
        # Pure natural seabed with geological sand ripples; no artificial debris
        pass

    return seabed


def generate_sample_nav_pings_csv(filepath: str, num_pings: int = 500):
    """
    Generates realistic AUV hydrographic navigation pings CSV stream.
    Compatible with SonarLogParser.parse_csv_ping_stream().
    """
    start_time = datetime(2026, 9, 21, 10, 0, 0, tzinfo=timezone.utc)
    base_lat = 13.082700   # Bay of Bengal Deep-Sea Marine Shelf (Offshore Chennai)
    base_lon = 80.385000
    heading = 45.0          # North-East transect heading
    speed_knots = 3.5
    speed_m_s = speed_knots * 0.514444
    dt = 0.1                # 10 Hz ping rate (100 ms interval)
    earth_r = 6378137.0
    heading_rad = math.radians(heading)

    curr_lat = base_lat
    curr_lon = base_lon

    with open(filepath, "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow([
            "ping_id", "timestamp", "latitude", "longitude",
            "heading", "altitude_m", "speed_knots"
        ])

        for i in range(num_pings):
            # Advance AUV dead-reckoning position
            d_north = speed_m_s * dt * math.cos(heading_rad)
            d_east = speed_m_s * dt * math.sin(heading_rad)
            curr_lat += (d_north / earth_r) * (180.0 / math.pi)
            curr_lon += (d_east / (earth_r * math.cos(math.radians(curr_lat)))) * (180.0 / math.pi)

            # Realistic micro-variations in vehicle altitude and speed
            altitude = round(10.0 + 0.35 * math.sin(i / 25.0) + np.random.normal(0, 0.05), 2)
            speed = round(speed_knots + 0.1 * math.sin(i / 40.0), 2)
            ping_heading = round((heading + 0.8 * math.sin(i / 30.0)) % 360.0, 2)
            t_stamp = (start_time + timedelta(seconds=i * dt)).isoformat()

            writer.writerow([
                i + 1,
                t_stamp,
                f"{curr_lat:.6f}",
                f"{curr_lon:.6f}",
                f"{ping_heading:.2f}",
                f"{altitude:.2f}",
                f"{speed:.2f}"
            ])

    print(f"[OK] Generated Navigation Pings CSV ({num_pings} pings): {filepath}")


def generate_multi_track_mission_csv(filepath: str, num_pings: int = 1200):
    """
    Generates a multi-leg AUV lawnmower survey mission CSV log
    simulating a multi-kilometer hydrographic survey with course turns.
    """
    start_time = datetime(2026, 9, 21, 14, 0, 0, tzinfo=timezone.utc)
    curr_lat = 13.082700  # Chennai Harbor approach
    curr_lon = 80.270700
    speed_knots = 3.8
    speed_m_s = speed_knots * 0.514444
    dt = 0.1
    earth_r = 6378137.0

    legs = [
        {"pings": 400, "heading": 90.0},    # Leg 1: Eastward
        {"pings": 400, "heading": 180.0},   # Leg 2: Southward
        {"pings": 400, "heading": 270.0}    # Leg 3: Westward return
    ]

    with open(filepath, "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow([
            "ping_id", "timestamp", "latitude", "longitude",
            "heading", "altitude_m", "speed_knots"
        ])

        global_idx = 1
        for leg in legs:
            heading = leg["heading"]
            heading_rad = math.radians(heading)
            for _ in range(leg["pings"]):
                d_north = speed_m_s * dt * math.cos(heading_rad)
                d_east = speed_m_s * dt * math.sin(heading_rad)
                curr_lat += (d_north / earth_r) * (180.0 / math.pi)
                curr_lon += (d_east / (earth_r * math.cos(math.radians(curr_lat)))) * (180.0 / math.pi)

                altitude = round(12.0 + 0.25 * math.sin(global_idx / 20.0), 2)
                t_stamp = (start_time + timedelta(seconds=global_idx * dt)).isoformat()

                writer.writerow([
                    global_idx,
                    t_stamp,
                    f"{curr_lat:.6f}",
                    f"{curr_lon:.6f}",
                    f"{heading:.1f}",
                    f"{altitude:.2f}",
                    f"{speed_knots:.2f}"
                ])
                global_idx += 1

    print(f"[OK] Generated Multi-Track Survey Mission CSV ({num_pings} pings): {filepath}")


def generate_debris_targets_report_csv(filepath: str):
    """
    Generates standardized target CSV report matching SIH26057 & ReportGenerator.to_csv_string().
    Suitable for offshore cleanup vessels and GIS mapping.
    """
    sample_detections_payload = {
        "survey_name": "NIOT_MoES_Offshore_Debris_Survey_Track_01",
        "detections": [
            {
                "id": 1,
                "class_name": "shipwreck",
                "confidence": 0.94,
                "confidence_percent": "94%",
                "coordinates": {
                    "latitude": 13.082686,
                    "longitude": 80.385040,
                    "cross_track_offset_m": 4.15,
                    "along_track_offset_m": 2.00
                },
                "dimensions": {
                    "length_m": 7.44,
                    "width_m": 4.65,
                    "estimated_height_m": 1.88,
                    "estimated_area_m2": 34.60
                },
                "acoustic_physics": {
                    "has_shadow": True,
                    "shadow_length_px": 139
                }
            },
            {
                "id": 2,
                "class_name": "ghost_net",
                "confidence": 0.96,
                "confidence_percent": "96%",
                "coordinates": {
                    "latitude": 13.082740,
                    "longitude": 80.384986,
                    "cross_track_offset_m": -4.20,
                    "along_track_offset_m": 2.08
                },
                "dimensions": {
                    "length_m": 6.64,
                    "width_m": 5.35,
                    "estimated_height_m": 2.11,
                    "estimated_area_m2": 35.52
                },
                "acoustic_physics": {
                    "has_shadow": True,
                    "shadow_length_px": 160
                }
            },
            {
                "id": 3,
                "class_name": "submarine_pipeline",
                "confidence": 0.91,
                "confidence_percent": "91%",
                "coordinates": {
                    "latitude": 13.082676,
                    "longitude": 80.385024,
                    "cross_track_offset_m": 3.75,
                    "along_track_offset_m": -0.08
                },
                "dimensions": {
                    "length_m": 44.56,
                    "width_m": 2.85,
                    "estimated_height_m": 1.24,
                    "estimated_area_m2": 126.99
                },
                "acoustic_physics": {
                    "has_shadow": True,
                    "shadow_length_px": 85
                }
            },
            {
                "id": 4,
                "class_name": "mine_cylinder",
                "confidence": 0.96,
                "confidence_percent": "96%",
                "coordinates": {
                    "latitude": 13.082769,
                    "longitude": 80.385029,
                    "cross_track_offset_m": -3.25,
                    "along_track_offset_m": 7.68
                },
                "dimensions": {
                    "length_m": 4.08,
                    "width_m": 2.25,
                    "estimated_height_m": 1.00,
                    "estimated_area_m2": 9.18
                },
                "acoustic_physics": {
                    "has_shadow": True,
                    "shadow_length_px": 67
                }
            }
        ]
    }

    csv_text = ReportGenerator.to_csv_string(sample_detections_payload)
    with open(filepath, "w", newline="", encoding="utf-8") as f:
        f.write(csv_text)

    print(f"[OK] Generated Debris Targets Report CSV: {filepath}")


def generate_benchmark_index_csv(filepath: str, sample_records: list):
    """
    Generates benchmark test index CSV linking sample images to ground-truth labels and coordinates.
    """
    headers = [
        "sample_id", "image_filename", "sample_type", "hazard_present",
        "ground_truth_class", "target_strength", "bbox_x1", "bbox_y1", "bbox_x2", "bbox_y2",
        "simulated_lat", "simulated_lon", "survey_heading_deg", "description"
    ]
    with open(filepath, "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(headers)
        for row in sample_records:
            writer.writerow(row)

    print(f"[OK] Generated Test Benchmark Index CSV: {filepath}")


def run_inference_and_export_csv(images_dir: str, output_csv: str, detector: SonarDetector):
    """
    Runs actual AI model inference on the generated test samples and saves real detections to CSV.
    """
    rows = []
    headers = [
        "Sample Image", "Detections Count", "Target ID", "Class Name",
        "Calibrated Confidence", "BBox (x1 y1 x2 y2)",
        "Latitude", "Longitude", "Cross-Track Offset (m)", "Along-Track Offset (m)",
        "Length (m)", "Width (m)", "Est Height (m)", "Shadow Verified"
    ]

    for fname in sorted(os.listdir(images_dir)):
        if not fname.lower().endswith((".jpg", ".png", ".jpeg")):
            continue
        img_path = os.path.join(images_dir, fname)
        img = cv2.imread(img_path)
        if img is None:
            continue

        res = detector.detect_image(
            image_input=img,
            vessel_lat=13.0827,
            vessel_lon=80.3850,
            vessel_heading_deg=45.0,
            confidence_thresh=0.15,
            apply_preprocessing=True
        )

        detections = res.get("detections", [])
        if len(detections) == 0:
            rows.append([
                fname, 0, "N/A", "clean_background",
                "0%", "[]",
                13.0827, 80.3850, 0.0, 0.0,
                0.0, 0.0, 0.0, "NO"
            ])
        else:
            for det in detections:
                coords = det.get("coordinates", {})
                dims = det.get("dimensions", {})
                physics = det.get("acoustic_physics", {})
                box_str = f"[{det['bbox'][0]}, {det['bbox'][1]}, {det['bbox'][2]}, {det['bbox'][3]}]"

                rows.append([
                    fname,
                    len(detections),
                    det.get("id", 1),
                    det.get("class_name", "debris_anomaly"),
                    det.get("confidence_percent", "0%"),
                    box_str,
                    coords.get("latitude", 13.0827),
                    coords.get("longitude", 80.3850),
                    coords.get("cross_track_offset_m", 0.0),
                    coords.get("along_track_offset_m", 0.0),
                    dims.get("length_m", 0.0),
                    dims.get("width_m", 0.0),
                    dims.get("estimated_height_m", 0.0),
                    "YES" if physics.get("has_shadow", False) else "NO"
                ])

    with open(output_csv, "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(headers)
        for r in rows:
            writer.writerow(r)

    print(f"[OK] Generated Test Inference Detections CSV: {output_csv}")


def main():
    # Ensure stdout handles utf-8 safely on Windows
    if sys.platform == "win32":
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")

    samples_dir = os.path.join(PROJECT_ROOT, "samples")
    images_dir = os.path.join(samples_dir, "images")
    os.makedirs(images_dir, exist_ok=True)

    print("==================================================================")
    print("[*] FlowNex: Generating Sonar Test Samples & CSV Datasets (SIH26057)")
    print("==================================================================")

    # 1. Generate 5 Standard Sonar Sample Images
    sample_definitions = [
        ("sample_01_shipwreck.jpg", "shipwreck", "High", [360, 250, 450, 340], "Sunken maritime vessel hull with prominent acoustic shadow"),
        ("sample_02_ghost_net.jpg", "ghost_net", "Medium", [210, 270, 280, 330], "Abandoned discarded fishing gillnet entangled on seafloor"),
        ("sample_03_submarine_pipeline.jpg", "submarine_pipeline", "High", [375, 50, 415, 590], "Continuous underwater metallic pipeline along survey trackline"),
        ("sample_04_mine_cylinder.jpg", "mine_cylinder", "High", [240, 210, 275, 245], "Unexploded ordnance (UXO) / cylindrical metallic canister"),
        ("sample_05_clean_seabed.jpg", "clean_seabed", "None", [0, 0, 0, 0], "Control sample: natural seafloor with sand ripples and no anomalies")
    ]

    benchmark_records = []
    base_lat = 13.082700
    base_lon = 80.385000

    for idx, (filename, sample_type, target_str, bbox, desc) in enumerate(sample_definitions, 1):
        img = create_realistic_sonar_swath(sample_type, seed=42 + idx * 7)
        img_path = os.path.join(images_dir, filename)
        cv2.imwrite(img_path, img)
        print(f"[OK] Saved realistic sonar image: {img_path}")

        has_target = "YES" if sample_type != "clean_seabed" else "NO"
        gt_class = sample_type if sample_type != "clean_seabed" else "none"
        sim_lat = round(base_lat + (idx * 0.0006), 6)
        sim_lon = round(base_lon + (idx * 0.0005), 6)

        benchmark_records.append([
            f"SMP-00{idx}",
            filename,
            sample_type,
            has_target,
            gt_class,
            target_str,
            bbox[0], bbox[1], bbox[2], bbox[3],
            sim_lat,
            sim_lon,
            45.0,
            desc
        ])

    # 2. Generate Navigation Pings CSV (AUV telemetry stream)
    nav_pings_csv = os.path.join(samples_dir, "sample_nav_pings.csv")
    generate_sample_nav_pings_csv(nav_pings_csv, num_pings=500)

    # 3. Generate Multi-Track Survey Mission CSV (1200 pings)
    multi_track_csv = os.path.join(samples_dir, "sample_survey_mission_multi_track.csv")
    generate_multi_track_mission_csv(multi_track_csv, num_pings=1200)

    # 4. Generate Debris Targets Report CSV (Official SIH26057 format)
    debris_targets_csv = os.path.join(samples_dir, "sample_debris_targets.csv")
    generate_debris_targets_report_csv(debris_targets_csv)

    # 5. Generate Test Benchmark Index CSV
    benchmark_csv = os.path.join(samples_dir, "test_samples_benchmark.csv")
    generate_benchmark_index_csv(benchmark_csv, benchmark_records)

    # 6. Run AI Detector on Samples and Generate Inference Results CSV
    print("\n[INFO] Running FlowNex AI detector on test samples to generate live results...")
    detector = SonarDetector()
    inference_csv = os.path.join(samples_dir, "test_inference_detections.csv")
    run_inference_and_export_csv(images_dir, inference_csv, detector)

    print("\n==================================================================")
    print("[SUCCESS] ALL SAMPLE CSVs AND TEST IMAGES GENERATED SUCCESSFULLY!")
    print(f"Directory: {samples_dir}")
    print("Files created:")
    print(f"  1. {os.path.basename(nav_pings_csv)} (500 GPS ping telemetry stream)")
    print(f"  2. {os.path.basename(multi_track_csv)} (1,200 multi-leg survey pings)")
    print(f"  3. {os.path.basename(debris_targets_csv)} (Official SIH26057 debris report)")
    print(f"  4. {os.path.basename(benchmark_csv)} (Evaluation benchmark index)")
    print(f"  5. {os.path.basename(inference_csv)} (Live model detection results)")
    print(f"  6. images/ (5 realistic 640x640 sonar test images)")
    print("==================================================================")


if __name__ == "__main__":
    main()
