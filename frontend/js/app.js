/**
 * Flow Nex Sonar Dashboard Controller (DRISHTI-SSS)
 */

let waterfallViewer = null;
let gisMap = null;
let currentDetectionsData = null;
let currentLoadedBlob = null;
let isPlaybackActive = false;

document.addEventListener("DOMContentLoaded", () => {
    waterfallViewer = new SonarWaterfallViewer("waterfall-canvas");
    gisMap = new SonarGISMap("leaflet-map");

    checkSystemStatus();
    setupEventListeners();
    
    // Auto-load shipwreck scan on startup
    loadSampleScan("shipwreck");
});

function setupEventListeners() {
    const fileInput = document.getElementById("file-input");
    if (fileInput) {
        fileInput.addEventListener("change", (e) => {
            if (e.target.files && e.target.files.length > 0) {
                handleUploadedFile(e.target.files[0]);
            }
        });
    }

    const ingestFileInput = document.getElementById("ingest-file-input");
    if (ingestFileInput) {
        ingestFileInput.addEventListener("change", (e) => {
            if (e.target.files && e.target.files.length > 0) {
                handleUploadedFile(e.target.files[0]);
                switchTab("waterfall");
            }
        });
    }

    // Confidence Slider
    const slider = document.getElementById("conf-slider");
    const badge = document.getElementById("conf-val");
    if (slider && badge) {
        slider.addEventListener("input", (e) => {
            badge.textContent = `${e.target.value}%`;
            if (currentLoadedBlob) {
                processSonarData(currentLoadedBlob);
            }
        });
    }

    // Palette Selector change
    const paletteSelect = document.getElementById("palette-select");
    if (paletteSelect) {
        paletteSelect.addEventListener("change", () => {
            if (currentLoadedBlob) {
                processSonarData(currentLoadedBlob);
            }
        });
    }

    // Filter Toggle change
    const filterToggle = document.getElementById("filter-toggle");
    if (filterToggle) {
        filterToggle.addEventListener("change", () => {
            if (currentLoadedBlob) {
                processSonarData(currentLoadedBlob);
            }
        });
    }

    // Canvas click to select target
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
                if (clickedDet) {
                    openDrawer(clickedDet);
                }
            }
        });
    }
}

async function checkSystemStatus() {
    try {
        const res = await fetch("/api/status");
        if (res.ok) {
            const data = await res.json();
            const statusText = document.getElementById("engine-status-text");
            if (statusText) {
                statusText.textContent = `AI ENGINE: ${data.engine.toUpperCase()} (${data.status})`;
            }
        }
    } catch (e) {
        console.warn("Status check failed or backend offline.");
    }
}

function handleUploadedFile(file) {
    currentLoadedBlob = file;
    const reader = new FileReader();
    reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
            waterfallViewer.renderImage(img, []);
            processSonarData(file);
        };
        img.src = e.target.result;
    };
    reader.readAsDataURL(file);
}

async function loadSampleScan(sampleType) {
    try {
        const url = `/api/fetch-sample-sonar?sample_type=${sampleType}`;
        const res = await fetch(url);
        if (!res.ok) throw new Error("Failed to fetch sample feed");

        const blob = await res.blob();
        currentLoadedBlob = new File([blob], `${sampleType}_sonar.jpg`, { type: "image/jpeg" });

        const img = new Image();
        img.onload = () => {
            waterfallViewer.renderImage(img, []);
            processSonarData(currentLoadedBlob);
        };
        img.src = URL.createObjectURL(blob);
    } catch (e) {
        console.error("Error loading sample feed:", e);
    }
}

async function loadFullSurveyMission() {
    try {
        const res = await fetch("/api/generate-survey-mission");
        if (!res.ok) throw new Error("Failed to run full survey mission");
        const data = await res.json();
        currentDetectionsData = data;

        if (data.annotated_image_base64) {
            const img = new Image();
            img.onload = () => {
                waterfallViewer.renderImage(img, data.detections);
            };
            img.src = data.annotated_image_base64;
        }

        const lat = parseFloat(document.getElementById("vessel-lat").value) || 12.9234;
        const lon = parseFloat(document.getElementById("vessel-lon").value) || 80.2451;
        const heading = parseFloat(document.getElementById("vessel-heading").value) || 45.0;

        gisMap.updateDetections(data.detections, lat, lon, heading);
        updateReportsTable(data.detections);

        if (data.detections.length > 0) {
            openDrawer(data.detections[0]);
        }
    } catch (e) {
        console.error("Error running survey mission:", e);
    }
}

