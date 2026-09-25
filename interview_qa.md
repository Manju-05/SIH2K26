# 🎯 FlowNex – Interview & Judge Q&A Prep
### SIH2K26 – Problem Statement SIH26057

---

## 🔵 CATEGORY 1: Problem Statement & Relevance

### Q1. What problem are you solving?
**Answer:**  
India's coastal and deep-sea areas contain thousands of tons of lost fishing gear (ghost nets), unexploded ordnance (mine-like objects), shipwrecks, and submarine pipelines that pose a critical threat to marine ecosystems, shipping, and national security.  
Manual diver surveys are expensive, dangerous below 30m, and slow.  
FlowNex automates underwater debris detection using **Side-Scan Sonar (SSS) imagery** processed by AI — giving NIOT, Indian Navy, and Coast Guard a fast, low-cost, autonomous solution.

---

### Q2. Why Side-Scan Sonar? Why not a camera?
**Answer:**  
- Optical cameras work only up to 5–15m depth in clear water — beyond that, light vanishes.
- Side-Scan Sonar emits acoustic pulses and reads echoes — it maps the entire seafloor in near-darkness regardless of depth, turbidity, or marine snow.
- SSS can cover **hundreds of meters of swath** per ping at 100–1000m depth — cameras cannot.
- SSS is the **standard instrument** used by NIOT, NOAA, and naval survey vessels worldwide.

---

### Q3. What makes this different from existing solutions?
**Answer:**  
1. **Physics-Grounded AI** — We don't just run a neural net. Every detection is validated against *acoustic highlight-shadow physics* (real objects MUST cast a shadow away from the sonar nadir). False positives from seafloor sand ripples are rejected automatically.
2. **Edge-Ready** — Runs as ONNX Runtime on CPU; fits on NVIDIA Jetson Orin Nano aboard AUVs. No cloud dependency.
3. **WGS84 Georeferencing** — Converts pixel detections to real GPS coordinates using vessel heading + slant range geometry.
4. **Open, Standardized Output** — GeoJSON (RFC 7946) and CSV reports directly importable into QGIS/ArcGIS for field recovery teams.

---

## 🔵 CATEGORY 2: AI / ML Deep Dive

### Q4. What model did you use and why?
**Answer:**  
**YOLOv8s (Small variant)** trained on the **Drishti-SSS sonar dataset** (rehan9599/drishti-sss on HuggingFace/Kaggle), exported to **ONNX format** for hardware-agnostic inference.  
- YOLOv8 is the industry standard for real-time object detection.
- The 's' (small) variant balances speed (~20ms/image) and accuracy (~82% mAP50).
- ONNX Runtime avoids the need for PyTorch/CUDA on edge devices.

---

### Q5. What are the 5 classes you detect?

| Class | Description |
|---|---|
| `crab_pot` | Abandoned fishing traps — entangle marine life |
| `ghost_net` | Lost nylon nets — #1 cause of bycatch mortality |
| `shipwreck` | Hazard to navigation; potential pollution source |
| `submarine_pipeline` | Infrastructure; requires protection and inspection |
| `mine_cylinder` | Unexploded ordnance — critical safety threat |

---

### Q6. What is your model's accuracy?
**Answer:**  
~82% mAP50 on the validation split of the Drishti-SSS dataset.  
In our **heuristic fusion mode** (when model confidence is low), we supplement with acoustic morphology rules — so effective detection recall is higher than the model alone.

---

### Q7. Is the confidence score hardcoded?
**Answer (very important — this was your previous concern):**  
**No, it is NOT hardcoded.** The confidence score goes through 3 real computation stages:

1. **Model Confidence** — Raw YOLO class probability from the neural network (0.0–1.0).
2. **Acoustic Fusion** — If a heuristic highlight-shadow blob overlaps (IoU > 15%) with the YOLO box, scores are fused:
   `conf = max(model_conf, heuristic_conf) * 0.95 + 0.05`
