"""
Georeferencing & Sonar Target Localization Engine
Translates pixel coordinates from Side-Scan Sonar waterfall logs into real-world WGS84 Geographic Coordinates (Lat/Long).
Calculates real physical object dimensions (Length, Width, Area).
"""

import math
from typing import Dict, Any, Tuple


class SonarGeoreferencer:
    def __init__(self, meters_per_pixel_crosstrack: float = 0.05, meters_per_ping_alongtrack: float = 0.08):
        """
        :param meters_per_pixel_crosstrack: Ground-range resolution across the sonar swath (e.g. 5 cm / px).
        :param meters_per_ping_alongtrack: Distance traveled along vessel track per ping row.
        """
        self.dx = meters_per_pixel_crosstrack
        self.dy = meters_per_ping_alongtrack
        self.EARTH_RADIUS_M = 6378137.0

    def pixel_to_latlon(
        self,
        pixel_x: int,
        pixel_y: int,
        nadir_x: int,
        vessel_lat: float,
        vessel_lon: float,
        vessel_heading_deg: float,
        nadir_y: int = 0
    ) -> Tuple[float, float, float, float]:
        """
        Computes the target Latitude & Longitude given vessel state and ping pixel coordinates.
        Returns: (target_lat, target_lon, cross_track_dist_m, along_track_dist_m)
        """
        # Cross-track offset (negative = Port / Left, positive = Starboard / Right)
        cross_track_m = (pixel_x - nadir_x) * self.dx
        along_track_m = (nadir_y - pixel_y) * self.dy if nadir_y > 0 else (pixel_y * self.dy)

        # Convert vessel heading to radians
        heading_rad = math.radians(vessel_heading_deg)

        # Starboard perpendicular direction is heading + 90 deg
        starboard_rad = heading_rad + (math.pi / 2.0)

        # Total displacement in North and East directions (meters)
        d_north = (along_track_m * math.cos(heading_rad)) + (cross_track_m * math.cos(starboard_rad))
        d_east = (along_track_m * math.sin(heading_rad)) + (cross_track_m * math.sin(starboard_rad))

        # Coordinate offsets in degrees
        d_lat = (d_north / self.EARTH_RADIUS_M) * (180.0 / math.pi)
        d_lon = (d_east / (self.EARTH_RADIUS_M * math.cos(math.radians(vessel_lat)))) * (180.0 / math.pi)

        target_lat = vessel_lat + d_lat
        target_lon = vessel_lon + d_lon

        return target_lat, target_lon, cross_track_m, along_track_m

    def compute_physical_dimensions(
        self,
        bbox_width_px: int,
        bbox_height_px: int
    ) -> Dict[str, float]:
        """
        Computes physical size (Length, Width, Area in meters).
        """
        width_m = round(bbox_width_px * self.dx, 2)
        length_m = round(bbox_height_px * self.dy, 2)
        area_m2 = round(width_m * length_m, 2)
        return {
            "width_m": width_m,
            "length_m": length_m,
            "estimated_area_m2": area_m2
        }