async function processSonarData(fileBlob) {
    const lat = parseFloat(document.getElementById("vessel-lat").value) || 12.9234;
    const lon = parseFloat(document.getElementById("vessel-lon").value) || 80.2451;
    const heading = parseFloat(document.getElementById("vessel-heading").value) || 45.0;
    const colormap = document.getElementById("palette-select").value;
    const confThresh = (parseFloat(document.getElementById("conf-slider").value) || 35) / 100.0;
    const applyFilter = document.getElementById("filter-toggle").checked;

    const formData = new FormData();
    formData.append("file", fileBlob);
    formData.append("vessel_lat", lat);
    formData.append("vessel_lon", lon);
    formData.append("vessel_heading", heading);
    formData.append("colormap", colormap);
    formData.append("confidence_thresh", confThresh);
    formData.append("apply_filter", applyFilter);

    try {
        const res = await fetch("/api/process-sonar-image", {
            method: "POST",
            body: formData
        });

        if (!res.ok) throw new Error("Detection pipeline error");
        const data = await res.json();
        currentDetectionsData = data;

        if (data.annotated_image_base64) {
            const annotatedImg = new Image();
            annotatedImg.onload = () => {
                waterfallViewer.renderImage(annotatedImg, data.detections);
            };
            annotatedImg.src = data.annotated_image_base64;
        }

        gisMap.updateDetections(data.detections, lat, lon, heading);
        updateReportsTable(data.detections);

        if (data.detections.length > 0) {
            openDrawer(data.detections[0]);
        } else {
            closeDrawer();
        }

    } catch (e) {
        console.error("Error processing sonar data:", e);
    }
}

