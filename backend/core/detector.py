"""
AI/ML Sonar Debris & Anomaly Detector Engine
Supports:
1. YOLOv8 / YOLO11 PyTorch (.pt) and ONNX (.onnx) Inference.
2. Standardized 7x7 Lee + CLAHE preprocessing pipeline.
3. Acoustic Highlight-Shadow validation filter.
4. Physical size and WGS84 Geolocation calculation.
5. Robust fallback heuristic detector for immediate out-of-the-box local operation.
"""

import os
import cv2
import numpy as np
from typing import List, Dict, Any, Optional

from .preprocessing import standard_sonar_preprocess, apply_sonar_colormap
from .shadow_validator import AcousticShadowValidator
from .georeferencer import SonarGeoreferencer

# Class name mapping matching rehan9599/drishti-sss
CLASS_NAMES = {
    1: "submarine_pipeline",
    2: "shipwreck",
    3: "ghost_net",
    4: "mine_cylinder"
}

CLASS_COLORS = {
    "submarine_pipeline": "#3B82F6",  # Blue
    "shipwreck": "#EF4444",           # Red
    "ghost_net": "#F59E0B",           # Amber/Orange
    "mine_cylinder": "#EC4899",       # Pink
    "debris_anomaly": "#10B981"       # Green
}


