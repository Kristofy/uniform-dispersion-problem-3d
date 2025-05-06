// Main UI creation entry point
import { WasmExports } from '../types.js';
import { Grid3DRenderer } from '../renderer/Grid3DRenderer.js';
import { createBlockSelector } from './controls/blockSelector.js';
import { createSimulationControls } from './controls/simulationControls.js';
import { createMapSelector } from './controls/mapSelector.js';

export function createUI(wasm: WasmExports, renderer: Grid3DRenderer) {
    const uiContainer = document.createElement('div');
    uiContainer.style.position = 'absolute';
    uiContainer.style.top = '20px';
    uiContainer.style.right = '20px';
    uiContainer.style.zIndex = '1000';
    uiContainer.style.background = 'rgba(30, 30, 30, 0.95)';
    uiContainer.style.padding = '16px';
    uiContainer.style.borderRadius = '8px';
    uiContainer.style.boxShadow = '0 2px 12px rgba(0,0,0,0.5)';
    uiContainer.style.minWidth = '220px';
    uiContainer.style.maxWidth = '320px';
    uiContainer.style.color = '#fff';
    uiContainer.style.fontFamily = 'Arial, sans-serif';
    uiContainer.style.overflowY = 'auto';
    uiContainer.style.maxHeight = '90vh';

    // Title
    const title = document.createElement('h3');
    title.textContent = 'Controls';
    title.style.margin = '0 0 10px 0';
    uiContainer.appendChild(title);


    // Block selector
    createBlockSelector(uiContainer, wasm, renderer);
    // Simulation controls
    createSimulationControls(uiContainer, wasm, renderer);
    // Map selector
    createMapSelector(uiContainer, wasm, renderer);

    document.body.appendChild(uiContainer);
}
