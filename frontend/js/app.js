/**
 * FlowNex Sonar Debris Classifier & Geolocation Controller
 * Ministry of Earth Sciences (MoES) / NIOT - SIH26057
 */

let waterfallViewer = null;
let gisMap = null;
let currentDetectionsData = null;
let currentLoadedBlob = null;
let currentActivePreset = "shipwreck";

const DEBRIS_ICONS = {
    "shipwreck": "🚢",
    "ghost_net": "🕸️",
    "submarine_pipeline": "📏",
    "mine_cylinder": "💣",
    "clean_seabed": "🌊",
    "crab_pot": "🦀",
    "debris_anomaly": "⚠️"
};

const DEBRIS_TITLES = {
    "shipwreck": "SHIPWRECK (MARITIME WRECKAGE)",
    "ghost_net": "GHOST NET (ABANDONED FISHING GEAR)",
    "submarine_pipeline": "SUBMARINE PIPELINE (CORRIDOR)",
    "mine_cylinder": "MINE CYLINDER (ORDNANCE / UXO)",
    "clean_seabed": "NO DEBRIS DETECTED (NATURAL SEABED)"
};

// Verified realistic offshore marine survey sites
const SAMPLE_LOCATIONS = {
    "shipwreck": { lat: 13.082700, lon: 80.385000, desc: "Bay of Bengal Deep-Sea Shelf" },
    "ghost_net": { lat: 9.280000, lon: 79.180000, desc: "Gulf of Mannar Coral Reserve" },
    "submarine_pipeline": { lat: 13.250000, lon: 80.360000, desc: "Coromandel Offshore Utility" },
    "mine_cylinder": { lat: 11.680000, lon: 92.820000, desc: "Andaman Trench Deep-Sea" },
    "clean_seabed": { lat: 13.082700, lon: 80.385000, desc: "Bay of Bengal Calibration Area" }
};

let debounceTimer = null;
let hasCustomLocationSet = false;

document.addEventListener("DOMContentLoaded", () => {
    waterfallViewer = new SonarWaterfallViewer("waterfall-canvas");
    gisMap = new SonarGISMap("leaflet-map");

    // Register global map click callback
    window.onMapLocationSelected = (lat, lon) => {
        setDynamicSurveyLocation(lat, lon, "Map Click");
    };

    checkSystemStatus();
    setupEventListeners();
    setupKeyboardShortcuts();
    setupCanvasTelemetry();
    setupDragAndDrop();

    // Auto-load shipwreck sample on startup
    loadSampleScan("shipwreck", true);
});

function setupEventListeners() {
    // File Input Upload
    const fileInput = document.getElementById("file-input");
    if (fileInput) {
        fileInput.addEventListener("change", (e) => {
            if (e.target.files && e.target.files.length > 0) {
                handleUploadedFile(e.target.files[0]);
            }
        });
    }

    // Sensitivity Slider
    const slider = document.getElementById("conf-slider");
    const badge = document.getElementById("conf-val");
    if (slider && badge) {
        slider.addEventListener("input", (e) => {
            badge.textContent = `${e.target.value}%`;
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => {
                if (currentLoadedBlob) {
                    processSonarData(currentLoadedBlob);
                }
            }, 80);
        });
    }

    // Lat / Lon Inputs with immediate dynamic updates
    const latInput = document.getElementById("vessel-lat");
    const lonInput = document.getElementById("vessel-lon");
    [latInput, lonInput].forEach(inp => {
        if (inp) {
            const handleCoordChange = () => {
                hasCustomLocationSet = true;
                const newLat = parseFloat(latInput.value);
                const newLon = parseFloat(lonInput.value);
                if (!isNaN(newLat) && !isNaN(newLon)) {
                    recalculateAndRefreshCoordinates(newLat, newLon);
                    clearTimeout(debounceTimer);
                    debounceTimer = setTimeout(() => {
                        if (currentLoadedBlob) {
                            processSonarData(currentLoadedBlob);
                        }
                    }, 250);
                }
            };
            inp.addEventListener("input", handleCoordChange);
            inp.addEventListener("change", handleCoordChange);
        }
    });

    // Canvas click to select target & focus map
    const canvas = document.getElementById("waterfall-canvas");
    if (canvas) {
        canvas.addEventListener("click", (e) => {
            const rect = canvas.getBoundingClientRect();
            const scaleX = canvas.width / rect.width;
            const scaleY = canvas.height / rect.height;
            const clickX = (e.clientX - rect.left) * scaleX;
            const clickY = (e.clientY - rect.top) * scaleY;

            if (currentDetectionsData && currentDetectionsData.detections) {
                const clickedDet = currentDetectionsData.detections.find(d => {
                    const [x1, y1, x2, y2] = d.bbox;
                    return clickX >= x1 && clickX <= x2 && clickY >= y1 && clickY <= y2;
                });
                if (clickedDet && gisMap) {
                    const lat = clickedDet.coordinates.latitude;
                    const lon = clickedDet.coordinates.longitude;
                    gisMap.focusTarget(clickedDet.id, lat, lon);
                    highlightTableRow(clickedDet.id);
                }
            }
        });
    }
}

