
export function initializeSidebar({
    sidebar,
    toggle,
    layerButtons,
    onLayerSelect
}) {

    function setOpen(open) {
        sidebar.classList.toggle("open", open);
        toggle.classList.toggle("open", open);

        toggle.setAttribute(
            "aria-expanded",
            String(open)
        );
    }

    // Sidebar toggle
    toggle.addEventListener("click", () => {
        const isOpen =
            sidebar.classList.contains("open");

        setOpen(!isOpen);
    });

    // Layer selection
    layerButtons.forEach(button => {

        button.addEventListener("click", () => {

            const layerId = button.dataset.layer;

            layerButtons.forEach(item => {
                const selected = item === button;

                item.classList.toggle(
                    "selected",
                    selected
                );

                item.setAttribute(
                    "aria-pressed",
                    String(selected)
                );
            });

            onLayerSelect(layerId);
        });

    });
}

