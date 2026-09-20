/**
 * Leaflet GIS Bathymetry Map & Trackline Controller
 */

class SonarGISMap {
    constructor(elementId) {
        this.elementId = elementId;
        this.map = null;
        this.markersLayer = null;
        this.tracklineLayer = null;
        this.initMap();
    }

    initMap() {
        // Center around coastal Bay of Bengal / NIOT Chennai survey zone
        const defaultLat = 12.9234;
        const defaultLon = 80.2451;

        this.map = L.map(this.elementId, {
            center: [defaultLat, defaultLon],
            zoom: 14,
            zoomControl: true
        });

        // CARTO Basemap with Authenticated API Key
        const cartoApiKey = "cb1_3r3z_1_0c689e3dc112e007946954b3";
        L.tileLayer(`https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png?key=${cartoApiKey}`, {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>, &copy; <a href="https://carto.com/attributions">CARTO</a>',
            subdomains: 'abcd',
            maxZoom: 20
        }).addTo(this.map);

        this.markersLayer = L.layerGroup().addTo(this.map);
        this.tracklineLayer = L.layerGroup().addTo(this.map);

        // Plot initial AUV base marker
        this.plotVessel(defaultLat, defaultLon, 45.0);
    }

    plotVessel(lat, lon, heading) {
        const vesselIcon = L.divIcon({
            className: 'vessel-marker',
            html: `<div style="transform: rotate(${heading}deg); color: #38bdf8; font-size: 20px;">▲</div>`,
            iconSize: [24, 24],
            iconAnchor: [12, 12]
        });

        L.marker([lat, lon], { icon: vesselIcon })
            .bindPopup(`<b>AUV Sonar Tow-Fish</b><br>Lat: ${lat.toFixed(4)}<br>Lon: ${lon.toFixed(4)}<br>Heading: ${heading}°`)
            .addTo(this.tracklineLayer);
    }

    updateDetections(detections, baseLat, baseLon, heading) {
        this.markersLayer.clearLayers();
        this.tracklineLayer.clearLayers();

        this.plotVessel(baseLat, baseLon, heading);

        if (!detections || detections.length === 0) return;

        const latLngs = [[baseLat, baseLon]];

        detections.forEach(det => {
            const coords = det.coordinates;
            const dims = det.dimensions;
            const lat = coords.latitude;
            const lon = coords.longitude;
            latLngs.push([lat, lon]);

            // Custom colored pin
            const markerColor = det.color || "#38bdf8";
            const customIcon = L.divIcon({
                className: 'anomaly-marker',
                html: `<div style="background-color: ${markerColor}; width: 14px; height: 14px; border-radius: 50%; border: 2px solid #ffffff; box-shadow: 0 0 10px ${markerColor};"></div>`,
                iconSize: [16, 16],
                iconAnchor: [8, 8]
            });

            const popupContent = `
                <div style="font-family: sans-serif; min-width: 180px;">
                    <h4 style="margin: 0 0 4px 0; color: ${markerColor}; text-transform: uppercase;">${det.class_name}</h4>
                    <p style="margin: 2px 0; font-size: 12px;"><b>Confidence:</b> ${det.confidence_percent}</p>
                    <p style="margin: 2px 0; font-size: 12px;"><b>Location:</b> ${lat.toFixed(6)}, ${lon.toFixed(6)}</p>
                    <p style="margin: 2px 0; font-size: 12px;"><b>Size:</b> ${dims.length_m}m × ${dims.width_m}m (H: ${dims.estimated_height_m}m)</p>
                    <p style="margin: 2px 0; font-size: 12px;"><b>Acoustic Shadow:</b> ${det.acoustic_physics.has_shadow ? '✅ Verified' : '❌ Unverified'}</p>
                </div>
            `;

            L.marker([lat, lon], { icon: customIcon })
                .bindPopup(popupContent)
                .addTo(this.markersLayer);
        });

        // Fit map bounds to encompass all anomalies
        if (latLngs.length > 1) {
            const bounds = L.latLngBounds(latLngs);
            this.map.fitBounds(bounds, { padding: [40, 40] });
        }
    }
}