function setupDragAndDrop() {
    const dropZone = document.getElementById("drop-zone");
    if (!dropZone) return;

    ['dragenter', 'dragover'].forEach(eventName => {
        dropZone.addEventListener(eventName, (e) => {
            e.preventDefault();
            e.stopPropagation();
            dropZone.classList.add("border-[#38bdf8]", "bg-[#101e30]");
        });
    });

    ['dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, (e) => {
            e.preventDefault();
            e.stopPropagation();
            dropZone.classList.remove("border-[#38bdf8]", "bg-[#101e30]");
        });
    });

    dropZone.addEventListener("drop", (e) => {
        if (e.dataTransfer && e.dataTransfer.files.length > 0) {
            handleUploadedFile(e.dataTransfer.files[0]);
        }
    });
}

function setupKeyboardShortcuts() {
    window.addEventListener("keydown", (e) => {
        // Ignore if user is typing in an input
        if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;

        const key = e.key.toUpperCase();
        if (key === "1") loadSampleScan("shipwreck");
        else if (key === "2") loadSampleScan("ghost_net");
        else if (key === "3") loadSampleScan("submarine_pipeline");
        else if (key === "4") loadSampleScan("mine_cylinder");
        else if (key === "5") loadSampleScan("clean_seabed");
        else if (key === "C") {
            if (currentDetectionsData && currentDetectionsData.detections && currentDetectionsData.detections.length > 0) {
                const topCoords = currentDetectionsData.detections[0].coordinates.geo_location_degrees;
                copyToClipboard(topCoords);
            }
        }
        else if (key === "E") exportCSV();
        else if (key === "G") exportGeoJSON();
    });
}

function setupCanvasTelemetry() {
    const canvas = document.getElementById("waterfall-canvas");
    const telemetryEl = document.getElementById("canvas-cursor-telemetry");
    if (!canvas || !telemetryEl) return;

    canvas.addEventListener("mousemove", (e) => {
        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        const pixelX = (e.clientX - rect.left) * scaleX;
        const pixelY = (e.clientY - rect.top) * scaleY;

        // Sonar cross-track range (5 cm / pixel, nadir at 320 px)
        const nadirX = canvas.width / 2;
        const nadirY = canvas.height / 2;
        const crossTrackM = ((pixelX - nadirX) * 0.05);
        const alongTrackM = ((nadirY - pixelY) * 0.08);

        const side = crossTrackM >= 0 ? "Stbd" : "Port";
        const distStr = Math.abs(crossTrackM).toFixed(1);

        const baseLat = parseFloat(document.getElementById("vessel-lat").value) || 13.0827;
        const baseLon = parseFloat(document.getElementById("vessel-lon").value) || 80.3850;

        // Approximate mouse coordinate in degrees
        const dLat = (alongTrackM * Math.cos(Math.PI / 4) + crossTrackM * Math.cos(3 * Math.PI / 4)) / 111139.0;
        const dLon = (alongTrackM * Math.sin(Math.PI / 4) + crossTrackM * Math.sin(3 * Math.PI / 4)) / (111139.0 * Math.cos(baseLat * Math.PI / 180.0));
        const curLat = baseLat + dLat;
        const curLon = baseLon + dLon;

        telemetryEl.textContent = `${side} ${distStr}m | ${curLat.toFixed(5)}° N, ${curLon.toFixed(5)}° E`;
    });

    canvas.addEventListener("mouseleave", () => {
        telemetryEl.textContent = "Range: 0.0m | Heading: 45.0°";
    });
}

