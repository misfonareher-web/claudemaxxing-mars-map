
import {
    LAYERS,
    TILE_BASE_HTTPS_URL,
    TILE_SIZE
} from "./config.js";

export class MarsMap {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext("2d");

        this.width = 0;
        this.height = 0;

        this.scale = 1;
        this.offsetX = 0;
        this.offsetY = 0;

        this.currentLayer = "mola";
        this.cache = new Map();

        this.dragging = false;
        this.lastX = 0;
        this.lastY = 0;

        this.onStatusChange = () => {};

        this.resize = this.resize.bind(this);
        this.render = this.render.bind(this);

        this.bindEvents();
        this.resize();
    }

    bindEvents() {
        // Mouse and touch dragging
        this.canvas.addEventListener("pointerdown", event => {
            this.dragging = true;

            this.lastX = event.clientX;
            this.lastY = event.clientY;

            this.canvas.setPointerCapture(event.pointerId);
        });

        this.canvas.addEventListener("pointermove", event => {
            if (!this.dragging) return;

            this.offsetX += event.clientX - this.lastX;
            this.offsetY += event.clientY - this.lastY;

            this.lastX = event.clientX;
            this.lastY = event.clientY;

            this.render();
        });

        const stopDragging = () => {
            this.dragging = false;
        };

        this.canvas.addEventListener("pointerup", stopDragging);
        this.canvas.addEventListener("pointercancel", stopDragging);

        // Mouse wheel zoom
        this.canvas.addEventListener("wheel", event => {
            event.preventDefault();

            const mouseX = event.offsetX;
            const mouseY = event.offsetY;

            const oldScale = this.scale;

            this.scale *= event.deltaY < 0 ? 1.2 : 1 / 1.2;

            this.scale = Math.max(
                0.2,
                Math.min(1024, this.scale)
            );

            // Zoom towards cursor position
            this.offsetX = mouseX -
                (mouseX - this.offsetX) *
                (this.scale / oldScale);

            this.offsetY = mouseY -
                (mouseY - this.offsetY) *
                (this.scale / oldScale);

            this.render();

        }, { passive: false });

        window.addEventListener("resize", this.resize);
    }

    resize() {
        const dpr = window.devicePixelRatio || 1;

        this.width = this.canvas.clientWidth;
        this.height = this.canvas.clientHeight;

        this.canvas.width = Math.round(this.width * dpr);
        this.canvas.height = Math.round(this.height * dpr);

        this.ctx.setTransform(
            dpr, 0,
            0, dpr,
            0, 0
        );

        this.resetView();
    }

    resetView() {
        this.scale = Math.min(
            this.width / 512,
            this.height / 256
        ) * 0.95;

        this.offsetX = this.width / 2;
        this.offsetY = this.height / 2;

        this.render();
    }

    setLayer(layerId) {
        if (!LAYERS[layerId]) {
            throw new Error(
                `Unknown Mars map layer: ${layerId}`
            );
        }

        this.currentLayer = layerId;
        this.render();
    }

    getTile(z, x, y) {
        const layer = LAYERS[this.currentLayer];

        const key = `${this.currentLayer}/${z}/${y}/${x}`;

        if (this.cache.has(key)) {
            return this.cache.get(key);
        }

        const image = new Image();

        image.onload = () => {
            this.render();
        };

        image.onerror = () => {
            this.cache.delete(key);
            this.onStatusChange("A tile failed to load");
        };

        image.src =
            `${TILE_BASE_HTTPS_URL}${layer.id}/1.0.0/default/default028mm/` +
            `${z}/${y}/${x}.${layer.extension}`;

        this.cache.set(key, image);

        return image;
    }

    render() {
        if (!this.width || !this.height) return;

        const ctx = this.ctx;
        const width = this.width;
        const height = this.height;

        ctx.clearRect(0, 0, width, height);

        ctx.fillStyle = "#111";
        ctx.fillRect(0, 0, width, height);

        // Select appropriate tile zoom level
        const z = Math.max(
            0,
            Math.min(10, Math.floor(Math.log2(this.scale)))
        );

        const tileWorldSize =
            TILE_SIZE / Math.pow(2, z);

        // Visible world boundaries
        const left =
            (0 - this.offsetX) / this.scale + 256;

        const right =
            (width - this.offsetX) / this.scale + 256;

        const top =
            (0 - this.offsetY) / this.scale + 128;

        const bottom =
            (height - this.offsetY) / this.scale + 128;

        const minX = Math.max(
            0,
            Math.floor(left / tileWorldSize)
        );

        const maxX = Math.min(
            Math.pow(2, z + 1) - 1,
            Math.floor(right / tileWorldSize)
        );

        const minY = Math.max(
            0,
            Math.floor(top / tileWorldSize)
        );

        const maxY = Math.min(
            Math.pow(2, z) - 1,
            Math.floor(bottom / tileWorldSize)
        );

        let pending = 0;

        for (let y = minY; y <= maxY; y++) {
            for (let x = minX; x <= maxX; x++) {

                const image = this.getTile(z, x, y);

                if (!image.complete || !image.naturalWidth) {
                    pending++;
                    continue;
                }

                const worldX = x * tileWorldSize;
                const worldY = y * tileWorldSize;

                const screenX =
                    this.offsetX +
                    (worldX - 256) * this.scale;

                const screenY =
                    this.offsetY +
                    (worldY - 128) * this.scale;

                const screenSize =
                    TILE_SIZE * this.scale /
                    Math.pow(2, z);

                ctx.drawImage(
                    image,
                    screenX,
                    screenY,
                    screenSize,
                    screenSize
                );
            }
        }

        this.onStatusChange(
            pending > 0
                ? `Loading ${pending} tiles...`
                : "Tiles loaded"
        );
    }
}