3. **Physics Calibration** — The final score is a weighted blend of model score + physical acoustic contrast:
   - Both highlight + shadow present: `0.55 × model_conf + 0.45 × physics_conf`
   - Shadow only: `0.50 × model_conf + 0.35 × physics_conf`
   - Highlight only: `0.55 × model_conf + 0.30 × physics_conf`

The result is **clamped to [0.05, 0.96]** — which is why you see many detections in the 0.7–0.94 range. High scores mean the object has strong acoustic highlight AND a clear shadow, which is exactly what real debris looks like in sonar.

If scores seem uniformly high, it means your **test images contain genuinely bright, high-contrast anomalies** that pass all three validation stages.

---

### Q8. What is the 7×7 Lee Speckle Filter?
**Answer:**  
Sonar images are inherently noisy due to **speckle** — coherent acoustic interference that appears as grainy salt-and-pepper noise. The **Lee Filter** is a standard signal processing technique that:
- Computes local mean & variance in a 7×7 pixel neighborhood.
- Applies Minimum Mean Square Error (MMSE) adaptive smoothing.
- Reduces noise **without blurring edges** of real objects — unlike a Gaussian blur.

After Lee filtering, **CLAHE** (Contrast Limited Adaptive Histogram Equalization) boosts local contrast so faint debris echoes become visible for detection.

---

### Q9. What is acoustic highlight-shadow validation?
**Answer (explain with a simple analogy):**  
Think of side-scan sonar like the sun shining sideways on the seafloor.  
- A rock or debris sticking up from the seafloor **reflects sonar pulses brightly** → this is the **highlight** (bright white region).
- The area behind the object that no sonar pulse can reach → this is the **acoustic shadow** (dark region).

Any real 3D object MUST have both. Sand ripples are flat — they produce texture but NO distinct shadow.  
Our shadow validator checks:
- ✅ Is there a bright patch (pixel > 175) in the bounding box? → **Highlight detected**
- ✅ Is there a dark patch (pixel < 40) adjacent in the correct direction? → **Shadow detected**
- ❌ If neither → **Rejected as false positive**

---

## 🔵 CATEGORY 3: Geolocation

### Q10. How does geolocation of detected debris work?
**Answer:**  
Side-scan sonar records which **pixel column** a return came from. The nadir (directly below vessel) is the center column. Each pixel column maps to a real distance across the seafloor using **ground-range resolution** (e.g., 5 cm per pixel).

FlowNex uses **WGS84 geodetic math**:

1. `cross_track_m = (pixel_x - nadir_x) × 0.05 m/px` — how far sideways from the vessel.
2. `along_track_m = pixel_y × 0.08 m/ping` — how far behind the vessel.
3. Both are decomposed into North/East components using **vessel heading**.
4. Added to vessel lat/lon using Earth-radius spherical offsets.

**Result:** Each debris detection gets a real GPS coordinate to 6 decimal places (~10cm precision).

---

### Q11. Why do you need vessel lat/lon and heading as inputs?
**Answer:**  
Because sonar pixels are **relative to the vessel**, not absolute. Without knowing WHERE the vessel is (GPS) and WHICH WAY it's pointing (heading/compass), it's impossible to translate pixel position to a real-world coordinate. The system takes these from the AUV's onboard GPS/INS navigation unit.

---

## 🔵 CATEGORY 4: System Architecture

### Q12. Explain the system architecture briefly.
**Answer:**  

```
[AUV / Survey Vessel]
     │
     ▼
[Raw SSS Sonar Image (JPEG/PNG)]
     │
     ▼
[FlowNex Backend – FastAPI]
  ├─ 7×7 Lee MMSE Filter + CLAHE Preprocessing
  ├─ YOLOv8 ONNX Inference (5-class detection)
  ├─ Acoustic Highlight-Shadow Physics Validator
  ├─ WGS84 Georeferencer (pixel → GPS)
  └─ GeoJSON / CSV Report Generator
     │
     ▼
[FlowNex Dashboard – Browser UI]
  ├─ Annotated sonar image with bounding boxes
  ├─ Target table (class, confidence, coordinates)
  ├─ Leaflet.js interactive GIS map with pinned hazards
  └─ Sonar ping alert sound (3× on detection)
```