function setDynamicSurveyLocation(lat, lon, desc = "Selected Location") {
    hasCustomLocationSet = true;
    const latInput = document.getElementById("vessel-lat");
    const lonInput = document.getElementById("vessel-lon");
    if (latInput) latInput.value = parseFloat(lat).toFixed(4);
    if (lonInput) lonInput.value = parseFloat(lon).toFixed(4);

    const latDir = lat >= 0 ? "N" : "S";
    const lonDir = lon >= 0 ? "E" : "W";
    const coordStr = `${Math.abs(lat).toFixed(4)}° ${latDir}, ${Math.abs(lon).toFixed(4)}° ${lonDir}`;

    showToast(`Survey Origin: ${desc} (${coordStr})`);

    recalculateAndRefreshCoordinates(parseFloat(lat), parseFloat(lon));

    if (currentLoadedBlob) {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
            processSonarData(currentLoadedBlob);
        }, 200);
    }
}

function selectOceanBasin(val) {
    if (!val) return;
    const parts = val.split(",");
    if (parts.length === 2) {
        const lat = parseFloat(parts[0]);
        const lon = parseFloat(parts[1]);
        const selectEl = document.getElementById("ocean-basin-select");
        const basinName = selectEl ? selectEl.options[selectEl.selectedIndex].text.split("(")[0].trim() : "Ocean Basin";
        setDynamicSurveyLocation(lat, lon, basinName);
    }
}

function useCurrentGPS() {
    if ("geolocation" in navigator) {
        showToast("Acquiring GPS fix from device...");
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                const lat = pos.coords.latitude;
                const lon = pos.coords.longitude;
                setDynamicSurveyLocation(lat, lon, "Your GPS Device");
            },
            (err) => {
                console.warn("GPS Geolocation failed or blocked:", err.message);
                showToast("GPS access unavailable. Defaulted to coastal survey site.");
                setDynamicSurveyLocation(13.0827, 80.3850, "Bay of Bengal (Default)");
            },
            { timeout: 8000, enableHighAccuracy: true }
        );
    } else {
        showToast("Geolocation is not supported by your browser.");
    }
}

const RANDOM_OCEAN_POINTS = [
    { name: "Mariana Trench (Pacific Ocean)", lat: 11.3500, lon: 142.2000 },
    { name: "Arabian Sea Offshore Corridor", lat: 18.9220, lon: 72.8347 },
    { name: "Bay of Bengal Deep Shelf", lat: 13.0827, lon: 80.3850 },
    { name: "Gulf of Mannar Marine Reserve", lat: 9.2800, lon: 79.1800 },
    { name: "Andaman Deep Trench", lat: 11.6800, lon: 92.8200 },
    { name: "Bermuda Ocean Trench (Atlantic)", lat: 25.0000, lon: -71.0000 },
    { name: "Great Barrier Reef Marine Zone", lat: -18.2871, lon: 147.6992 },
    { name: "Mid-Atlantic Hydrothermal Ridge", lat: 37.0000, lon: -32.0000 },
    { name: "Sunda Trench (Indian Ocean)", lat: -10.3167, lon: 107.9500 },
    { name: "North Sea Subsea Grid", lat: 56.5000, lon: 3.2000 },
    { name: "Mediterranean Hellenic Trench", lat: 35.0000, lon: 18.0000 },
    { name: "Red Sea Deep Corridor", lat: 20.0000, lon: 38.5000 }
];

