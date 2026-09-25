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

// =========================================================================
// Sonar Hydrographic Audio Ping Alert Engine (Web Audio API)
// =========================================================================
let audioCtx = null;
let isAudioEnabled = true;

function getAudioContext() {
    if (!audioCtx) {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (AudioContextClass) {
            audioCtx = new AudioContextClass();
        }
    }
    if (audioCtx && audioCtx.state === "suspended") {
        audioCtx.resume().catch(() => {});
    }
    return audioCtx;
}

// Ensure audio context is ready on first user gesture
function unlockAudioContext() {
    getAudioContext();
}
document.addEventListener("click", unlockAudioContext, { once: true });
document.addEventListener("keydown", unlockAudioContext, { once: true });

function playSonarPingAlert(debrisType = "shipwreck", repeatCount = 3) {
    if (!isAudioEnabled) return;

    try {
        const ctx = getAudioContext();
        if (!ctx) return;

        if (debrisType === "clean_seabed") {
            return; // Natural seabed, no alarm
        }

        // Custom acoustic signature frequency per target classification
        let baseFreq = 1040;
        if (debrisType === "mine_cylinder") {
            baseFreq = 1220; // High urgency alert
        } else if (debrisType === "ghost_net") {
            baseFreq = 940;  // Resonant mid ping
        } else if (debrisType === "submarine_pipeline") {
            baseFreq = 860;  // Deep subsea harmonic
        } else if (debrisType === "shipwreck") {
            baseFreq = 1080; // High clear hydrographic ping
        }

        const triggerSinglePing = (timeOffset, freq, gainVal = 0.28, duration = 0.85) => {
            const now = ctx.currentTime + timeOffset;

            // Master Gain Envelope: sharp instantaneous attack + long underwater reverberation tail
            const masterGain = ctx.createGain();
            masterGain.gain.setValueAtTime(0.0001, now);
            masterGain.gain.exponentialRampToValueAtTime(gainVal, now + 0.012);
            masterGain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

            // Biquad Bandpass Filter (Simulates deep seawater acoustic absorption)
            const filter = ctx.createBiquadFilter();
            filter.type = "bandpass";
            filter.frequency.setValueAtTime(freq, now);
            filter.Q.setValueAtTime(5.5, now);

            // Primary Transducer Oscillator (Pure acoustic carrier with subtle down-chirp)
            const osc1 = ctx.createOscillator();
            osc1.type = "sine";
            osc1.frequency.setValueAtTime(freq * 1.04, now);
            osc1.frequency.exponentialRampToValueAtTime(freq, now + 0.06);

            // Secondary Harmonic Oscillator (Gives metallic acoustic ping ring)
            const osc2 = ctx.createOscillator();
            osc2.type = "sine";
            osc2.frequency.setValueAtTime(freq * 2.01, now);

            const osc2Gain = ctx.createGain();
            osc2Gain.gain.setValueAtTime(gainVal * 0.35, now);
            osc2Gain.gain.exponentialRampToValueAtTime(0.0001, now + (duration * 0.45));

            // Connect audio graph
            osc1.connect(filter);
            osc2.connect(osc2Gain);
            osc2Gain.connect(filter);
            filter.connect(masterGain);
            masterGain.connect(ctx.destination);

            osc1.start(now);
            osc2.start(now);
            osc1.stop(now + duration);
            osc2.stop(now + duration);
        };

        // Play 3 sequential rhythmic sonar pings
        const pingIntervalSec = 0.65;
        for (let i = 0; i < repeatCount; i++) {
            const offset = i * pingIntervalSec;
            // Subtle natural frequency variation and reverberation decay over the 3 pings
            const freqVariation = baseFreq * (1.0 + (i === 0 ? 0.02 : (i === 1 ? 0 : -0.02)));
            const gain = i === 0 ? 0.28 : (i === 1 ? 0.25 : 0.22);
            triggerSinglePing(offset, freqVariation, gain, 0.85);

            // Synchronize visual pulse ripple feedback for each of the 3 pings
            setTimeout(() => {
                triggerVisualPingEffect();
            }, i * (pingIntervalSec * 1000));
        }
    } catch (e) {
        console.warn("Sonar audio ping note:", e.message);
    }
}

