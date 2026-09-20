/**
 * HTML5 Canvas Sonar Waterfall Renderer
 * Simulates high-FPS acoustic waterfall streaming and overlays AI bounding boxes
 */

class SonarWaterfallViewer {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext('2d');
        this.currentImage = null;
        this.detections = [];
        this.isStreaming = false;
        this.streamInterval = null;
        this.scanOffset = 0;
        
        this.initCanvas();
    }

    initCanvas() {
        this.canvas.width = 640;
        this.canvas.height = 640;
        this.clear();
    }

    clear() {
        this.ctx.fillStyle = "#040914";
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        
        // Draw center nadir acoustic path
        this.ctx.strokeStyle = "rgba(56, 189, 248, 0.25)";
        this.ctx.lineWidth = 1;
        this.ctx.setLineDash([4, 4]);
        this.ctx.beginPath();
        this.ctx.moveTo(this.canvas.width / 2, 0);
        this.ctx.lineTo(this.canvas.width / 2, this.canvas.height);
        this.ctx.stroke();
        this.ctx.setLineDash([]);
    }

    renderImage(imgElement, detections = []) {
        this.currentImage = imgElement;
        this.detections = detections;
        this.redraw();
    }

    redraw() {
        this.clear();
        if (this.currentImage) {
            this.ctx.drawImage(this.currentImage, 0, 0, this.canvas.width, this.canvas.height);
        }

        // Draw Bounding Boxes and Labels
        this.detections.forEach(det => {
            const [x1, y1, x2, y2] = det.bbox;
            const w = x2 - x1;
            const h = y2 - y1;

            // Highlight Box
            this.ctx.strokeStyle = det.color || "#38bdf8";
            this.ctx.lineWidth = 2;
            this.ctx.strokeRect(x1, y1, w, h);

            // Corner Accents
            const corner = 6;
            this.ctx.strokeStyle = "#ffffff";
            this.ctx.lineWidth = 3;
            // Top-Left
            this.ctx.beginPath();
            this.ctx.moveTo(x1, y1 + corner);
            this.ctx.lineTo(x1, y1);
            this.ctx.lineTo(x1 + corner, y1);
            this.ctx.stroke();

            // Label pill
            const label = `${det.class_name.toUpperCase()} [${det.confidence_percent}]`;
            this.ctx.font = "bold 11px 'JetBrains Mono', monospace";
            const textWidth = this.ctx.measureText(label).width;

            this.ctx.fillStyle = "rgba(15, 23, 42, 0.85)";
            this.ctx.fillRect(x1, Math.max(0, y1 - 18), textWidth + 8, 16);

            this.ctx.fillStyle = det.color || "#38bdf8";
            this.ctx.fillText(label, x1 + 4, Math.max(12, y1 - 6));
        });
    }

    startSimulation() {
        if (this.isStreaming) return;
        this.isStreaming = true;
        const scanLine = document.getElementById("scan-line");
        if (scanLine) scanLine.classList.add("scanning");
    }

    stopSimulation() {
        this.isStreaming = false;
        const scanLine = document.getElementById("scan-line");
        if (scanLine) scanLine.classList.remove("scanning");
    }
}