function randomOceanPoint() {
    const randomIndex = Math.floor(Math.random() * RANDOM_OCEAN_POINTS.length);
    const pt = RANDOM_OCEAN_POINTS[randomIndex];
    setDynamicSurveyLocation(pt.lat, pt.lon, pt.name);
}

function recalculateAndRefreshCoordinates(baseLat, baseLon) {
    const heading = 45.0;
    const nadirX = 320;
    const nadirY = 320;
    const dx = 0.05;
    const dy = 0.08;
    const EARTH_RADIUS = 6378137.0;

    const headingRad = heading * Math.PI / 180.0;
    const starboardRad = headingRad + (Math.PI / 2.0);

    if (currentDetectionsData && currentDetectionsData.detections && currentDetectionsData.detections.length > 0) {
        currentDetectionsData.detections.forEach(det => {
            const [x1, y1, x2, y2] = det.bbox;
            const cx = (x1 + x2) / 2.0;
            const cy = (y1 + y2) / 2.0;

            const crossTrackM = (cx - nadirX) * dx;
            const alongTrackM = (nadirY - cy) * dy;

            const dNorth = (alongTrackM * Math.cos(headingRad)) + (crossTrackM * Math.cos(starboardRad));
            const dEast = (alongTrackM * Math.sin(headingRad)) + (crossTrackM * Math.sin(starboardRad));

            const dLat = (dNorth / EARTH_RADIUS) * (180.0 / Math.PI);
            const dLon = (dEast / (EARTH_RADIUS * Math.cos(baseLat * Math.PI / 180.0))) * (180.0 / Math.PI);

            const targetLat = baseLat + dLat;
            const targetLon = baseLon + dLon;

            det.coordinates.latitude = targetLat;
            det.coordinates.longitude = targetLon;
            det.coordinates.geo_location_degrees = formatDegrees(targetLat, targetLon);
            det.coordinates.latitude_deg = `${Math.abs(targetLat).toFixed(6)}° ${targetLat >= 0 ? 'N' : 'S'}`;
            det.coordinates.longitude_deg = `${Math.abs(targetLon).toFixed(6)}° ${targetLon >= 0 ? 'E' : 'W'}`;
        });

        updatePredictionBanner(currentDetectionsData.detections, baseLat, baseLon);
        updateReportsTable(currentDetectionsData.detections, baseLat, baseLon);
        if (gisMap) {
            gisMap.updateDetections(currentDetectionsData.detections, baseLat, baseLon, heading);
        }
    } else {
        updatePredictionBanner([], baseLat, baseLon);
        if (gisMap) {
            gisMap.plotVessel(baseLat, baseLon, heading);
            gisMap.map.setView([baseLat, baseLon], 14);
        }
    }
}

async function checkSystemStatus() {
    try {
        const res = await fetch("/api/status");
        if (res.ok) {
            const data = await res.json();
            const statusText = document.getElementById("engine-status-text");
            if (statusText) {
                statusText.textContent = `AI MODEL: ${data.engine.toUpperCase()} (${data.status})`;
            }
        }
    } catch (e) {
        console.warn("Status check failed or backend offline.");
    }
}

function handleUploadedFile(file) {
    currentLoadedBlob = file;
    currentActivePreset = null;
    clearActivePresetStyles();

    const badge = document.getElementById("loaded-file-badge");
    if (badge) {
        badge.textContent = file.name;
        badge.classList.remove("hidden");
    }

    showToast(`Loaded: ${file.name}`);
    processSonarData(file);
}

function setActivePresetStyle(sampleType) {
    clearActivePresetStyles();
    currentActivePreset = sampleType;
    const btn = document.getElementById(`preset-${sampleType}`);
    if (btn) {
        btn.classList.add("border-[#38bdf8]", "bg-[#1e2f47]", "ring-2", "ring-[#38bdf8]/70");
    }

    const badge = document.getElementById("loaded-file-badge");
    if (badge) {
        badge.classList.add("hidden");
    }
}

function clearActivePresetStyles() {
    document.querySelectorAll(".preset-btn").forEach(btn => {
        btn.classList.remove("border-[#38bdf8]", "bg-[#1e2f47]", "ring-2", "ring-[#38bdf8]/70");
    });
}