function triggerVisualPingEffect() {
    const audioBtn = document.getElementById("audio-toggle-btn");
    const banner = document.getElementById("prediction-banner");
    
    [audioBtn, banner].forEach(el => {
        if (el) {
            el.classList.remove("sonar-ping-active");
            void el.offsetWidth;
            el.classList.add("sonar-ping-active");
        }
    });
}

function toggleAudioAlert() {
    isAudioEnabled = !isAudioEnabled;
    const btn = document.getElementById("audio-toggle-btn");
    const icon = document.getElementById("audio-icon");
    const label = document.getElementById("audio-label");

    if (isAudioEnabled) {
        if (icon) icon.textContent = "🔊";
        if (label) label.textContent = "PING: ON";
        if (btn) {
            btn.className = "flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-mono-clean bg-[#0d1624] text-[#38bdf8] border border-[#1b2b42] hover:border-[#38bdf8] transition-all cursor-pointer shadow-sm";
        }
        showToast("🔊 Sonar Audio Alert: ENABLED (3 Pings)");
        playSonarPingAlert("shipwreck", 3);
    } else {
        if (icon) icon.textContent = "🔈";
        if (label) label.textContent = "PING: MUTED";
        if (btn) {
            btn.className = "flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-mono-clean bg-[#0a0f18] text-[#64748b] border border-[#1a2333] hover:border-[#334155] transition-all cursor-pointer shadow-sm";
        }
        showToast("🔈 Sonar Audio Alert: MUTED");
    }
}

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
    initTheme();

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
        // Toggle shortcuts modal on Alt+K
        if (e.altKey && (e.key === "k" || e.key === "K")) {
            e.preventDefault();
            toggleShortcutsModal();
            return;
        }

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
        else if (key === "M") toggleAudioAlert();
    });
}

// Day and Night (DND) Mode Toggle Handlers
let currentTheme = localStorage.getItem("flownex-theme") || "night";

function initTheme() {
    applyTheme(currentTheme, false);
}

function applyTheme(theme, showFeedback = true) {
    currentTheme = theme;
    localStorage.setItem("flownex-theme", theme);
    const htmlEl = document.documentElement;
    const btn = document.getElementById("theme-toggle-btn");
    const icon = document.getElementById("theme-icon");
    const label = document.getElementById("theme-label");

    if (theme === "day") {
        htmlEl.classList.remove("dark");
        htmlEl.classList.add("light");
        if (btn) {
            btn.className = "theme-toggle-btn day-mode flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-mono-clean transition-all shadow-sm";
        }
        if (icon) icon.textContent = "☀️";
        if (label) label.textContent = "DAY";
        if (showFeedback) showToast("Day Mode Activated");
    } else {
        htmlEl.classList.remove("light");
        htmlEl.classList.add("dark");
        if (btn) {
            btn.className = "theme-toggle-btn night-mode flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-mono-clean transition-all shadow-sm";
        }
        if (icon) icon.textContent = "🌙";
        if (label) label.textContent = "NIGHT";
        if (showFeedback) showToast("Night Mode Activated");
    }
}

function toggleDayNightMode() {
    if (currentTheme === "night") {
        applyTheme("day", true);
    } else {
        applyTheme("night", true);
    }
}

function openShortcutsModal() {
    const modal = document.getElementById("shortcuts-modal");
    if (modal) {
        modal.classList.remove("hidden");
        modal.classList.add("flex");
    }
}

function closeShortcutsModal() {
    const modal = document.getElementById("shortcuts-modal");
    if (modal) {
        modal.classList.add("hidden");
        modal.classList.remove("flex");
    }
}

