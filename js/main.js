
import { LAYERS } from "./config.js";
import { MarsMap } from "./map.js";
import { initializeSidebar } from "./sidebar.js";

// HTML elements
const mapCanvas = document.getElementById("map");

const sidebar = document.getElementById("sidebar");
const sidebarToggle = document.getElementById("sidebar-toggle");

const layerButtons = document.querySelectorAll(".layer");

const currentLayerLabel =
    document.getElementById("current-layer");

const zoomInfo =
    document.getElementById("zoom-info");

const loadingStatus =
    document.getElementById("loading-status");

const resetButton =
    document.getElementById("reset-view");

// Initialize map
const marsMap = new MarsMap(mapCanvas);

// Update loading status
marsMap.onStatusChange = status => {
    loadingStatus.textContent = status;
};

// Select map layer
function selectLayer(layerId) {
    marsMap.setLayer(layerId);

    currentLayerLabel.textContent =
        LAYERS[layerId].name;
}

// Initialize sidebar
initializeSidebar({
    sidebar,
    toggle: sidebarToggle,
    layerButtons,
    onLayerSelect: selectLayer
});

// Reset map view
resetButton.addEventListener("click", () => {
    marsMap.resetView();
});

// Update zoom information
const originalRender = marsMap.render.bind(marsMap);

marsMap.render = () => {
    originalRender();

    const z = Math.max(
        0,
        Math.min(
            10,
            Math.floor(Math.log2(marsMap.scale))
        )
    );

    zoomInfo.textContent =
        `Zoom: ${marsMap.scale.toFixed(2)}x | Level: ${z}`;
};

// Initial render
marsMap.render();