async function loadSampleScan(sampleType, isInitialLoad = false) {
    setActivePresetStyle(sampleType);

    // Only set default coordinates if the user hasn't set their own custom dynamic location
    if (!hasCustomLocationSet && isInitialLoad) {
        const loc = SAMPLE_LOCATIONS[sampleType];
        if (loc) {
            const latInput = document.getElementById("vessel-lat");
            const lonInput = document.getElementById("vessel-lon");
            if (latInput) latInput.value = loc.lat.toFixed(4);
            if (lonInput) lonInput.value = loc.lon.toFixed(4);
        }
    }

    try {
        const url = `/api/fetch-sample-sonar?sample_type=${sampleType}`;
        const res = await fetch(url);
        if (!res.ok) throw new Error("Failed to fetch sample sonar image");

        const blob = await res.blob();
        currentLoadedBlob = new File([blob], `${sampleType}_sonar.jpg`, { type: "image/jpeg" });

        processSonarData(currentLoadedBlob);
    } catch (e) {
        console.error("Error loading sample feed:", e);
    }
}

async function processSonarData(fileBlob) {
    const lat = parseFloat(document.getElementById("vessel-lat").value) || 13.0827;
    const lon = parseFloat(document.getElementById("vessel-lon").value) || 80.3850;
    const confThresh = (parseFloat(document.getElementById("conf-slider").value) || 15) / 100.0;

    const formData = new FormData();
    formData.append("file", fileBlob);
    formData.append("vessel_lat", lat);
    formData.append("vessel_lon", lon);
    formData.append("vessel_heading", 45.0);
    formData.append("confidence_thresh", confThresh);
    formData.append("colormap", "copper");
    formData.append("apply_filter", true);

    try {
        const res = await fetch("/api/process-sonar-image", {
            method: "POST",
            body: formData
        });

        if (!res.ok) throw new Error("Detection pipeline error");
        const data = await res.json();
        currentDetectionsData = data;

        // 1. Render annotated sonar image on canvas
        if (data.annotated_image_base64) {
            const annotatedImg = new Image();
            annotatedImg.onload = () => {
                waterfallViewer.renderImage(annotatedImg, data.detections);
            };
            annotatedImg.src = data.annotated_image_base64;
        }

        // 2. Update Prediction Highlight Banner
        updatePredictionBanner(data.detections, lat, lon);

        // 3. Update Debris Geolocation Reports Table
        updateReportsTable(data.detections, lat, lon);

        // 4. Update Leaflet GIS Map with coordinates
        gisMap.updateDetections(data.detections, lat, lon);

        // Update target count text
        const countEl = document.getElementById("detection-count-text");
        if (countEl) {
            countEl.textContent = `${data.detections.length} Debris Target(s) Detected`;
        }

    } catch (e) {
        console.error("Error processing sonar data:", e);
    }
}

function formatDegrees(lat, lon) {
    const latDir = lat >= 0 ? "N" : "S";
    const lonDir = lon >= 0 ? "E" : "W";
    return `${Math.abs(lat).toFixed(6)}° ${latDir}, ${Math.abs(lon).toFixed(6)}° ${lonDir}`;
}

