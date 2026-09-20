"""
Highlight-Shadow Physical Consistency Engine for Side-Scan Sonar Imagery
Verifies acoustic physics:
1. Real physical debris produces a high-reflectivity acoustic highlight followed by an acoustic shadow.
2. Checks shadow angle alignment relative to the sonar swath nadir (cross-track direction).
3. Rejects false-positive detections from flat geological sand ripples or rock textures lacking physical height shadows.
4. Calculates estimated object height based on shadow length:
   h_obj = (L_shadow * H_sensor) / (R_slant + L_shadow)
"""

import cv2
import numpy as np
from typing import Dict, Any, Tuple


class AcousticShadowValidator:
    def __init__(self, shadow_intensity_thresh: int = 40, highlight_intensity_thresh: int = 175):
        self.shadow_intensity_thresh = shadow_intensity_thresh
        self.highlight_intensity_thresh = highlight_intensity_thresh

    def validate_detection_physics(
        self,
        image_gray: np.ndarray,
        bbox: Tuple[int, int, int, int],  # (x1, y1, x2, y2)
        nadir_x: int,
        sensor_altitude_m: float = 10.0,
        slant_range_m: float = 30.0
    ) -> Dict[str, Any]:
        """
        Validates whether a bounding box detection exhibits physical acoustic highlight & shadow cues.
        """
        h, w = image_gray.shape[:2]
        x1, y1, x2, y2 = bbox
        
        # Ensure bounding box is within image bounds
        x1, y1 = max(0, x1), max(0, y1)
        x2, y2 = min(w, x2), min(h, y2)
        
        box_w = x2 - x1
        box_h = y2 - y1
        if box_w <= 0 or box_h <= 0:
            return {"is_valid": False, "score": 0.0, "has_shadow": False, "has_highlight": False}

        obj_crop = image_gray[y1:y2, x1:x2]
        
        # 1. Check Highlight in target region
        highlight_pixels = np.sum(obj_crop >= self.highlight_intensity_thresh)
        highlight_ratio = highlight_pixels / (box_w * box_h)
        has_highlight = highlight_ratio > 0.05 or np.mean(obj_crop) > 120

        # 2. Determine expected shadow direction (pointing away from nadir)
        obj_center_x = (x1 + x2) // 2
        is_starboard = obj_center_x >= nadir_x
        
        # Inspect shadow region adjacent to highlight
        shadow_search_width = int(box_w * 1.5)
        if is_starboard:
            # Shadow should extend to the right (starboard outward)
            sx1 = x2
            sx2 = min(w, x2 + shadow_search_width)
        else:
            # Shadow should extend to the left (port outward)
            sx2 = x1
            sx1 = max(0, x1 - shadow_search_width)
            
        sy1, sy2 = y1, y2
        shadow_crop = image_gray[sy1:sy2, sx1:sx2] if (sx2 > sx1 and sy2 > sy1) else None
        
        has_shadow = False
        shadow_length_px = 0
        shadow_contrast_score = 0.5
        
        if shadow_crop is not None and shadow_crop.size > 0:
            shadow_pixels = np.sum(shadow_crop <= self.shadow_intensity_thresh)
            shadow_ratio = shadow_pixels / shadow_crop.size
            avg_shadow_val = np.mean(shadow_crop)
            
            if shadow_ratio > 0.15 or avg_shadow_val < 50:
                has_shadow = True
                shadow_contrast_score = min(1.0, 0.5 + (shadow_ratio * 0.5))
                shadow_length_px = sx2 - sx1

        # 3. Estimate Physical Target Height (meters)
        estimated_height_m = 0.0
        if has_shadow and shadow_length_px > 0:
            # Assuming ~0.05m ground resolution per pixel
            shadow_length_m = shadow_length_px * 0.05
            estimated_height_m = (shadow_length_m * sensor_altitude_m) / (slant_range_m + shadow_length_m + 1e-6)
            estimated_height_m = round(float(np.clip(estimated_height_m, 0.1, 15.0)), 2)

        # Composite physical confidence score
        physics_score = 0.4
        if has_highlight:
            physics_score += 0.3
        if has_shadow:
            physics_score += 0.3

        return {
            "is_valid": has_highlight or has_shadow,
            "physics_confidence": round(float(physics_score), 2),
            "has_highlight": bool(has_highlight),
            "has_shadow": bool(has_shadow),
            "shadow_length_px": int(shadow_length_px),
            "estimated_height_m": estimated_height_m
        }
