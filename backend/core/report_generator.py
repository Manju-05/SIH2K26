"""
Report Generation & Structured Export Engine
Exports sonar debris detection results to:
1. GeoJSON (WGS84 format for GIS tools: QGIS, ArcGIS, Leaflet).
2. CSV (Actionable coordinate target list for cleanup & recovery vessels).
3. JSON Executive Mission Summary.
"""

import json
import csv
import io
from datetime import datetime, timezone
from typing import List, Dict, Any


class ReportGenerator:
    @staticmethod
    def to_geojson(detections_data: Dict[str, Any], survey_name: str = "Sonar_Survey_Mission") -> Dict[str, Any]:
        """
        Converts detection results into a FeatureCollection GeoJSON.
        """
        features = []
        now_utc = datetime.now(timezone.utc).isoformat()
        for det in detections_data.get("detections", []):
            coords = det["coordinates"]
            feature = {
                "type": "Feature",
                "geometry": {
                    "type": "Point",
                    "coordinates": [coords["longitude"], coords["latitude"]]
                },
                "properties": {
                    "target_id": det["id"],
                    "classification": det["class_name"],
                    "confidence_score": det["confidence"],
                    "confidence_percent": det["confidence_percent"],
                    "length_m": det["dimensions"]["length_m"],
                    "width_m": det["dimensions"]["width_m"],
                    "height_m": det["dimensions"]["estimated_height_m"],
                    "area_m2": det["dimensions"]["estimated_area_m2"],
                    "has_shadow": det["acoustic_physics"]["has_shadow"],
                    "detected_at": now_utc
                }
            }
            features.append(feature)

        return {
            "type": "FeatureCollection",
            "metadata": {
                "survey_name": survey_name,
                "total_targets_detected": len(features),
                "generated_at": now_utc,
                "sensor_type": "Side-Scan Sonar (SSS)",
                "system": "AI-Powered Marine Debris Detector (SIH26057)"
            },
            "features": features
        }

    @staticmethod
    def to_csv_string(detections_data: Dict[str, Any]) -> str:
        """
        Converts detections into a clean CSV string for export.
        """
        output = io.StringIO()
        writer = csv.writer(output)
        
        # Header
        writer.writerow([
            "Target ID", "Classification", "Confidence", "Latitude", "Longitude",
            "Cross-Track Offset (m)", "Along-Track Offset (m)",
            "Length (m)", "Width (m)", "Est Height (m)", "Area (m2)", "Acoustic Shadow Verified"
        ])

        for det in detections_data.get("detections", []):
            coords = det["coordinates"]
            dims = det["dimensions"]
            physics = det["acoustic_physics"]
            writer.writerow([
                det["id"],
                det["class_name"],
                det["confidence_percent"],
                coords["latitude"],
                coords["longitude"],
                coords["cross_track_offset_m"],
                coords["along_track_offset_m"],
                dims["length_m"],
                dims["width_m"],
                dims["estimated_height_m"],
                dims["estimated_area_m2"],
                "YES" if physics["has_shadow"] else "NO"
            ])

        return output.getvalue()