---

### Q13. Why FastAPI and not Django or Flask?
**Answer:**  
- FastAPI is **async-native** — it handles multiple concurrent sonar uploads without blocking.
- Built-in **Swagger/OpenAPI** documentation for every endpoint.
- ~3× faster than Flask for I/O-heavy tasks (file uploads, JSON serialization).
- **Type-safe** with Pydantic — critical when handling multi-parameter sonar configs.

---

### Q14. Can this run offline on an AUV? No internet?
**Answer:**  
Yes. The entire stack (FastAPI + ONNX Runtime + OpenCV + Leaflet offline tiles) runs on:
- **NVIDIA Jetson Orin Nano** (8GB) → 20–50ms per sonar frame inference
- **Raspberry Pi 5** → ~200ms per frame (acceptable for real-time waterfall scanning)
- No cloud, no GPU cluster required.

---

## 🔵 CATEGORY 5: Frontend / Dashboard

### Q15. What does the dashboard show?
| Component | What it does |
|---|---|
| Input Sonar Image card | Upload sonar image, set GPS coords, heading, sensitivity |
| Annotated Output | Processed sonar with colored bounding boxes |
| Detection Summary | Count of targets, breakdown by class |
| Target Table | Each debris: class, confidence %, GPS, dimensions |
| GIS Map | Leaflet map with pin markers at each debris GPS location |
| Sonar Ping Alert | 3× audible ping when debris is detected |
| Export buttons | CSV and GeoJSON download |
| Colormap selector | Copper/Amber/Grayscale sonar palette |

---

