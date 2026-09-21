# 📊 FlowNex: Sonar Test Samples & CSV Datasets

This directory contains standardized test datasets, hydrographic navigation ping streams, detection reports, and sample Side-Scan Sonar (SSS) images prepared for **Smart India Hackathon 2026 (Problem Statement SIH26057 - MoES / NIOT)**.

---

## 📁 Directory Contents

```
samples/
├── sample_nav_pings.csv                   # AUV hydrographic navigation ping stream (500 pings @ 10 Hz)
├── sample_survey_mission_multi_track.csv  # Multi-leg lawnmower AUV survey mission transect (1,200 pings)
├── sample_debris_targets.csv              # Official SIH26057 target coordinate list export
├── test_samples_benchmark.csv             # Ground-truth evaluation benchmark index
├── test_inference_detections.csv          # Live AI model detection results on the test images
├── generate_samples.py                    # Standalone script to regenerate or customize samples
├── README.md                              # Dataset documentation and testing instructions
└── images/                                # Standardized 640x640 Side-Scan Sonar test images
    ├── sample_01_shipwreck.jpg            # Sunken ship hull with high-contrast acoustic shadow
    ├── sample_02_ghost_net.jpg            # Discarded fishing gear / entangled mesh anomaly
    ├── sample_03_submarine_pipeline.jpg   # Underwater metallic utility pipeline along track
    ├── sample_04_mine_cylinder.jpg        # Unexploded ordnance (UXO) / metallic canister
    └── sample_05_clean_seabed.jpg         # Control sample: natural sand ripples (no debris)
```

---

## 📑 CSV File Descriptions & Schemas

### 1. `sample_nav_pings.csv`
- **Purpose:** Simulates a real-time 10 Hz telemetry stream from an Autonomous Underwater Vehicle (AUV) carrying a Side-Scan Sonar payload off the coast of Chennai (NIOT operations area).
- **Ingestion:** Directly compatible with `backend.core.parser_xtf.SonarLogParser.parse_csv_ping_stream()`.
- **Columns:**
  | Column Name | Data Type | Description |
  |---|:---:|---|
  | `ping_id` | Integer | Monotonically increasing acoustic ping sequence number |
  | `timestamp` | ISO 8601 String | Coordinated Universal Time (UTC) timestamp of the acoustic pulse |
  | `latitude` | Float (deg) | WGS84 Geodetic Latitude of the vehicle |
  | `longitude` | Float (deg) | WGS84 Geodetic Longitude of the vehicle |
  | `heading` | Float (deg) | Compass course heading (0.0° - 359.9°) |
  | `altitude_m` | Float (m) | AUV altitude above seafloor measured by DVL / altimeter (~10 m) |
  | `speed_knots` | Float (kn) | AUV survey velocity through water (~3.5 knots) |

---

### 2. `sample_survey_mission_multi_track.csv`
- **Purpose:** 1,200 pings simulating a 3-leg lawnmower pattern survey transect line (Eastward $\rightarrow$ Southward $\rightarrow$ Westward) across the Chennai harbor approach.
- **Use Case:** Testing long continuous swath slicing, trackline turns, and spatial indexing across multi-kilometer survey areas.

---

### 3. `sample_debris_targets.csv`
- **Purpose:** Actionable coordinate target list formatted to the exact SIH26057 specification for offshore recovery vessels, marine conservationists, and GIS platforms (QGIS, ArcGIS).
- **Columns:**
  | Column Name | Description |
  |---|---|
  | `Target ID` | Unique numeric identifier for the detected anomaly |
  | `Classification` | Identified class (`shipwreck`, `ghost_net`, `submarine_pipeline`, `mine_cylinder`) |
  | `Confidence` | Calibrated model + acoustic physics confidence score (e.g., `89%`) |
  | `Latitude` | Calculated WGS84 latitude coordinate of the debris center |
  | `Longitude` | Calculated WGS84 longitude coordinate of the debris center |
  | `Cross-Track Offset (m)` | Lateral distance from vehicle nadir line (positive = Starboard, negative = Port) |
  | `Along-Track Offset (m)` | Distance along vehicle travel vector |
  | `Length (m)` | Physical estimated length of the debris |
  | `Width (m)` | Physical estimated width of the debris |
  | `Est Height (m)` | Seafloor vertical relief calculated via shadow acoustics: $H = \frac{L_{shadow} \cdot H_{alt}}{R_{slant} + L_{shadow}}$ |
  | `Area (m2)` | Total estimated seafloor footprint |
  | `Acoustic Shadow Verified` | `YES` if trailing acoustic void matches grazing-angle physics; `NO` otherwise |

---

### 4. `test_samples_benchmark.csv`
- **Purpose:** Evaluation index matching each test image in `samples/images/` to its ground-truth class, target strength, bounding box, simulated GPS coordinates, and anomaly description.
- **Use Case:** Automated benchmarking of Precision, Recall, and Intersection over Union (IoU).

---

### 5. `test_inference_detections.csv`
- **Purpose:** Output table produced by running the FlowNex AI detector (`best.onnx`) and the acoustic shadow validator on all 5 sample images.
- **Verification:** Confirms that all 4 hazard samples are correctly detected and georeferenced while the natural seabed control sample yields 0 false alarms.

---

## 🧪 How to Test with These Samples

### Method 1: Interactive FlowNex Web Dashboard
1. Ensure the backend server is running:
   ```bash
   python -m uvicorn backend.app:app --host 127.0.0.1 --port 8000 --reload
   ```
2. Open your browser at **`http://localhost:8000`**.
3. In the **Ingest Sonar Records** panel, drag and drop any test image from `samples/images/` (e.g., `sample_01_shipwreck.jpg`).
4. Click **Inspect Targets** to view real-time bounding boxes, false-color enhancement, and the target drawer.
5. In the **Mission Reports** workspace, click **Download CSV Targets** to export the structured CSV.

---

### Method 2: Command-Line REST API Testing
Test the `/api/detect` endpoint using `curl` or Python:

```bash
curl -X POST "http://127.0.0.1:8000/api/detect" \
  -F "file=@samples/images/sample_01_shipwreck.jpg" \
  -F "vessel_lat=13.0827" \
  -F "vessel_lon=80.3850" \
  -F "vessel_heading=45.0" \
  -F "confidence_thresh=0.15"
```

---

### Method 3: Regenerate or Customize Samples
To regenerate or modify these test files with different ping counts or locations:
```bash
python samples/generate_samples.py
```