function updatePredictionBanner(detections, baseLat, baseLon) {
    const bannerEl = document.getElementById("prediction-banner");
    const iconEl = document.getElementById("prediction-icon");
    const titleEl = document.getElementById("prediction-title");
    const confBadge = document.getElementById("prediction-confidence-badge");
    const coordsBadge = document.getElementById("prediction-coords-badge");

    if (!bannerEl || !titleEl) return;

    if (detections && detections.length > 0) {
        const topDet = detections[0];
        const className = topDet.class_name;
        const icon = DEBRIS_ICONS[className] || "⚠️";
        const title = DEBRIS_TITLES[className] || `${className.toUpperCase().replace('_', ' ')} DETECTED`;
        const color = topDet.color || "#38bdf8";

        const coords = topDet.coordinates || {};
        const lat = coords.latitude || baseLat;
        const lon = coords.longitude || baseLon;
        const geoDegrees = coords.geo_location_degrees || formatDegrees(lat, lon);

        bannerEl.style.borderColor = color;
        iconEl.textContent = icon;
        iconEl.style.borderColor = color;
        iconEl.style.backgroundColor = `${color}25`;
        titleEl.textContent = title;
        titleEl.style.color = color;

        confBadge.textContent = `${topDet.confidence_percent} Confidence`;
        confBadge.style.backgroundColor = `${color}35`;
        confBadge.style.color = "#ffffff";

        coordsBadge.innerHTML = `
            <span>Geo Location: <strong class="text-white">${geoDegrees}</strong></span>
            <button onclick="copyToClipboard('${geoDegrees}')" class="ml-2 px-1.5 py-0.5 rounded bg-[#1e2a3c] hover:bg-[#2e405a] text-[10px] text-[#38bdf8] hover:text-white transition-colors border border-[#2a3a50]" title="Copy GPS Coordinates (Press C)">
                📋 Copy
            </button>
        `;

        const mapCoordsEl = document.getElementById("map-coords-indicator");
        if (mapCoordsEl) {
            mapCoordsEl.textContent = geoDegrees;
        }
    } else {
        const baseGeoDegrees = formatDegrees(baseLat, baseLon);
        bannerEl.style.borderColor = "#1e2a3c";
        iconEl.textContent = "🌊";
        iconEl.style.borderColor = "#24334a";
        iconEl.style.backgroundColor = "#162235";
        titleEl.textContent = "NO DEBRIS DETECTED (NATURAL SEABED)";
        titleEl.style.color = "#94a3b8";

        confBadge.textContent = "Clean Seafloor";
        confBadge.style.backgroundColor = "#1b2535";
        confBadge.style.color = "#64748b";

        coordsBadge.innerHTML = `
            <span>Survey Origin: <strong class="text-white">${baseGeoDegrees}</strong></span>
        `;

        const mapCoordsEl = document.getElementById("map-coords-indicator");
        if (mapCoordsEl) {
            mapCoordsEl.textContent = baseGeoDegrees;
        }
    }
}

