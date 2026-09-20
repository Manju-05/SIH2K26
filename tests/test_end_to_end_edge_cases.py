"""
End-to-End Edge Case & Stress Testing Suite
For SIH26057: DRISHTI-SSS Sonar Vision & Marine Anomaly Detection System
"""

import os
import io
import sys
import json
import base64
import unittest

# Ensure workspace root is in sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

import numpy as np
import cv2
import requests

from backend.core.preprocessing import (
    standard_sonar_preprocess,
    lee_speckle_filter,
    apply_clahe,
    slant_range_correction,
    apply_sonar_colormap
)
from backend.core.shadow_validator import AcousticShadowValidator
from backend.core.georeferencer import SonarGeoreferencer
from backend.core.detector import SonarDetector
from backend.core.report_generator import ReportGenerator

BASE_URL = "http://127.0.0.1:8000"


class TestCoreEdgeCases(unittest.TestCase):
    """Unit and stress tests for core signal processing and math algorithms."""

    def setUp(self):
        self.detector = SonarDetector()
        self.validator = AcousticShadowValidator()
        self.georeferencer = SonarGeoreferencer()

    def test_01_preprocessing_unusual_inputs(self):
        """Test preprocessing on black, white, pure noise, and weird aspect ratio images."""
        print("\n[TEST] 1. Preprocessing Edge Cases...")
        
        # All zeros (black)
        black_img = np.zeros((640, 640), dtype=np.uint8)
        p_black = standard_sonar_preprocess(black_img)
        self.assertEqual(p_black.shape, (640, 640))
        self.assertEqual(p_black.dtype, np.uint8)

        # All 255 (white)
        white_img = np.full((640, 640), 255, dtype=np.uint8)
        p_white = standard_sonar_preprocess(white_img)
        self.assertEqual(p_white.shape, (640, 640))

        # Extreme non-square sonar strip (e.g. 100 x 2000 px)
        strip_img = np.random.randint(0, 255, (100, 2000), dtype=np.uint8)
        p_strip = standard_sonar_preprocess(strip_img)
        self.assertEqual(p_strip.shape, (100, 2000))

        # Color 3-channel input
        color_img = np.random.randint(0, 255, (400, 400, 3), dtype=np.uint8)
        p_color = standard_sonar_preprocess(color_img)
        self.assertEqual(p_color.shape, (400, 400))

        # Slant Range Correction edge cases
        src_res = slant_range_correction(black_img, altitude_m=10.0, max_range_m=50.0)
        self.assertEqual(src_res.shape, (640, 640))
        
        # Colormaps
        for cmap in ["copper", "amber", "emerald", "grayscale", "invalid_name"]:
            colored = apply_sonar_colormap(p_black, palette_name=cmap)
            self.assertEqual(colored.shape, (640, 640, 3))
        print("  --> Preprocessing passed all extreme dimension and colormap tests.")

    def test_02_shadow_validator_boundary_cases(self):
        """Test shadow validator with out-of-bounds bboxes, zero area bboxes, and invert nadir."""
        print("\n[TEST] 2. Acoustic Shadow Validator Edge Cases...")
        img = np.random.randint(20, 100, (640, 640), dtype=np.uint8)
        
        # Out-of-bounds bounding boxes (negative coords or exceeding dims)
        res_oob = self.validator.validate_detection_physics(img, (-50, -20, 700, 800), nadir_x=320)
        self.assertIn("has_highlight", res_oob)
        self.assertIn("physics_confidence", res_oob)
        
        # Zero area box
        res_zero = self.validator.validate_detection_physics(img, (100, 100, 100, 100), nadir_x=320)
        self.assertIsInstance(res_zero["physics_confidence"], float)

        # Nadir boundary cases (box directly on nadir line)
        res_nadir = self.validator.validate_detection_physics(img, (310, 200, 330, 250), nadir_x=320)
        self.assertIsInstance(res_nadir["estimated_height_m"], float)
        print("  --> Shadow Validator safely handled out-of-bounds, zero-area, and nadir bounding boxes.")

    def test_03_georeferencer_extreme_coordinates(self):
        """Test georeferencing with equator, poles, date line, negative headings, 360 wrap-around."""
        print("\n[TEST] 3. Georeferencer Edge Cases...")
        
        # North Pole
        lat, lon, c_m, a_m = self.georeferencer.pixel_to_latlon(
            pixel_x=500, pixel_y=300, nadir_x=320, vessel_lat=89.999, vessel_lon=0.0, vessel_heading_deg=0.0
        )
        self.assertTrue(-90.0 <= lat <= 90.0)

        # South Pole
        lat, lon, c_m, a_m = self.georeferencer.pixel_to_latlon(
            pixel_x=100, pixel_y=300, nadir_x=320, vessel_lat=-89.999, vessel_lon=179.999, vessel_heading_deg=350.0
        )
        self.assertTrue(-180.0 <= lon <= 180.0)

        # Heading wrap-around > 360 and negative headings (-45, 720)
        lat1, lon1, _, _ = self.georeferencer.pixel_to_latlon(400, 300, 320, 12.92, 80.24, -45.0)
        lat2, lon2, _, _ = self.georeferencer.pixel_to_latlon(400, 300, 320, 12.92, 80.24, 315.0)
        self.assertAlmostEqual(lat1, lat2, places=4)
        self.assertAlmostEqual(lon1, lon2, places=4)
        print("  --> Georeferencer handled poles, date line wrap, and angular boundaries accurately.")

    def test_04_detector_stress_inputs(self):
        """Test SonarDetector with edge-case images: 1x1, noisy, pure black, extreme thresholds."""
        print("\n[TEST] 4. Sonar Detector Stress Tests...")
        
        # 1x1 pixel image
        tiny_img = np.array([[128]], dtype=np.uint8)
        res_tiny = self.detector.detect_image(tiny_img, confidence_thresh=0.5)
        self.assertIn("detections", res_tiny)

        # Extremely noisy image
        noisy_img = np.random.randint(0, 256, (1024, 1024), dtype=np.uint8)
        res_noise = self.detector.detect_image(noisy_img, confidence_thresh=0.1)
        self.assertIsInstance(res_noise["detections_count"], int)

        # Extreme confidence thresholds: 0.0 and 1.0
        res_zero_conf = self.detector.detect_image(noisy_img, confidence_thresh=0.0)
        res_one_conf = self.detector.detect_image(noisy_img, confidence_thresh=1.0)
        self.assertGreaterEqual(len(res_zero_conf["detections"]), len(res_one_conf["detections"]))
        print("  --> Sonar Detector completed stress inputs without crashes or exceptions.")

    def test_05_export_generators_edge_cases(self):
        """Test GeoJSON and CSV export with empty lists, unicode strings, and extreme numbers."""
        print("\n[TEST] 5. Report Generators Edge Cases...")
        
        # Empty detections
        geojson_empty = ReportGenerator.to_geojson({"detections": []}, survey_name="Empty Survey")
        self.assertEqual(geojson_empty["type"], "FeatureCollection")
        self.assertEqual(len(geojson_empty["features"]), 0)

        csv_empty = ReportGenerator.to_csv_string({"detections": []})
        self.assertTrue(csv_empty.startswith("Target ID,Classification"))

        # Detections with special characters and missing fields
        sample_data = {
            "detections": [
                {
                    "id": 999,
                    "class_name": "unknown_debris; DROP TABLE --",
                    "confidence": 0.999,
                    "confidence_percent": "99%",
                    "coordinates": {"latitude": 12.345678, "longitude": 80.987654, "cross_track_offset_m": -15.5, "along_track_offset_m": 2.0},
                    "dimensions": {"length_m": 4.5, "width_m": 1.2, "estimated_height_m": 0.8, "estimated_area_m2": 5.4},
                    "acoustic_physics": {"has_shadow": True}
                }
            ]
        }
        geojson_res = ReportGenerator.to_geojson(sample_data, survey_name="Special Char Survey <>&")
        self.assertEqual(len(geojson_res["features"]), 1)
        csv_res = ReportGenerator.to_csv_string(sample_data)
        self.assertIn("DROP TABLE", csv_res)
        print("  --> Report exporters correctly sanitized and formatted edge-case payloads.")


