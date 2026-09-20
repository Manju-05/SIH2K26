"""
FastAPI Backend Application for Underwater Marine Debris & Sonar Anomaly Detection (SIH26057)
"""

import os
import io
import base64
import cv2
import numpy as np
import requests
from fastapi import FastAPI, UploadFile, File, Form, Response, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import JSONResponse, FileResponse

from backend.core.detector import SonarDetector
from backend.core.preprocessing import apply_sonar_colormap, standard_sonar_preprocess
from backend.core.report_generator import ReportGenerator
from backend.core.parser_xtf import SonarLogParser

app = FastAPI(
    title="AI-Powered Underwater Marine Debris & Anomaly Detection System",
    description="Automated Side-Scan Sonar Computer Vision Pipeline (SIH26057 - MoES/NIOT)",
    version="1.0.0"
)

# Enable CORS for frontend web client
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize Detector Engine
detector = SonarDetector()


@app.get("/api/status")
def get_system_status():
    """Returns AI model status, engine readiness, and edge device status."""
    has_weights = detector.model is not None or detector.onnx_session is not None
    engine_type = "PyTorch YOLOv8s" if detector.model else ("ONNX Runtime" if detector.onnx_session else "Acoustic Heuristic CV")
    return {
        "status": "ONLINE",
        "system": "DRISHTI-SSS Sonar Vision Engine",
        "problem_statement": "SIH26057 (MoES / NIOT)",
        "model_loaded": has_weights,
        "engine": engine_type,
        "classes": ["submarine_pipeline", "shipwreck", "ghost_net", "mine_cylinder"],
        "preprocessing": "7x7 Lee Speckle Filter + CLAHE (3.0)",
        "georeferencing": "WGS84 Lat/Lon Enabled"
    }


@app.post("/api/process-sonar-image")
async def process_sonar_image(
    file: UploadFile = File(...),
    vessel_lat: float = Form(12.9234),
    vessel_lon: float = Form(80.2451),
    vessel_heading: float = Form(45.0),
    confidence_thresh: float = Form(0.35),
    colormap: str = Form("copper"),
    apply_filter: bool = Form(True)
):
    """
    Processes an uploaded sonar image: despeckles, runs AI object detection,
    validates highlight-shadow acoustic physics, and outputs georeferenced anomaly coordinates.
    """
    contents = await file.read()
    nparr = np.frombuffer(contents, np.uint8)
    image = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

    if image is None:
        return JSONResponse(status_code=400, content={"error": "Invalid image file uploaded."})

    # Run detection pipeline
    result = detector.detect_image(
        image_input=image,
        vessel_lat=vessel_lat,
        vessel_lon=vessel_lon,
        vessel_heading_deg=vessel_heading,
        confidence_thresh=confidence_thresh,
        apply_preprocessing=apply_filter
    )

    # Generate processed/annotated false-color image for UI visualization
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    if apply_filter:
        gray = standard_sonar_preprocess(gray)
        
    color_img = apply_sonar_colormap(gray, palette_name=colormap)

    # Draw bounding boxes and labels
    for det in result["detections"]:
        x1, y1, x2, y2 = det["bbox"]
        class_name = det["class_name"]
        conf_str = det["confidence_percent"]
        color = (0, 230, 255) if colormap == "copper" else (0, 255, 120)
        
        cv2.rectangle(color_img, (x1, y1), (x2, y2), color, 2)
        label = f"{class_name} [{conf_str}]"
        cv2.putText(color_img, label, (x1, max(18, y1 - 6)), cv2.FONT_HERSHEY_SIMPLEX, 0.45, color, 1)

    # Encode annotated image to base64
    _, buffer = cv2.imencode('.jpg', color_img)
    encoded_img = base64.b64encode(buffer).decode('utf-8')

    result["annotated_image_base64"] = f"data:image/jpeg;base64,{encoded_img}"
    result["filename"] = file.filename
    return result


