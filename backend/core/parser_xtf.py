"""
Native Sonar Survey Log Parser & Trackline Stream Processor
Supports:
1. Ingestion of raw Sonar Ping Navigation Streams (CSV / JSON / XTF log headers).
2. Continuous acoustic swath slicing into overlapping 640x640 analysis tiles.
3. Metadata synchronization: mapping tile coordinates back to precise ping GPS timestamps and heading.
4. Synthetic Hydrographic Survey Log Generator for offline demonstration.
"""

import os
import json
import csv
import io
import math
import numpy as np
from typing import List, Dict, Any, Generator, Tuple


class SonarLogParser:
    def __init__(self, tile_size: int = 640, tile_overlap: int = 64):
        self.tile_size = tile_size
        self.tile_overlap = tile_overlap

    def parse_csv_ping_stream(self, csv_content: str) -> List[Dict[str, Any]]:
        """
        Parses a hydrographic ping navigation CSV stream containing:
        ping_num, timestamp, lat, lon, heading, altitude_m, port_samples..., stbd_samples...
        """
        reader = csv.DictReader(io.StringIO(csv_content))
        pings = []
        for row in reader:
            ping_data = {
                "ping_id": int(row.get("ping_id", len(pings) + 1)),
                "timestamp": row.get("timestamp", ""),
                "latitude": float(row.get("latitude", 13.0827)),
                "longitude": float(row.get("longitude", 80.3850)),
                "heading": float(row.get("heading", 45.0)),
                "altitude_m": float(row.get("altitude_m", 10.0)),
                "speed_knots": float(row.get("speed_knots", 3.5))
            }
            pings.append(ping_data)
        return pings

    def slice_waterfall_to_tiles(
        self,
        waterfall_image: np.ndarray,
        pings_metadata: List[Dict[str, Any]]
    ) -> List[Dict[str, Any]]:
        """
        Slices a long continuous sonar waterfall strip into standard 640x640 tiles with metadata tags.
        """
        h, w = waterfall_image.shape[:2]
        step = self.tile_size - self.tile_overlap
        tiles = []

        for y in range(0, max(1, h - self.tile_size + 1), step):
            tile_crop = waterfall_image[y:y + self.tile_size, 0:w]
            
            # If width is not tile_size, pad or resize
            if tile_crop.shape[1] != self.tile_size or tile_crop.shape[0] != self.tile_size:
                tile_crop = cv2.resize(tile_crop, (self.tile_size, self.tile_size))

            # Associate metadata from the midpoint ping
            ping_idx = min(len(pings_metadata) - 1, max(0, y + (self.tile_size // 2)))
            ping_info = pings_metadata[ping_idx] if pings_metadata else {
                "latitude": 13.0827, "longitude": 80.3850, "heading": 45.0, "altitude_m": 10.0
            }

            tiles.append({
                "tile_index": len(tiles) + 1,
                "along_track_y_start": y,
                "along_track_y_end": y + self.tile_size,
                "tile_image": tile_crop,
                "nav_state": ping_info
            })

        return tiles

    @staticmethod
    def generate_synthetic_survey_mission(
        start_lat: float = 13.0827,
        start_lon: float = 80.3850,
        heading: float = 45.0,
        num_pings: int = 1200
    ) -> Tuple[str, np.ndarray]:
        """
        Generates a synthetic multi-kilometer SSS survey log with simulated seafloor pings and targets.
        Returns: (csv_navigation_log_string, waterfall_continuous_swath_image)
        """
        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow(["ping_id", "timestamp", "latitude", "longitude", "heading", "altitude_m", "speed_knots"])

        speed_m_s = 3.5 * 0.514444  # 3.5 knots to m/s
        dt = 0.1  # 10 Hz sonar ping rate
        heading_rad = math.radians(heading)
        earth_r = 6378137.0

        current_lat = start_lat
        current_lon = start_lon

        # Build continuous 2D acoustic swath (num_pings x 640 columns)
        waterfall = np.zeros((num_pings, 640), dtype=np.uint8)

        for i in range(num_pings):
            # Advance vessel position
            d_north = speed_m_s * dt * math.cos(heading_rad)
            d_east = speed_m_s * dt * math.sin(heading_rad)
            current_lat += (d_north / earth_r) * (180.0 / math.pi)
            current_lon += (d_east / (earth_r * math.cos(math.radians(current_lat)))) * (180.0 / math.pi)

            writer.writerow([
                i + 1,
                f"2026-09-20T10:{int(i*dt//60):02d}:{int(i*dt%60):02d}Z",
                f"{current_lat:.6f}",
                f"{current_lon:.6f}",
                f"{heading:.1f}",
                10.0,
                3.5
            ])

            # Simulated seafloor line with speckle and sand ripples
            row_vals = 70.0 + np.sin(np.arange(640) / 8.0 + (i / 15.0)) * 15.0 + np.random.exponential(scale=18.0, size=640)
            waterfall[i, :] = np.clip(row_vals, 0, 255).astype(np.uint8)
            # Nadir line
            waterfall[i, 318:322] = np.random.randint(10, 25, size=4)

        # Inject anomalies at specific pings
        # Target 1: Shipwreck at ping 300
        waterfall[280:330, 370:430] = 230  # Highlight
        waterfall[280:330, 430:510] = 12   # Shadow

        # Target 2: Ghost net at ping 800
        waterfall[780:830, 210:270] = 220  # Highlight
        waterfall[780:830, 150:210] = 15   # Shadow

        return output.getvalue(), waterfall
