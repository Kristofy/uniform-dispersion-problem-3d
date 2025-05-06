export function createMapSelector(container, wasm, renderer) {
    const mapSelectionContainer = document.createElement('div');
    mapSelectionContainer.style.marginBottom = '15px';
    mapSelectionContainer.style.borderTop = '1px solid #555';
    mapSelectionContainer.style.paddingTop = '10px';
    const mapSelectionTitle = document.createElement('div');
    mapSelectionTitle.textContent = 'Preloaded Maps:';
    mapSelectionTitle.style.marginBottom = '8px';
    mapSelectionContainer.appendChild(mapSelectionTitle);
    const mapCount = wasm.get_map_count();
    function getMapName(mapIndex) {
        const nameLength = wasm.get_map_name_length(mapIndex);
        if (nameLength <= 0)
            return `Unknown Map ${mapIndex}`;
        let name = '';
        for (let i = 0; i < nameLength; i++) {
            const charCode = wasm.get_map_name_char(mapIndex, i);
            name += String.fromCharCode(charCode);
        }
        return name;
    }
    for (let i = 0; i < mapCount; i++) {
        const mapName = getMapName(i);
        const sizeX = wasm.get_map_size_x(i);
        const sizeY = wasm.get_map_size_y(i);
        const sizeZ = wasm.get_map_size_z(i);
        const mapButton = document.createElement('button');
        mapButton.textContent = `${mapName} (${sizeX}x${sizeY}x${sizeZ})`;
        mapButton.style.cssText = `
        padding: 6px 10px; 
        margin-right: 5px; 
        margin-bottom: 5px; 
        cursor: pointer; 
        border: 1px solid #444; 
        background-color: #333; 
        color: white;
        display: block; width: 100%;`;
        mapButton.onclick = () => {
            if (window.algoAnimationFrameId) {
                cancelAnimationFrame(window.algoAnimationFrameId);
                delete window.algoAnimationFrameId;
            }
            wasm.load_map(i);
            renderer.renderGrid();
            // Update metrics if the function exists (call via window to access function from simulationControls)
            if (typeof window.updateSimulationMetrics === 'function') {
                window.updateSimulationMetrics();
            }
            console.log(`Loaded map ${i}: ${mapName}`);
        };
        mapSelectionContainer.appendChild(mapButton);
    }
    container.appendChild(mapSelectionContainer);
}
//# sourceMappingURL=mapSelector.js.map