function updateReportsTable(detections = [], baseLat, baseLon) {
    const tbody = document.getElementById("reports-table-body");
    if (!tbody) return;

    tbody.innerHTML = "";
    if (detections.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" class="py-8 text-center text-[#64748b]">No debris targets detected. Image shows clean natural seafloor.</td></tr>`;
        return;
    }

    detections.forEach(det => {
        const coords = det.coordinates || {};
        const dims = det.dimensions || {};
        const lat = coords.latitude || baseLat;
        const lon = coords.longitude || baseLon;
        const geoDegrees = coords.geo_location_degrees || formatDegrees(lat, lon);

        const tr = document.createElement("tr");
        tr.id = `report-row-${det.id}`;
        tr.className = "hover:bg-[#151f2e] transition-colors cursor-pointer";
        tr.onclick = () => {
            if (gisMap) {
                gisMap.focusTarget(det.id, lat, lon);
            }
            highlightTableRow(det.id);
        };

        tr.innerHTML = `
            <td class="py-2.5 px-3 font-mono-clean text-[#7bd0ff]">#${det.id}</td>
            <td class="py-2.5 px-3 font-semibold uppercase flex items-center gap-1.5" style="color: ${det.color}">
                <span>${DEBRIS_ICONS[det.class_name] || "⚠️"}</span>
                <span>${det.class_name.replace('_', ' ')}</span>
            </td>
            <td class="py-2.5 px-3 font-bold text-[#10b981]">${det.confidence_percent}</td>
            <td class="py-2.5 px-3 font-mono-clean text-xs text-[#38bdf8] flex items-center gap-1.5">
                <span>${geoDegrees}</span>
                <button onclick="event.stopPropagation(); copyToClipboard('${geoDegrees}')" class="px-1.5 py-0.5 rounded bg-[#1e2a3c] hover:bg-[#2e405a] text-[10px] text-[#94a3b8] hover:text-white transition-colors" title="Copy Coordinates">
                    📋
                </button>
            </td>
            <td class="py-2.5 px-3 text-[#94a3b8]">${dims.length_m || 0}m × ${dims.width_m || 0}m</td>
        `;
        tbody.appendChild(tr);
    });
}

function highlightTableRow(targetId) {
    document.querySelectorAll("#reports-table-body tr").forEach(r => {
        r.classList.remove("bg-[#1e2f47]");
    });
    const row = document.getElementById(`report-row-${targetId}`);
    if (row) {
        row.classList.add("bg-[#1e2f47]");
    }
}

function copyAllTargets() {
    if (!currentDetectionsData || !currentDetectionsData.detections || currentDetectionsData.detections.length === 0) {
        showToast("No debris targets detected to copy.");
        return;
    }

    const lines = [
        `FlowNex Sonar Debris Geolocation Report (SIH26057 - MoES/NIOT):`,
        `==================================================================`
    ];

    currentDetectionsData.detections.forEach(det => {
        const coords = det.coordinates || {};
        const dims = det.dimensions || {};
        const degrees = coords.geo_location_degrees || "N/A";
        const shadow = det.acoustic_physics && det.acoustic_physics.has_shadow ? "Shadow Verified" : "Specular";
        lines.push(
            `#${det.id} ${det.class_name.toUpperCase().replace('_', ' ')} | Conf: ${det.confidence_percent} | Geo: ${degrees} | Dimensions: ${dims.length_m || 0}m × ${dims.width_m || 0}m (${shadow})`
        );
    });

    const summaryText = lines.join("\n");
    copyToClipboard(summaryText);
    showToast(`Copied all ${currentDetectionsData.detections.length} target coordinates to clipboard!`);
}

function copyToClipboard(text) {
    if (navigator.clipboard) {
        navigator.clipboard.writeText(text).then(() => {
            showToast(`Copied to clipboard: ${text.slice(0, 36)}${text.length > 36 ? '...' : ''}`);
        }).catch(() => {
            fallbackCopy(text);
        });
    } else {
        fallbackCopy(text);
    }
}

function fallbackCopy(text) {
    const textArea = document.createElement("textarea");
    textArea.value = text;
    document.body.appendChild(textArea);
    textArea.select();
    document.execCommand("copy");
    document.body.removeChild(textArea);
    showToast("Copied to clipboard!");
}

function showToast(msg) {
    let toast = document.getElementById("toast-msg");
    if (!toast) {
        toast = document.createElement("div");
        toast.id = "toast-msg";
        toast.className = "fixed bottom-5 right-5 bg-[#10b981] text-[#062419] font-semibold text-xs px-3.5 py-2 rounded-lg shadow-2xl z-50 transition-opacity duration-300 pointer-events-none";
        document.body.appendChild(toast);
    }
    toast.textContent = msg;
    toast.style.opacity = "1";
    setTimeout(() => {
        toast.style.opacity = "0";
    }, 2400);
}

async function exportCSV() {
    if (!currentDetectionsData || !currentDetectionsData.detections) {
        alert("No detection report available to export. Please process a sonar image first.");
        return;
    }

    try {
        const res = await fetch("/api/export-csv", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(currentDetectionsData)
        });

        if (!res.ok) throw new Error("Failed to export CSV report");
        const blob = await res.blob();
        downloadBlob(blob, "sonar_debris_report_degrees.csv");
        showToast("Downloaded CSV Report with Geodetic Degrees");
    } catch (e) {
        console.error("Export CSV failed:", e);
    }
}

async function exportGeoJSON() {
    if (!currentDetectionsData || !currentDetectionsData.detections) {
        alert("No detection report available to export. Please process a sonar image first.");
        return;
    }

    try {
        const res = await fetch("/api/export-geojson", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(currentDetectionsData)
        });

        if (!res.ok) throw new Error("Failed to export GeoJSON");
        const blob = await res.blob();
        downloadBlob(blob, "sonar_debris_report.geojson");
        showToast("Downloaded GeoJSON for GIS mapping");
    } catch (e) {
        console.error("Export GeoJSON failed:", e);
    }
}

function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}
