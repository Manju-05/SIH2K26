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
    def format_degrees(lat: float, lon: float) -> str:
        """Formats latitude and longitude into standard geodetic degree notation."""
        lat_dir = "N" if lat >= 0 else "S"
        lon_dir = "E" if lon >= 0 else "W"
        return f"{abs(lat):.6f}° {lat_dir}, {abs(lon):.6f}° {lon_dir}"

    @classmethod
    def to_geojson(cls, detections_data: Dict[str, Any], survey_name: str = "Sonar_Survey_Mission") -> Dict[str, Any]:
        """
        Converts detection results into a FeatureCollection GeoJSON.
        """
        features = []
        now_utc = datetime.now(timezone.utc).isoformat()
        survey_title = detections_data.get("survey_name", survey_name)

        for det in detections_data.get("detections", []):
            coords = det.get("coordinates", {})
            dims = det.get("dimensions", {})
            physics = det.get("acoustic_physics", {})
            
            lat = float(coords.get("latitude", 0.0))
            lon = float(coords.get("longitude", 0.0))
            conf_val = det.get("confidence", 0.0)
            conf_pct = det.get("confidence_percent", f"{int(conf_val * 100)}%")

            feature = {
                "type": "Feature",
                "geometry": {
                    "type": "Point",
                    "coordinates": [lon, lat]
                },
                "properties": {
                    "target_id": det.get("id", len(features) + 1),
                    "classification": det.get("class_name", "debris_anomaly"),
                    "confidence_score": conf_val,
                    "confidence_percent": conf_pct,
                    "latitude_deg": lat,
                    "longitude_deg": lon,
                    "geo_location_degrees": cls.format_degrees(lat, lon),
                    "length_m": dims.get("length_m", dims.get("estimated_length_m", 0.0)),
                    "width_m": dims.get("width_m", dims.get("estimated_width_m", 0.0)),
                    "height_m": dims.get("estimated_height_m", 0.0),
                    "area_m2": dims.get("estimated_area_m2", 0.0),
                    "has_shadow": physics.get("has_shadow", False),
                    "detected_at": now_utc
                }
            }
            features.append(feature)

        return {
            "type": "FeatureCollection",
            "metadata": {
                "survey_name": survey_title,
                "total_targets_detected": len(features),
                "generated_at": now_utc,
                "sensor_type": "Side-Scan Sonar (SSS)",
                "system": "FlowNex AI-Powered Marine Debris Detector (SIH26057)"
            },
            "features": features
        }

    @classmethod
    def to_csv_string(cls, detections_data: Dict[str, Any]) -> str:
        """
        Converts detections into a clean CSV string for export with Geo Location in Degrees.
        """
        output = io.StringIO()
        writer = csv.writer(output)
        
        # Header
        writer.writerow([
            "Target ID", "Classification", "Confidence",
            "Latitude", "Longitude", "Geo Location (Degrees)",
            "Cross-Track Offset (m)", "Along-Track Offset (m)",
            "Length (m)", "Width (m)", "Est Height (m)", "Area (m2)", "Acoustic Shadow Verified"
        ])

        for idx, det in enumerate(detections_data.get("detections", []), 1):
            coords = det.get("coordinates", {})
            dims = det.get("dimensions", {})
            physics = det.get("acoustic_physics", {})
            
            lat = float(coords.get("latitude", 0.0))
            lon = float(coords.get("longitude", 0.0))
            conf_val = det.get("confidence", 0.0)
            conf_pct = det.get("confidence_percent", f"{int(conf_val * 100)}%")
            geo_degrees = coords.get("geo_location_degrees") or cls.format_degrees(lat, lon)

            writer.writerow([
                det.get("id", idx),
                det.get("class_name", "debris_anomaly"),
                conf_pct,
                f"{lat:.6f}",
                f"{lon:.6f}",
                geo_degrees,
                coords.get("cross_track_offset_m", 0.0),
                coords.get("along_track_offset_m", 0.0),
                dims.get("length_m", dims.get("estimated_length_m", 0.0)),
                dims.get("width_m", dims.get("estimated_width_m", 0.0)),
                dims.get("estimated_height_m", 0.0),
                dims.get("estimated_area_m2", 0.0),
                "YES" if physics.get("has_shadow", False) else "NO"
            ])

        return output.getvalue()