@app.get("/api/fetch-sample-sonar")
def fetch_sample_sonar(sample_type: str = Query("shipwreck")):
    """
    Generates or fetches a live high-resolution realistic Side-Scan Sonar simulation slice
    with acoustic highlights, shadows, and geological seafloor ripples on the fly.
    """
    # Create a realistic 640x640 SSS acoustic swath simulation tile
    h, w = 640, 640
    # Background seabed reverberation & sand ripples
    y_coords, x_coords = np.mgrid[0:h, 0:w]
    ripples = np.sin(x_coords / 8.0 + np.sin(y_coords / 20.0)) * 18.0
    speckle = np.random.exponential(scale=20.0, size=(h, w))
    seabed = np.clip(70.0 + ripples + speckle, 0, 255).astype(np.uint8)

    # Center nadir dark line (AUV flight path)
    mid = w // 2
    seabed[:, mid-4:mid+4] = np.random.randint(10, 30, size=(h, 8))

    # Inject acoustic debris highlight & shadow based on requested sample type
    if sample_type == "shipwreck":
        # Hull highlight (bright backscatter)
        cv2.rectangle(seabed, (360, 260), (440, 340), 235, -1)
        # Trailing acoustic shadow extending starboard outward
        cv2.rectangle(seabed, (440, 260), (530, 340), 12, -1)
    elif sample_type == "ghost_net":
        # Amorphous mesh highlight
        cv2.ellipse(seabed, (220, 300), (45, 30), 30, 0, 360, 220, -1)
        cv2.ellipse(seabed, (150, 300), (35, 25), 30, 0, 360, 15, -1)
    elif sample_type == "submarine_pipeline":
        # Linear cylinder along track
        cv2.line(seabed, (380, 100), (410, 540), 245, 8)
        cv2.line(seabed, (415, 100), (455, 540), 15, 12)
    else:  # mine_cylinder
        cv2.circle(seabed, (260, 220), 18, 240, -1)
        cv2.ellipse(seabed, (215, 220), (30, 15), 0, 0, 360, 10, -1)

    _, buffer = cv2.imencode('.jpg', seabed)
    return Response(content=buffer.tobytes(), media_type="image/jpeg")


@app.get("/api/generate-survey-mission")
def generate_survey_mission():
    """
    Generates and processes a continuous multi-kilometer hydrographic survey transect log.
    Slices the trackline into 640x640 analysis tiles and runs automated AI anomaly detection.
    """
    csv_log, waterfall_img = SonarLogParser.generate_synthetic_survey_mission()
    parser = SonarLogParser()
    pings = parser.parse_csv_ping_stream(csv_log)
    tiles = parser.slice_waterfall_to_tiles(waterfall_img, pings)

    all_detections = []
    for tile in tiles:
        nav = tile["nav_state"]
        res = detector.detect_image(
            image_input=tile["tile_image"],
            vessel_lat=nav["latitude"],
            vessel_lon=nav["longitude"],
            vessel_heading_deg=nav["heading"]
        )
        for d in res["detections"]:
            d["survey_tile_index"] = tile["tile_index"]
            all_detections.append(d)

    # Encode first tile as preview
    gray = standard_sonar_preprocess(tiles[0]["tile_image"])
    color_img = apply_sonar_colormap(gray, palette_name="copper")
    _, buffer = cv2.imencode('.jpg', color_img)
    encoded_img = base64.b64encode(buffer).decode('utf-8')

    return {
        "mission_name": "NIOT_Autonomous_AUV_Survey_Line_01",
        "total_pings": len(pings),
        "total_tiles_analyzed": len(tiles),
        "total_anomalies_detected": len(all_detections),
        "detections": all_detections,
        "annotated_image_base64": f"data:image/jpeg;base64,{encoded_img}"
    }


@app.post("/api/export-geojson")
def export_geojson(payload: dict):
    """Generates and returns downloadable GeoJSON file."""
    geojson_data = ReportGenerator.to_geojson(payload)
    return JSONResponse(
        content=geojson_data,
        headers={"Content-Disposition": "attachment; filename=sonar_debris_report.geojson"}
    )


@app.post("/api/export-csv")
def export_csv(payload: dict):
    """Generates and returns downloadable CSV report."""
    csv_str = ReportGenerator.to_csv_string(payload)
    return Response(
        content=csv_str,
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=sonar_debris_targets.csv"}
    )


# Serve Static Frontend UI
frontend_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), "frontend")
if os.path.exists(frontend_dir):
    app.mount("/", StaticFiles(directory=frontend_dir, html=True), name="frontend")
