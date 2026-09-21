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

        // 1. CARTO Voyager Marine Chart Basemap
        const cartoApiKey = "cb1_3r3z_1_0c689e3dc112e007946954b3";
        const marineChartLayer = L.tileLayer(
            `https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png?key=${cartoApiKey}`,
            {
                attribution: '&copy; OpenStreetMap, &copy; CARTO',
                subdomains: 'abcd',
                maxZoom: 20
            }
        );

        // 2. High-Resolution Ocean Satellite Imagery (ESRI World Imagery)
        const satelliteLayer = L.tileLayer(
            'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
            {
                attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community',
                maxZoom: 19
            }
        );

        // Default to Marine Chart
        marineChartLayer.addTo(this.map);

        // Layer Switcher Control (Top Right)
        const baseMaps = {
            "🗺️ Marine Chart": marineChartLayer,
            "🛰️ Ocean Satellite": satelliteLayer
        };
        L.control.layers(baseMaps, null, { position: 'topright' }).addTo(this.map);

        this.markersLayer = L.layerGroup().addTo(this.map);
        this.tracklineLayer = L.layerGroup().addTo(this.map);

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
                <div style="font-family: sans-serif; min-width: 220px; padding: 3px;">
                    <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 6px; border-bottom: 1px solid #334155; padding-bottom: 4px;">
                        <span style="font-size: 18px;">${iconSymbol}</span>
                        <div>
                            <h4 style="margin: 0; color: ${markerColor}; text-transform: uppercase; font-weight: bold; font-size: 13px;">#${det.id} ${det.class_name.replace('_', ' ')}</h4>
                            <span style="font-size: 10px; color: #94a3b8;">Target ID: SIH-TRG-${det.id}</span>
                        </div>
                    </div>
                    <p style="margin: 3px 0; font-size: 11px;"><b>Confidence:</b> <span style="color: #10b981; font-weight: bold;">${det.confidence_percent}</span></p>
                    <p style="margin: 3px 0; font-size: 11px; color: #0284c7;"><b>Geo Location:</b> <span style="font-family: monospace; font-weight: bold;">${geoDeg}</span></p>
                    <p style="margin: 3px 0; font-size: 11px;"><b>Dimensions:</b> ${dims.length_m || 0}m (L) × ${dims.width_m || 0}m (W) × ${dims.estimated_height_m || 0}m (H)</p>
                    <p style="margin: 3px 0; font-size: 11px; color: ${det.acoustic_physics && det.acoustic_physics.has_shadow ? '#10b981' : '#f59e0b'};">
                        <b>Acoustic Physics:</b> ${det.acoustic_physics && det.acoustic_physics.has_shadow ? '✅ Shadow Verified' : 'Specular Reflection'}
                    </p>
                    <div style="margin-top: 6px; padding-top: 4px; border-top: 1px dashed #334155;">
                        <button onclick="copyToClipboard('${geoDeg}')" style="background: #1e293b; border: 1px solid #475569; color: #38bdf8; font-size: 11px; padding: 2px 8px; border-radius: 4px; cursor: pointer; width: 100%;">
                            📋 Copy Lat / Lon Degrees
                        </button>
                    </div>
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