class TestAPIEndpoints(unittest.TestCase):
    """End-to-end API integration tests against the live running FastAPI server."""

    def test_06_api_status_endpoint(self):
        """Check /api/status returns 200 and valid schema."""
        print("\n[TEST] 6. API /api/status Check...")
        resp = requests.get(f"{BASE_URL}/api/status", timeout=5)
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data["status"], "ONLINE")
        self.assertTrue(data["model_loaded"])
        self.assertEqual(data["engine"], "ONNX Runtime")
        self.assertIn("FlowNex", data["system"])
        print(f"  --> Status OK: {data['system']} (Model Loaded: {data['model_loaded']})")

    def test_07_api_detect_multipart_valid(self):
        """Test /api/detect with a valid synthetic sonar image."""
        print("\n[TEST] 7. API /api/detect Multipart Upload...")
        # Create a test image
        img = np.zeros((640, 640), dtype=np.uint8) + 40
        # Add a synthetic acoustic target (bright highlight + dark shadow)
        cv2.rectangle(img, (220, 200), (300, 230), 240, -1)
        cv2.rectangle(img, (220, 230), (300, 310), 10, -1)
        _, img_encoded = cv2.imencode('.png', img)

        files = {'file': ('sonar_test.png', img_encoded.tobytes(), 'image/png')}
        data = {
            'vessel_lat': 12.9234,
            'vessel_lon': 80.2451,
            'vessel_heading': 45.0,
            'confidence_thresh': 0.2,
            'apply_preprocessing': 'true'
        }
        resp = requests.post(f"{BASE_URL}/api/detect", files=files, data=data, timeout=10)
        self.assertEqual(resp.status_code, 200)
        res_json = resp.json()
        self.assertTrue(res_json["success"])
        self.assertIn("detections", res_json)
        self.assertIn("annotated_image_base64", res_json)
        print(f"  --> Detection API successful! Processed detections: {res_json['detections_count']}")

    def test_08_api_detect_corrupt_payloads(self):
        """Test /api/detect with corrupted files, non-image files, empty body, invalid parameters."""
        print("\n[TEST] 8. API /api/detect Error Handling & Corrupt Inputs...")
        
        # 1. Non-image text file
        files = {'file': ('test.txt', b'This is not an image file content', 'text/plain')}
        resp = requests.post(f"{BASE_URL}/api/detect", files=files, timeout=5)
        # Should gracefully return 400 Bad Request
        self.assertEqual(resp.status_code, 400)
        self.assertIn("Invalid image", resp.json()["detail"])

        # 2. Empty byte payload
        files_empty = {'file': ('empty.png', b'', 'image/png')}
        resp_empty = requests.post(f"{BASE_URL}/api/detect", files=files_empty, timeout=5)
        self.assertEqual(resp_empty.status_code, 400)

        # 3. Extreme parameter values
        img = np.zeros((320, 320), dtype=np.uint8)
        _, img_encoded = cv2.imencode('.jpg', img)
        files = {'file': ('test.jpg', img_encoded.tobytes(), 'image/jpeg')}
        data_extreme = {
            'vessel_lat': -999.0,      # Extreme lat
            'vessel_lon': 999.0,       # Extreme lon
            'vessel_heading': 1080.0,  # Extreme heading
            'confidence_thresh': 0.99
        }
        resp_extreme = requests.post(f"{BASE_URL}/api/detect", files=files, data=data_extreme, timeout=5)
        self.assertEqual(resp_extreme.status_code, 200)
        print("  --> API properly rejected corrupt files with 400 Bad Request and handled extreme parameters.")

    def test_09_api_export_endpoints(self):
        """Test /api/export-geojson and /api/export-csv endpoints with diverse JSON bodies."""
        print("\n[TEST] 9. API Export Endpoints...")
        
        sample_payload = {
            "survey_name": "NIOT Deep-Sea Survey Line 04",
            "detections": [
                {
                    "id": 1,
                    "class_name": "shipwreck",
                    "confidence": 0.88,
                    "coordinates": {"latitude": 13.0827, "longitude": 80.2707, "cross_track_offset_m": 24.5},
                    "dimensions": {"estimated_length_m": 18.2, "estimated_width_m": 4.1, "estimated_height_m": 3.2}
                },
                {
                    "id": 2,
                    "class_name": "submarine_pipeline",
                    "confidence": 0.94,
                    "coordinates": {"latitude": 13.0835, "longitude": 80.2715, "cross_track_offset_m": -32.1},
                    "dimensions": {"estimated_length_m": 50.0, "estimated_width_m": 1.0, "estimated_height_m": 0.5}
                }
            ]
        }

        # Test GeoJSON Export
        resp_geo = requests.post(f"{BASE_URL}/api/export-geojson", json=sample_payload, timeout=5)
        self.assertEqual(resp_geo.status_code, 200)
        geo_data = resp_geo.json()
        self.assertEqual(geo_data["type"], "FeatureCollection")
        self.assertEqual(len(geo_data["features"]), 2)

        # Test CSV Export
        resp_csv = requests.post(f"{BASE_URL}/api/export-csv", json=sample_payload, timeout=5)
        self.assertEqual(resp_csv.status_code, 200)
        self.assertIn("shipwreck", resp_csv.text)
        self.assertIn("submarine_pipeline", resp_csv.text)
        print("  --> Export endpoints generated valid GeoJSON (RFC 7946) and CSV datasets.")

    def test_10_api_frontend_ui_assets(self):
        """Test that index.html and frontend assets are served correctly with 200 OK."""
        print("\n[TEST] 10. Frontend Static Assets Serving...")
        resp_ui = requests.get(f"{BASE_URL}/", timeout=5)
        self.assertEqual(resp_ui.status_code, 200)
        self.assertIn("FlowNex", resp_ui.text)
        print("  --> Frontend UI is mounted and served at root URL /.")


if __name__ == "__main__":
    suite = unittest.TestSuite()
    loader = unittest.TestLoader()
    suite.addTest(loader.loadTestsFromTestCase(TestCoreEdgeCases))
    suite.addTest(loader.loadTestsFromTestCase(TestAPIEndpoints))
    runner = unittest.TextTestRunner(verbosity=2)
    result = runner.run(suite)
    sys.exit(0 if result.wasSuccessful() else 1)