function updateReportsTable(detections = []) {
    const tbody = document.getElementById("reports-table-body");
    if (!tbody) return;

    tbody.innerHTML = "";
    if (detections.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" class="text-center py-8 text-[#4b5563]">No targets logged above threshold.</td></tr>`;
        return;
    }

    detections.forEach(det => {
        const coords = det.coordinates;
        const dims = det.dimensions;
        const physics = det.acoustic_physics;

        const tr = document.createElement("tr");
        tr.className = "cursor-pointer";
        tr.onclick = () => openDrawer(det);

        tr.innerHTML = `
            <td class="font-mono-clean text-[#7bd0ff]">#${det.id}</td>
            <td class="font-semibold" style="color: ${det.color}">${det.class_name.toUpperCase()}</td>
            <td class="font-mono-clean font-medium text-white">${det.confidence_percent}</td>
            <td class="font-mono-clean text-xs">${coords.latitude.toFixed(6)}° N</td>
            <td class="font-mono-clean text-xs">${coords.longitude.toFixed(6)}° E</td>
            <td class="font-mono-clean text-xs">${dims.length_m}m × ${dims.width_m}m (H: ${dims.estimated_height_m}m)</td>
            <td>
                <span class="text-[10px] font-mono-clean px-1.5 py-0.5 rounded ${physics.has_shadow ? 'bg-[#10b981]/20 text-[#10b981]' : 'bg-[#f59e0b]/20 text-[#f59e0b]'}">
                    ${physics.has_shadow ? '✅ Verified' : '⚠️ Unverified'}
                </span>
            </td>
            <td>
                <button class="text-xs text-[#38bdf8] hover:underline" onclick="event.stopPropagation(); openDrawer(det)">Inspect</button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function openDrawer(det) {
    const drawer = document.getElementById("detailDrawer");
    if (!drawer || !det) return;

    document.getElementById("drawerClass").textContent = det.class_name.replace('_', ' ').toUpperCase();
    document.getElementById("drawerClass").style.color = det.color || "#ffffff";
    
    document.getElementById("drawerConfText").textContent = det.confidence_percent;
    document.getElementById("drawerConfText").style.color = det.color || "#38bdf8";

    const bar = document.getElementById("drawerConfBar");
    bar.style.width = det.confidence_percent;
    bar.style.backgroundColor = det.color || "#38bdf8";

    const coords = det.coordinates;
    document.getElementById("drawerCoords").textContent = `${coords.latitude.toFixed(6)}° N, ${coords.longitude.toFixed(6)}° E`;

    const dims = det.dimensions;
    document.getElementById("drawerDims").textContent = `${dims.length_m}m (L) × ${dims.width_m}m (W)`;
    document.getElementById("drawerHeight").textContent = `${dims.estimated_height_m} m`;

    const badgeContainer = document.getElementById("drawerPhysicsBadge");
    const hasShadow = det.acoustic_physics.has_shadow;
    badgeContainer.innerHTML = hasShadow 
        ? `<span class="text-[10px] font-mono-clean px-2 py-0.5 rounded bg-[#10b981]/15 text-[#10b981] border border-[#10b981]/30">✅ Highlight & Shadow Verified</span>`
        : `<span class="text-[10px] font-mono-clean px-2 py-0.5 rounded bg-[#f59e0b]/15 text-[#f59e0b] border border-[#f59e0b]/30">⚠️ Unverified Acoustic Shadow</span>`;

    if (currentDetectionsData && currentDetectionsData.annotated_image_base64) {
        document.getElementById("drawerThumbImg").src = currentDetectionsData.annotated_image_base64;
    }

    drawer.classList.remove("hidden");
}

function closeDrawer() {
    const drawer = document.getElementById("detailDrawer");
    if (drawer) drawer.classList.add("hidden");
}

function switchTab(tabId) {
    // Reset nav tab styles
    document.querySelectorAll("nav button").forEach(btn => {
        btn.classList.remove("text-white", "bg-[#161e2b]", "border-l-2", "border-[#38bdf8]");
        btn.classList.add("text-[#9ca3af]");
    });

    const activeBtn = document.getElementById(`tab-${tabId}`);
    if (activeBtn) {
        activeBtn.classList.remove("text-[#9ca3af]");
        activeBtn.classList.add("text-white", "bg-[#161e2b]", "border-l-2", "border-[#38bdf8]");
    }

    // Toggle view content visibility
    document.querySelectorAll(".view-content").forEach(view => {
        view.classList.add("hidden");
        view.classList.remove("active");
    });

    const activeView = document.getElementById(`view-${tabId}`);
    if (activeView) {
        activeView.classList.remove("hidden");
        activeView.classList.add("active");
    }

    if (tabId === "map" && gisMap && gisMap.map) {
        setTimeout(() => gisMap.map.invalidateSize(), 150);
    }
}

function toggleMissionInfo() {
    const bar = document.getElementById("mission-info-bar");
    if (bar) {
        bar.classList.toggle("hidden");
    }
}

function toggleStreamSimulation() {
    isPlaybackActive = !isPlaybackActive;
    const btn = document.getElementById("toggle-stream-btn");
    if (isPlaybackActive) {
        btn.innerHTML = `<span class="material-symbols-outlined text-[18px] text-[#ef4444]">stop</span>`;
        waterfallViewer.startSimulation();
    } else {
        btn.innerHTML = `<span class="material-symbols-outlined text-[18px]">play_arrow</span>`;
        waterfallViewer.stopSimulation();
    }
}

async function exportGeoJSON() {
    if (!currentDetectionsData) {
        alert("No detection data available to export.");
        return;
    }

    try {
        const res = await fetch("/api/export-geojson", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(currentDetectionsData)
        });
        const blob = await res.blob();
        downloadBlob(blob, "sonar_debris_mission_report.geojson");
    } catch (e) {
        console.error("GeoJSON export failed:", e);
    }
}

async function exportCSV() {
    if (!currentDetectionsData) {
        alert("No detection data available to export.");
        return;
    }

    try {
        const res = await fetch("/api/export-csv", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(currentDetectionsData)
        });
        const blob = await res.blob();
        downloadBlob(blob, "sonar_debris_targets.csv");
    } catch (e) {
        console.error("CSV export failed:", e);
    }
}

function downloadBlob(blob, filename) {
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
}
