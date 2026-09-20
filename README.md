# 🌊 DRISHTI-SSS: AI-Powered Underwater Debris & Anomaly Detection System

**Smart India Hackathon 2026 — Problem Statement 26057**  
**Organization:** Ministry of Earth Sciences (MoES) — National Institute of Ocean Technology (NIOT)  
**Category:** Software | **Theme:** Disaster Management & Marine Conservation  

---

## 📌 Executive Summary
**DRISHTI-SSS** is an end-to-end, automated acoustic computer vision system engineered for Side-Scan Sonar (SSS) data. It ingests raw acoustic logs, eliminates speckle noise through physical Local MMSE (7x7 Lee Filter) and CLAHE, identifies anthropogenic debris (ghost nets, shipwrecks, pipelines, cylinders) using AI, verifies highlight-shadow acoustic physics, and produces actionable georeferenced reports.

---

## ⚡ Key Highlights & Architecture
1. **Zero-Local-Footprint Workflow:**
   * Model training runs in Google Colab / Cloud GPU on the 5,200+ tile [`rehan9599/drishti-sss`](https://huggingface.co/datasets/rehan9599/drishti-sss) dataset.
   * Only lightweight model weights (`best.pt` / `best.onnx`, ~15–25 MB) are deployed to the local system.
2. **Acoustic Highlight-Shadow Physics Validator:**
   * Enforces physical consistency by verifying that high-backscatter highlights have trailing acoustic shadows aligned with the sonar beam direction.
   * Calculates physical object dimensions ($L \times W$) and estimated height ($H_{obj}$) from shadow lengths.
3. **Georeferencing & Export Engine:**
   * Converts sonar pixel coordinates to WGS84 Latitude/Longitude given vessel navigation state.
   * One-click export to **GeoJSON** (for QGIS / ArcGIS) and **CSV** (for cleanup vessel crews).
4. **Interactive Hydrographic Web UI:**
   * High-FPS HTML5 Canvas sonar waterfall viewer with false-color palette switching (Copper, Amber, Emerald, Grayscale).
   * Live Leaflet GIS dark bathymetry map tracking AUV path and flagging hazard pins.

---

## 🚀 Quickstart Guide

### 1. Install Local Requirements
```bash
pip install -r requirements.txt
```

### 2. Start the Local FastAPI Server & Dashboard
```bash
python -m uvicorn backend.app:app --reload --port 8000
```
Open your browser and navigate to:
👉 **`http://localhost:8000`**

---

## ☁️ Google Colab Cloud Model Training

1. Open [Google Colab](https://colab.research.google.com).
2. Set **Runtime** -> **Change runtime type** -> **T4 GPU**.
3. Upload and run `train_colab.py`.
4. It will automatically:
   - Pull `rehan9599/drishti-sss` from Hugging Face into cloud RAM.
   - Train YOLOv8s with acoustic augmentations.
   - Export `best.pt` and `best.onnx`.
5. Download `best.pt` or `best.onnx` and place it inside `models/weights/`.

---

## 📁 Repository Structure
```
SIH2K26/
├── backend/
│   ├── app.py                      # FastAPI application & REST endpoints
│   ├── core/
│   │   ├── preprocessing.py        # 7x7 Lee filter, CLAHE, Slant-Range Correction
│   │   ├── detector.py             # YOLOv8/ONNX + fallback acoustic heuristic engine
│   │   ├── shadow_validator.py     # Highlight-shadow physical geometry validator
│   │   ├── georeferencer.py        # Pixel-to-WGS84 Lat/Lon coordinate engine
│   │   └── report_generator.py     # GeoJSON and CSV export generator
│   └── tests/
│       └── test_pipeline.py        # Automated test suite
├── frontend/
│   ├── index.html                  # Hydrographic dashboard UI
│   ├── css/
│   │   └── style.css               # Dark ocean UI design system
│   └── js/
│       ├── app.js                  # Frontend controller & API bridge
│       ├── waterfall.js            # HTML5 Canvas real-time sonar waterfall
│       └── map.js                  # Leaflet GIS bathymetry map & tracklines
├── models/
│   └── weights/                    # Directory for downloaded best.pt / best.onnx
├── train_colab.py                  # Self-contained Google Colab cloud training script
├── requirements.txt                # Python dependencies
└── problem statement.txt           # SIH26057 problem description
```