function toggleShortcutsModal() {
    const modal = document.getElementById("shortcuts-modal");
    if (modal) {
        if (modal.classList.contains("hidden")) {
            openShortcutsModal();
        } else {
            closeShortcutsModal();
        }
    }
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
        btn.classList.add("active-preset");
    }

    const badge = document.getElementById("loaded-file-badge");
    if (badge) {
        badge.classList.add("hidden");
    }
}

function clearActivePresetStyles() {
    document.querySelectorAll(".preset-btn").forEach(btn => {
        btn.classList.remove("active-preset");
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

        // 5. Trigger Hydrographic Sonar Audio Ping Alert if debris detected
        if (data.detections && data.detections.length > 0) {
            playSonarPingAlert(data.detections[0].class_name);
        }

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

        const coords = topDet.coordinates || {};
        const lat = coords.latitude || baseLat;
        const lon = coords.longitude || baseLon;
        const geoDegrees = coords.geo_location_degrees || formatDegrees(lat, lon);

        iconEl.textContent = icon;
        titleEl.textContent = title;

        confBadge.textContent = `${topDet.confidence_percent}`;
        confBadge.className = "px-2.5 py-0.5 rounded-md text-xs font-mono-clean font-bold bg-[#052e16] text-[#4ade80] border border-[#22c55e]/40 shadow-[0_0_8px_rgba(34,197,94,0.2)]";

        coordsBadge.innerHTML = `WGS84: ${lat.toFixed(5)}, ${lon.toFixed(5)}`;

        const mapCoordsEl = document.getElementById("map-coords-indicator");
        if (mapCoordsEl) {
            mapCoordsEl.textContent = geoDegrees;
        }
    } else {
        const baseGeoDegrees = formatDegrees(baseLat, baseLon);
        iconEl.textContent = "🌊";
        titleEl.textContent = "NO DEBRIS DETECTED (NATURAL SEABED)";

        confBadge.textContent = "Clean";
        confBadge.className = "px-2.5 py-0.5 rounded-md text-xs font-mono-clean font-bold bg-[#1e293b] text-[#94a3b8] border border-[#334155]";
        coordsBadge.innerHTML = `WGS84: ${baseLat.toFixed(5)}, ${baseLon.toFixed(5)}`;

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
        tbody.innerHTML = `<tr><td colspan="5" class="py-8 text-center text-[#64748b]">No debris detected. Natural seabed profile.</td></tr>`;
        return;
    }

    detections.forEach((det, idx) => {
        const coords = det.coordinates || {};
        const dims = det.dimensions || {};
        const lat = coords.latitude || baseLat;
        const lon = coords.longitude || baseLon;
        const geoDegrees = `${lat.toFixed(5)}, ${lon.toFixed(5)}`;
        const sizeStr = `${dims.length_m || 100} × ${dims.width_m || 10}`;

        const tr = document.createElement("tr");
        tr.id = `report-row-${det.id}`;
        tr.className = "hover:bg-[#111a28] transition-colors cursor-pointer";
        tr.onclick = () => {
            if (gisMap) {
                gisMap.focusTarget(det.id, lat, lon);
            }
            highlightTableRow(det.id);
        };

        const typeName = det.class_name ? (det.class_name.charAt(0).toUpperCase() + det.class_name.slice(1)).replace('_', ' ') : "Debris";

        tr.innerHTML = `
            <td class="py-2.5 px-3 font-mono-clean text-[#94a3b8]">${idx + 1}</td>
            <td class="py-2.5 px-3 font-medium text-white">${typeName}</td>
            <td class="py-2.5 px-3 font-bold text-[#10b981]">${det.confidence_percent}</td>
            <td class="py-2.5 px-3 font-mono-clean text-xs text-[#38bdf8] hover:underline cursor-pointer" onclick="event.stopPropagation(); copyToClipboard('${geoDegrees}')" title="Click to copy coordinates">${geoDegrees}</td>
            <td class="py-2.5 px-3 text-[#94a3b8] font-mono-clean">${sizeStr}</td>
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
