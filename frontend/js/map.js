/**
 * SonarGISMap - Interactive Marine Bathymetry & Satellite GIS Map
 * FlowNex Marine Debris Classifier & Geolocation System (SIH26057)
 */

class SonarGISMap {
    constructor(elementId) {
        this.elementId = elementId;
        this.map = null;
        this.markersLayer = null;
        this.tracklineLayer = null;
        this.markersById = {};
        this.currentBaseLat = 13.0827;
        this.currentBaseLon = 80.3850;
        this.initMap();
    }

    initMap() {
        // Default: Offshore Bay of Bengal Deep-Sea Marine Shelf
        const defaultLat = 13.0827;
        const defaultLon = 80.3850;
        this.currentBaseLat = defaultLat;
        this.currentBaseLon = defaultLon;

        this.map = L.map(this.elementId, {
            center: [defaultLat, defaultLon],
            zoom: 14,
            zoomControl: true
        });

        // 1. CARTO Dark Matter (Primary Dark Hydrographic Swath - Perfect for Dark Mode & Deep Oceans)
        const darkOceanLayer = L.tileLayer(
            'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
            {
                attribution: '&copy; OpenStreetMap, &copy; CARTO',
                subdomains: 'abcd',
                maxZoom: 20
            }
        );

        // 2. Official ESRI World Ocean Bathymetry (NOAA & GEBCO Deep Ocean Seafloor)
        const esriOceanLayer = L.tileLayer(
            'https://server.arcgisonline.com/ArcGIS/rest/services/Ocean/World_Ocean_Base/MapServer/tile/{z}/{y}/{x}',
            {
                attribution: 'Tiles &copy; Esri &mdash; GEBCO, NOAA, National Geographic',
                maxNativeZoom: 13,
                maxZoom: 19
            }
        );

        // 3. CARTO Voyager Marine Navigational Chart
        const marineChartLayer = L.tileLayer(
            'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
            {
                attribution: '&copy; OpenStreetMap, &copy; CARTO',
                subdomains: 'abcd',
                maxZoom: 20
            }
        );

        // 4. OpenStreetMap Nautical Grid
        const osmLayer = L.tileLayer(
            'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
            {
                attribution: '&copy; OpenStreetMap contributors',
                maxZoom: 19
            }
        );

        // Default to Dark Hydrographic Swath (matches FlowNex UI perfectly with zero missing tiles)
        darkOceanLayer.addTo(this.map);

        // Layer Switcher Control (Top Right)
        const baseMaps = {
            "🌊 Dark Hydrographic": darkOceanLayer,
            "🌐 Ocean Bathymetry (NOAA)": esriOceanLayer,
            "🗺️ Marine Chart": marineChartLayer,
            "🌍 OpenStreetMap": osmLayer
        };
        L.control.layers(baseMaps, null, { position: 'topright' }).addTo(this.map);

        // Ensure map renders properly on load
        setTimeout(() => {
            if (this.map) this.map.invalidateSize();
        }, 150);

        this.markersLayer = L.layerGroup().addTo(this.map);
        this.tracklineLayer = L.layerGroup().addTo(this.map);

        // Click anywhere on map to dynamically set survey location
        this.map.on('click', (e) => {
            const lat = e.latlng.lat;
            const lon = e.latlng.lng;
            if (window.onMapLocationSelected) {
                window.onMapLocationSelected(lat, lon);
            }
        });

        // Mouse hover on map shows live coordinates in indicator
        this.map.on('mousemove', (e) => {
            const mapCoordsEl = document.getElementById("map-coords-indicator");
            if (mapCoordsEl) {
                const latDir = e.latlng.lat >= 0 ? "N" : "S";
                const lonDir = e.latlng.lng >= 0 ? "E" : "W";
                mapCoordsEl.textContent = `${Math.abs(e.latlng.lat).toFixed(6)}° ${latDir}, ${Math.abs(e.latlng.lng).toFixed(6)}° ${lonDir}`;
            }
        });

        // Plot initial survey origin
        this.plotVessel(defaultLat, defaultLon, 45.0);
    }