class SonarDetector:
    def __init__(self, weights_path: Optional[str] = None):
        self.weights_path = weights_path
        self.model = None
        self.onnx_session = None
        self.shadow_validator = AcousticShadowValidator()
        self.georeferencer = SonarGeoreferencer()
        self._load_model()

    def _load_model(self):
        """Attempts to load PyTorch YOLO or ONNX model if weights exist."""
        if not self.weights_path or not os.path.exists(self.weights_path):
            # Check default locations
            default_pt = "models/weights/best.pt"
            default_onnx = "models/weights/best.onnx"
            if os.path.exists(default_pt):
                self.weights_path = default_pt
            elif os.path.exists(default_onnx):
                self.weights_path = default_onnx
            else:
                print("[INFO] No trained weights found in models/weights/. Running in acoustic heuristic/vision mode.")
                return

        try:
            if self.weights_path.endswith(".onnx"):
                import onnxruntime as ort
                self.onnx_session = ort.InferenceSession(self.weights_path, providers=['CPUExecutionProvider'])
                print(f"[OK] Loaded ONNX model from: {self.weights_path}")
            elif self.weights_path.endswith(".pt"):
                from ultralytics import YOLO
                self.model = YOLO(self.weights_path)
                print(f"[OK] Loaded PyTorch YOLO model from: {self.weights_path}")
        except Exception as e:
            print(f"[WARN] Warning loading model weights ({e}). Defaulting to acoustic heuristic detector.")

    def detect_image(
        self,
        image_input: np.ndarray,
        vessel_lat: float = 12.9234,
        vessel_lon: float = 80.2451,
        vessel_heading_deg: float = 45.0,
        confidence_thresh: float = 0.35,
        apply_preprocessing: bool = True
    ) -> Dict[str, Any]:
        """
        Runs the full detection pipeline on a sonar image tile or slice.
        """
        h, w = image_input.shape[:2]
        nadir_x = w // 2

        # 1. Apply standardized 7x7 Lee Filter + CLAHE if requested
        if apply_preprocessing:
            processed_gray = standard_sonar_preprocess(image_input)
        else:
            if len(image_input.shape) == 3:
                processed_gray = cv2.cvtColor(image_input, cv2.COLOR_BGR2GRAY)
            else:
                processed_gray = image_input.copy()

        raw_detections = []

        # 2. Run Deep Learning Model (if available)
        if self.model is not None:
            # YOLO PyTorch Inference
            rgb_input = cv2.cvtColor(processed_gray, cv2.COLOR_GRAY2RGB)
            results = self.model.predict(rgb_input, conf=confidence_thresh, imgsz=640, verbose=False)[0]
            
            for box in results.boxes:
                xyxy = box.xyxy[0].cpu().numpy().astype(int)
                cls_id = int(box.cls[0].item())
                conf = float(box.conf[0].item())
                cls_name = CLASS_NAMES.get(cls_id, f"target_class_{cls_id}")
                
                raw_detections.append({
                    "bbox": [int(xyxy[0]), int(xyxy[1]), int(xyxy[2]), int(xyxy[3])],
                    "confidence": conf,
                    "class_id": cls_id,
                    "class_name": cls_name
                })
        else:
            # Fallback Acoustic Heuristic / Shadow-Highlight Feature Extractor
            raw_detections = self._heuristic_sonar_detector(processed_gray, confidence_thresh)

        # 3. Post-processing: Validate Highlight-Shadow Acoustic Physics & Compute Geolocation
        final_detections = []
        for det in raw_detections:
            x1, y1, x2, y2 = det["bbox"]
            box_w = x2 - x1
            box_h = y2 - y1
            center_x = (x1 + x2) // 2
            center_y = (y1 + y2) // 2

            # Acoustic Physics Validation
            physics_res = self.shadow_validator.validate_detection_physics(
                processed_gray,
                (x1, y1, x2, y2),
                nadir_x=nadir_x
            )

            # Target Geolocation Calculation
            t_lat, t_lon, cross_m, along_m = self.georeferencer.pixel_to_latlon(
                pixel_x=center_x,
                pixel_y=center_y,
                nadir_x=nadir_x,
                vessel_lat=vessel_lat,
                vessel_lon=vessel_lon,
                vessel_heading_deg=vessel_heading_deg
            )

            # Dimensions
            dim_res = self.georeferencer.compute_physical_dimensions(box_w, box_h)

            # Combined calibrated confidence
            model_conf = det["confidence"]
            calibrated_conf = round(float((model_conf * 0.7) + (physics_res["physics_confidence"] * 0.3)), 2)

            class_name = det["class_name"]
            color = CLASS_COLORS.get(class_name, "#10B981")

            final_detections.append({
                "id": len(final_detections) + 1,
                "class_name": class_name,
                "class_id": det.get("class_id", 0),
                "color": color,
                "confidence": calibrated_conf,
                "confidence_percent": f"{int(calibrated_conf * 100)}%",
                "bbox": [x1, y1, x2, y2],
                "coordinates": {
                    "latitude": round(t_lat, 6),
                    "longitude": round(t_lon, 6),
                    "cross_track_offset_m": round(cross_m, 2),
                    "along_track_offset_m": round(along_m, 2)
                },
                "dimensions": {
                    **dim_res,
                    "estimated_height_m": physics_res["estimated_height_m"]
                },
                "acoustic_physics": {
                    "has_highlight": physics_res["has_highlight"],
                    "has_shadow": physics_res["has_shadow"],
                    "shadow_length_px": physics_res["shadow_length_px"]
                }
            })

        # 4. Generate annotated visualization image
        annotated_bgr = apply_sonar_colormap(processed_gray, palette_name="copper")
        for d in final_detections:
            x1, y1, x2, y2 = d["bbox"]
            cv2.rectangle(annotated_bgr, (x1, y1), (x2, y2), (0, 230, 255), 2)
            label = f"{d['class_name']} ({d['confidence_percent']})"
            cv2.putText(annotated_bgr, label, (x1, max(15, y1 - 5)), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (0, 255, 255), 1)

        return {
            "detections_count": len(final_detections),
            "detections": final_detections,
            "image_shape": [h, w],
            "vessel_state": {
                "latitude": vessel_lat,
                "longitude": vessel_lon,
                "heading_deg": vessel_heading_deg
            }
        }

    def _heuristic_sonar_detector(self, gray: np.ndarray, thresh: float) -> List[Dict[str, Any]]:
        """
        Acoustic heuristic detector identifying high-contrast highlight-shadow pairs.
        """
        h, w = gray.shape
        detections = []

        # Threshold for strong acoustic reflections (highlights)
        _, highlight_mask = cv2.threshold(gray, 180, 255, cv2.THRESH_BINARY)
        contours, _ = cv2.findContours(highlight_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

        for cnt in contours:
            area = cv2.contourArea(cnt)
            if 150 < area < 40000:
                x, y, bw, bh = cv2.boundingRect(cnt)
                aspect = bw / float(bh)
                
                # Classify roughly based on morphology
                if aspect > 3.0 or aspect < 0.33:
                    cls_name = "submarine_pipeline"
                    cls_id = 1
                    conf = 0.72
                elif area > 5000:
                    cls_name = "shipwreck"
                    cls_id = 2
                    conf = 0.81
                elif 800 < area <= 5000 and (0.7 < aspect < 1.4):
                    cls_name = "ghost_net"
                    cls_id = 3
                    conf = 0.68
                else:
                    cls_name = "mine_cylinder"
                    cls_id = 4
                    conf = 0.64

                if conf >= thresh:
                    detections.append({
                        "bbox": [x, y, x + bw, y + bh],
                        "confidence": conf,
                        "class_id": cls_id,
                        "class_name": cls_name
                    })

        return detections[:15]  # Cap top candidate anomalies