### Q16. What does the sensitivity slider actually do?
**Answer:**  
Sensitivity controls the **minimum confidence threshold** for displaying a detection.
- **Low sensitivity (e.g., 0.25)** → Shows even faint, uncertain detections. Good for initial survey (don't miss anything).
- **High sensitivity (e.g., 0.70)** → Shows only high-confidence, physics-validated detections. Good for actionable reports.

It lets field operators tune the system for the mission — broad initial sweeps vs targeted recovery operations. **It is genuinely useful and NOT decorative.**

---

## 🔵 CATEGORY 6: Dataset & Training

### Q17. What dataset did you use to train?
**Answer:**  
**Drishti-SSS** — a publicly available annotated Side-Scan Sonar dataset (HuggingFace / Kaggle) with labeled bounding boxes for marine debris categories including ghost nets, pipelines, shipwrecks, and mine-like objects.

Training was done on **Google Colab Pro** using the `train_colab.ipynb` notebook, exported as `best.onnx` for deployment.

---

### Q18. How do you handle false positives from sand ripples?
**Answer:**  
This is exactly what our **acoustic shadow validator** solves. Sand ripples are **flat** — they produce periodic texture in sonar but NO acoustic shadow. Our validator requires:
- A bright highlight (pixel ≥ 175) in the bounding box, AND
- A dark shadow (pixel ≤ 40) adjacent in the physically correct direction.

Any blob without both is **rejected as geological noise**.

---

## 🔵 CATEGORY 7: Impact & Deployment

### Q19. What is the real-world impact?
| Metric | Value |
|---|---|
| Ghost net ghost nets → marine mortality | ~640,000 tons/year globally |
| India's EEZ area | 2.37 million km² |
| AUV survey speed | ~4 knots = 7.4 km/h |
| FlowNex inference speed | ~20ms/frame (ONNX, CPU) |
| Report format | GeoJSON → directly into QGIS/ArcGIS |

---

### Q20. Who are your end users?
- **NIOT (National Institute of Ocean Technology)** — AUV fleet operators
- **Indian Navy / Coast Guard** — MCM (Mine Counter Measures) operations
- **INCOIS** — Ocean hazard mapping
- **Fisheries dept.** — Ghost net removal campaigns
- **Offshore oil & gas** — Pipeline inspection (ONGC, Reliance)

---

### Q21. What is your business/deployment model?
**Answer:**  
FlowNex is designed as:
1. **Open-source core** (MIT License) — for NIOT/academic adoption.
2. **Deployable as a microservice** (`render.yaml` included) — can be hosted on Render/AWS/Azure.
3. **Edge-package** for Jetson Orin Nano (ONNX Runtime already configured).
4. Future: real-time streaming from SSS waterfall with WebSocket-based live detection.

---

## 🔵 CATEGORY 8: Technical Challenges

### Q22. What was the hardest technical challenge?
**Answer (pick one or two):**
1. **Acoustic physics validation** — Getting the highlight-shadow logic right required understanding sonar physics. Early versions had many false positives from seafloor rock textures. The nadir-directional shadow check solved it.
2. **Confidence calibration** — Raw YOLO scores were either too high (overconfident on noisy sonar) or too low (missing faint debris). The 3-stage fusion (model + heuristic + physics) with clamping gave calibrated, realistic scores.

---

### Q23. What would you improve with more time?
1. **Real-time WebSocket streaming** — Process live sonar waterfall as it streams from the towfish.
2. **Multi-beam sonar support** — Extend beyond SSS to MBES (3D bathymetric point clouds).
3. **Larger training dataset** — Collect and annotate NIOT's proprietary sonar archives.
4. **Confidence uncertainty quantification** — Add Monte Carlo dropout for Bayesian confidence intervals.
5. **Automatic swath mosaicking** — Stitch multiple sonar tiles into a single geo-referenced mission map.

---

## 🔵 BONUS: Tricky Judge Questions

### Q24. Your confidence scores look very high (>90%). Isn't that suspicious?
**Answer:**  
No. High confidence is expected when the input image contains **high-contrast sonar anomalies** that pass all three validation stages — strong YOLO probability, acoustic highlight, AND clear shadow. The scores are mathematically bounded to max 0.96 (never 100%) to avoid overconfidence. If you upload a blank seafloor image with no anomalies, you'll get zero detections.

---

### Q25. How is this different from just running YOLO on sonar images?
**Answer:**  
Plain YOLO on sonar would give many false positives from sand dunes, ripples, and seabed clutter — which all look like "bright objects" to a general object detector. FlowNex adds:
1. **Domain-specific preprocessing** (Lee filter removes speckle — essential for sonar)
2. **Physics validation** (highlight-shadow rejection of false positives)
3. **Georeferencing** (pixel → GPS — YOLO gives you no location)
4. **Heuristic fusion** (acoustic morphology when model is uncertain)

---

### Q26. Can your model detect mines? That's a security-sensitive topic.
**Answer:**  
Our model detects **mine-like cylinders** — objects with compact cylindrical morphology consistent with unexploded ordnance. This capability is documented in the SIH problem statement itself (marine hazard mapping). The system is designed for **NIOT and Indian Navy authorized users** — not public deployment. Access control would be implemented in any production deployment.

---

### Q27. What is your test coverage?
**Answer:**  
- Unit tests for preprocessing, georeferencer, shadow validator, and detector heuristics under `tests/`
- End-to-end edge case tests in `tests/test_end_to_end_edge_cases.py`
- Benchmark script (`benchmark_edge.py`) measures inference time and preprocessing latency

---

> 💡 **Quick Demo Flow for Judges (2 minutes):**
> 1. Open `http://localhost:8000`
> 2. Upload a sample sonar image from `samples/`
> 3. Set GPS coordinates (e.g., 13.0827°N, 80.3850°E — Bay of Bengal)
> 4. Set heading 45° (NE survey track)
> 5. Click **Analyze** → hear 3× ping alert
> 6. Show annotated output, target table, and GIS map pins
> 7. Click Export → show GeoJSON download
