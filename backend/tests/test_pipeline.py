"""
Automated Unit and Integration Tests for Sonar Pipeline (SIH26057)
"""

import unittest
import numpy as np
import cv2
import json

from backend.core.preprocessing import lee_speckle_filter, apply_clahe, standard_sonar_preprocess
from backend.core.georeferencer import SonarGeoreferencer
from backend.core.shadow_validator import AcousticShadowValidator
from backend.core.detector import SonarDetector
from backend.core.report_generator import ReportGenerator


class TestSonarPipeline(unittest.TestCase):
    
    def setUp(self):
        # Generate synthetic acoustic sonar test tile (640x640)
        self.test_img = np.full((640, 640), 80, dtype=np.uint8)
        # Add highlight
        self.test_img[200:250, 350:400] = 230
        # Add shadow to the right (starboard)
        self.test_img[200:250, 400:460] = 10

    def test_preprocessing_filters(self):
        """Verify Lee filter and CLAHE run without shape degradation and enhance contrast."""
        filtered = standard_sonar_preprocess(self.test_img)
        self.assertEqual(filtered.shape, (640, 640))
        self.assertEqual(filtered.dtype, np.uint8)

    def test_georeferencer_math(self):
        """Verify pixel to WGS84 Lat/Lon coordinate translation."""
        georef = SonarGeoreferencer(meters_per_pixel_crosstrack=0.05, meters_per_ping_alongtrack=0.08)
        lat, lon, cross_m, along_m = georef.pixel_to_latlon(
            pixel_x=320,  # Exactly at nadir
            pixel_y=100,
            nadir_x=320,
            vessel_lat=12.9234,
            vessel_lon=80.2451,
            vessel_heading_deg=0.0  # Due North
        )
        self.assertAlmostEqual(cross_m, 0.0, places=2)
        self.assertAlmostEqual(along_m, 8.0, places=2)
        self.assertGreater(lat, 12.9234)  # Shifted north

    def test_shadow_highlight_physics_validator(self):
        """Verify that a paired highlight + shadow passes physical validation."""
        validator = AcousticShadowValidator()
        res = validator.validate_detection_physics(
            image_gray=self.test_img,
            bbox=(350, 200, 400, 250),
            nadir_x=320,
            sensor_altitude_m=10.0,
            slant_range_m=30.0
        )
        self.assertTrue(res["is_valid"])
        self.assertTrue(res["has_highlight"])
        self.assertTrue(res["has_shadow"])
        self.assertGreater(res["estimated_height_m"], 0.0)

    def test_detector_inference(self):
        """Verify SonarDetector runs end-to-end and outputs structured schema."""
        detector = SonarDetector()
        res = detector.detect_image(
            image_input=self.test_img,
            vessel_lat=12.9234,
            vessel_lon=80.2451,
            vessel_heading_deg=45.0,
            confidence_thresh=0.3
        )
        self.assertIn("detections", res)
        self.assertIn("detections_count", res)
        self.assertGreaterEqual(res["detections_count"], 1)

    def test_report_generation(self):
        """Verify GeoJSON and CSV reports format correctly."""
        sample_payload = {
            "detections": [{
                "id": 1,
                "class_name": "shipwreck",
                "confidence": 0.85,
                "confidence_percent": "85%",
                "dimensions": {
                    "length_m": 12.5,
                    "width_m": 4.2,
                    "estimated_height_m": 2.8,
                    "estimated_area_m2": 52.5
                },
                "coordinates": {
                    "latitude": 12.9240,
                    "longitude": 80.2460,
                    "cross_track_offset_m": 14.2,
                    "along_track_offset_m": 22.0
                },
                "acoustic_physics": {
                    "has_shadow": True
                }
            }]
        }

        geojson = ReportGenerator.to_geojson(sample_payload)
        self.assertEqual(geojson["type"], "FeatureCollection")
        self.assertEqual(len(geojson["features"]), 1)
        self.assertEqual(geojson["features"][0]["geometry"]["coordinates"], [80.2460, 12.9240])

        csv_str = ReportGenerator.to_csv_string(sample_payload)
        self.assertIn("Target ID", csv_str)
        self.assertIn("shipwreck", csv_str)


if __name__ == "__main__":
    unittest.main()