    plotVessel(lat, lon, heading) {
        this.currentBaseLat = lat;
        this.currentBaseLon = lon;

        const vesselIcon = L.divIcon({
            className: 'vessel-marker',
            html: `<div style="transform: rotate(${heading}deg); color: #38bdf8; font-size: 16px; text-shadow: 0 0 8px #0284c7; cursor: pointer;" title="Survey Origin (AUV Sonar)">▲</div>`,
            iconSize: [22, 22],
            iconAnchor: [11, 11]
        });

        const latDir = lat >= 0 ? "N" : "S";
        const lonDir = lon >= 0 ? "E" : "W";
        const degStr = `${Math.abs(lat).toFixed(6)}° ${latDir}, ${Math.abs(lon).toFixed(6)}° ${lonDir}`;

        L.marker([lat, lon], { icon: vesselIcon })
            .bindPopup(`
                <div style="font-family: sans-serif; min-width: 180px; padding: 2px;">
                    <h4 style="margin: 0 0 4px 0; color: #38bdf8; font-size: 12px; font-weight: bold;">🚢 AUV SURVEY TRANSECT ORIGIN</h4>
                    <p style="margin: 2px 0; font-size: 11px; color: #94a3b8;"><b>Geo Location:</b> ${degStr}</p>
                    <p style="margin: 2px 0; font-size: 11px; color: #94a3b8;"><b>Course Heading:</b> ${heading.toFixed(1)}° True North</p>
                </div>
            `)
            .addTo(this.tracklineLayer);
    }

    updateDetections(detections, baseLat, baseLon, heading = 45.0) {
        if (this.map) {
            this.map.invalidateSize();
        }

        this.markersLayer.clearLayers();
        this.tracklineLayer.clearLayers();
        this.markersById = {};

        this.plotVessel(baseLat, baseLon, heading);

        if (!detections || detections.length === 0) {
            this.map.setView([baseLat, baseLon], 14);
            return;
        }

        const latLngs = [[baseLat, baseLon]];

        detections.forEach((det, idx) => {
            const coords = det.coordinates || {};
            const dims = det.dimensions || {};
            const lat = coords.latitude || baseLat;
            const lon = coords.longitude || baseLon;
            const geoDeg = coords.geo_location_degrees || `${Math.abs(lat).toFixed(6)}° ${lat >= 0 ? 'N' : 'S'}, ${Math.abs(lon).toFixed(6)}° ${lon >= 0 ? 'E' : 'W'}`;
            latLngs.push([lat, lon]);

            const markerColor = det.color || "#38bdf8";
            const icons = {
                "shipwreck": "🚢",
                "ghost_net": "🕸️",
                "submarine_pipeline": "📏",
                "mine_cylinder": "💣",
                "crab_pot": "🦀"
            };
            const iconSymbol = icons[det.class_name] || "⚠️";

            const customIcon = L.divIcon({
                className: 'anomaly-marker',
                html: `
                    <div style="position: relative; display: flex; align-items: center; justify-content: center; width: 30px; height: 30px; background: ${markerColor}30; border: 2px solid ${markerColor}; border-radius: 50%; box-shadow: 0 0 14px ${markerColor}; font-size: 14px; cursor: pointer; transition: transform 0.2s;">
                        ${iconSymbol}
                    </div>
                `,
                iconSize: [30, 30],
                iconAnchor: [15, 15]
            });

            const popupContent = `
                <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 11px; color: #0f172a; padding: 2px 4px; min-width: 150px;">
                    <div style="font-weight: 700; margin-bottom: 3px; font-size: 12px;">Target: <span style="text-transform: uppercase; color: #0f172a;">${det.class_name.replace('_', ' ')}</span></div>
                    <div style="font-weight: 600; margin-bottom: 3px; color: #334155;">Confidence: <span style="color: #16a34a; font-weight: 700;">${det.confidence_percent}</span></div>
                    <div style="font-weight: 500; color: #475569; margin-bottom: 4px;">Size: <span style="font-family: monospace; color: #0284c7; font-weight: 600;">${dims.length_m || 100} × ${dims.width_m || 20}</span></div>
                    <div style="font-family: monospace; font-size: 10px; color: #64748b; border-top: 1px solid #e2e8f0; padding-top: 3px;">${geoDeg}</div>
                </div>
            `;

            const marker = L.marker([lat, lon], { icon: customIcon })
                .bindPopup(popupContent)
                .addTo(this.markersLayer);

            this.markersById[det.id] = marker;

            // Auto-open popup on top primary detection
            if (idx === 0) {
                marker.openPopup();
            }
        });

        // Center view on detected targets
        if (latLngs.length > 2) {
            const bounds = L.latLngBounds(latLngs);
            this.map.fitBounds(bounds, { padding: [40, 40], maxZoom: 16 });
        } else if (latLngs.length === 2) {
            this.map.setView(latLngs[1], 15);
        } else {
            this.map.setView([baseLat, baseLon], 14);
        }
    }

    focusTarget(targetId, lat, lon) {
        if (!this.map) return;
        this.map.setView([lat, lon], 16, { animate: true });
        const marker = this.markersById[targetId];
        if (marker) {
            marker.openPopup();
        }
    }

    resetView() {
        if (!this.map) return;
        this.map.setView([this.currentBaseLat, this.currentBaseLon], 14, { animate: true });
    }
}
