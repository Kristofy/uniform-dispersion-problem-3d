import { CellType } from './types.js';
import { memset, memcpy, wasmLoad } from './wasm/utils.js';
import { Grid3DRenderer } from './renderer/Grid3DRenderer.js';
import { createUI } from './ui/ui.js';
document.addEventListener("DOMContentLoaded", main, false);
async function main() {
    // Hide loading message once everything is initialized
    const loadingElement = document.getElementById('loading');
    try {
        // Create a container for our 3D scene
        const container = document.createElement('div');
        container.style.width = '100%';
        container.style.height = '100vh';
        container.style.position = 'relative'; // Needed for absolute positioning of crosshair
        document.body.appendChild(container);
        // Create crosshair element
        const crosshair = document.createElement('div');
        crosshair.id = 'crosshair';
        crosshair.style.position = 'absolute';
        crosshair.style.top = '50%';
        crosshair.style.left = '50%';
        crosshair.style.width = '10px';
        crosshair.style.height = '10px';
        crosshair.style.border = '1px solid white';
        crosshair.style.transform = 'translate(-50%, -50%)';
        crosshair.style.display = 'none'; // Initially hidden
        crosshair.style.pointerEvents = 'none'; // Prevent it from interfering with mouse events
        container.appendChild(crosshair);
        // Set up memory for WebAssembly
        const memory = new WebAssembly.Memory({ initial: 100, maximum: 1000, shared: false }); // Ensure memory is not shared unless needed
        // Make memory accessible globally for our memset/memcpy functions
        window.wasmMemory = memory;
        const imports = {
            env: {
                console_log: (code) => {
                    if (code < 1000) {
                        console.log(`WASM: Code ${code}`);
                        return;
                    }
                    // Check if this is a robot position log (codes >= 1000000 are robot positions)
                    if (code >= 1000000) {
                        // Decode robot info: 1SIIIXXYYZZ
                        // S = state (0=active, 1=inactive)
                        // III = robot index (3 digits)
                        // XX = x coord (2 digits)
                        // YY = y coord (2 digits)
                        // ZZ = z coord (2 digits)
                        const robotIndex = Math.floor((code % 100000) / 10000);
                        const state = Math.floor(code / 100000) % 10; // 0=active, 1=inactive
                        const x = Math.floor((code % 10000) / 100);
                        const y = Math.floor((code % 100) / 10);
                        const z = code % 10;
                        let statusText = state === 0 ? "active" : "inactive";
                        console.log(`WASM: Robot ${robotIndex} at (${x},${y},${z}) - ${statusText}`);
                        return;
                    }
                    // Handle regular log codes as before
                    const robotIndex = code % 1000;
                    const logType = Math.floor(code / 1000);
                    let message = `WASM: Code ${code}`;
                    switch (logType) {
                        case 1:
                            message = `WASM: Robot ${robotIndex} added.`;
                            break;
                        case 2:
                            message = `WASM: Robot ${robotIndex} became inactive.`;
                            break;
                        case 3:
                            message = `WASM: Robot ${robotIndex} removed by set_cell.`;
                            break;
                        case 4:
                            message = `WASM: Settled robot ${robotIndex} transformed into wall.`;
                            break;
                        case 5:
                            message = code === 5001 ? `WASM: simulate_step START` : `WASM: simulate_step END`;
                            break;
                        case 6: {
                            // Handle start position log: 6xyz (where xyz are coordinates)
                            const posZ = code % 10;
                            const posY = Math.floor((code % 100) / 10);
                            const posX = Math.floor((code % 1000) / 100);
                            message = `WASM: Door position is at (${posX}, ${posY}, ${posZ})`;
                            break;
                        }
                        case 7: {
                            // Handle robot at start position log: 7idx (where idx is robot index, -1 if none)
                            const idx = code - 7000;
                            message = idx === -1
                                ? `WASM: No robot at door position`
                                : `WASM: Robot ${idx} is at door position`;
                            break;
                        }
                        default:
                            message = `WASM: Unknown log code ${code}`;
                            break;
                    }
                    console.log(message);
                },
                memory: memory,
                memset: (ptr, value, size) => {
                    return memset(ptr, value, size, memory);
                },
                memcpy: (dest, src, len) => {
                    return memcpy(dest, src, len, memory);
                },
                randomInt: (min, max) => {
                    // Generate a random number between min and max (inclusive)
                    return Math.floor(Math.random() * (max - min + 1)) + min;
                }
            },
        };
        // Load the WebAssembly module
        const wasm = await wasmLoad("main.wasm", imports);
        console.log("WASM module loaded:", wasm);
        // // Create a demo grid
        // wasm.create_demo_grid();
        // Create the 3D renderer, passing the crosshair element
        const gridRenderer = new Grid3DRenderer(wasm, container, crosshair);
        // Try to load the first map (if available)
        try {
            const mapCount = wasm.get_map_count();
            if (mapCount > 0) {
                console.log(`Loading map 0 of ${mapCount} available maps`);
                wasm.load_map(0);
            }
        }
        catch (err) {
            console.warn("Could not load map:", err);
        }
        // Set default transparencies
        gridRenderer.setMaterialOpacity(CellType.WALL, 0); // 0% (fully transparent)
        gridRenderer.setMaterialOpacity(CellType.EMPTY, 1); // 100% (fully visible)
        // Render the grid
        gridRenderer.renderGrid();
        // Add UI controls
        createUI(wasm, gridRenderer);
        // Hide loading message
        if (loadingElement) {
            loadingElement.style.display = 'none';
        }
    }
    catch (error) {
        console.error("Error initializing application:", error);
        if (loadingElement) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            loadingElement.textContent = `Error: ${errorMessage}`;
            loadingElement.style.color = 'red';
        }
    }
}
//# sourceMappingURL=app.js.map