export function createSimulationControls(container, wasm, renderer) {
    const algoControlsContainer = document.createElement('div');
    algoControlsContainer.style.marginBottom = '10px';
    algoControlsContainer.style.borderTop = '1px solid #555';
    algoControlsContainer.style.paddingTop = '10px';
    const algoTitle = document.createElement('div');
    algoTitle.textContent = 'Simulation Controls:';
    algoTitle.style.marginBottom = '8px';
    algoControlsContainer.appendChild(algoTitle);
    const buttonStyle = `
    padding: 6px 10px; 
    margin-right: 5px; 
    margin-bottom: 5px; 
    cursor: pointer; 
    border: 1px solid #444; 
    background-color: #333; 
    color: white;
    `;
    const startButton = document.createElement('button');
    startButton.textContent = 'Start';
    startButton.style.cssText = buttonStyle;
    const stopButton = document.createElement('button');
    stopButton.textContent = 'Stop';
    stopButton.style.cssText = buttonStyle;
    const resetButton = document.createElement('button');
    resetButton.textContent = 'Reset';
    resetButton.style.cssText = buttonStyle;
    algoControlsContainer.appendChild(startButton);
    algoControlsContainer.appendChild(stopButton);
    algoControlsContainer.appendChild(resetButton);
    container.appendChild(algoControlsContainer);
    const speedControlContainer = document.createElement('div');
    speedControlContainer.style.marginBottom = '15px';
    speedControlContainer.style.borderTop = '1px solid #555';
    speedControlContainer.style.paddingTop = '10px';
    const speedLabel = document.createElement('div');
    speedLabel.textContent = 'Simulation Speed:';
    speedLabel.style.marginBottom = '8px';
    speedControlContainer.appendChild(speedLabel);
    const sliderContainer = document.createElement('div');
    sliderContainer.style.display = 'flex';
    sliderContainer.style.alignItems = 'center';
    sliderContainer.style.gap = '10px';
    const speedSlider = document.createElement('input');
    speedSlider.type = 'range';
    speedSlider.min = '0';
    speedSlider.max = '100';
    speedSlider.value = '50';
    speedSlider.style.flex = '1';
    speedSlider.style.cursor = 'pointer';
    speedControlContainer.appendChild(sliderContainer);
    const speedValueLabel = document.createElement('span');
    speedValueLabel.textContent = '1.0x';
    speedValueLabel.style.minWidth = '40px';
    speedValueLabel.style.textAlign = 'right';
    sliderContainer.appendChild(speedSlider);
    sliderContainer.appendChild(speedValueLabel);
    let running = false;
    let lastStepTime = 0;
    let minStepInterval = 200; // ms, default
    // Add simulation metrics panel
    const metricsContainer = document.createElement('div');
    metricsContainer.style.marginBottom = '15px';
    metricsContainer.style.borderTop = '1px solid #555';
    metricsContainer.style.paddingTop = '10px';
    const metricsTitle = document.createElement('div');
    metricsTitle.textContent = 'Simulation Metrics:';
    metricsTitle.style.marginBottom = '8px';
    metricsContainer.appendChild(metricsTitle);
    const metricsGrid = document.createElement('div');
    metricsGrid.style.display = 'grid';
    metricsGrid.style.gridTemplateColumns = '1fr 1fr';
    metricsGrid.style.gap = '5px';
    metricsContainer.appendChild(metricsGrid);
    // Create metric display elements
    const createMetricElement = (label) => {
        const container = document.createElement('div');
        container.style.display = 'flex';
        container.style.justifyContent = 'space-between';
        container.style.padding = '3px 5px';
        container.style.backgroundColor = '#333';
        container.style.borderRadius = '3px';
        const labelElem = document.createElement('span');
        labelElem.textContent = label + ': ';
        const valueElem = document.createElement('span');
        valueElem.textContent = '0';
        valueElem.style.fontWeight = 'bold';
        container.appendChild(labelElem);
        container.appendChild(valueElem);
        return container;
    };
    // Create all metrics elements
    const cellsElem = createMetricElement('Available Cells');
    const makespanElem = createMetricElement('Makespan');
    const tMaxElem = createMetricElement('Max Steps');
    const tTotalElem = createMetricElement('Total Steps');
    const eMaxElem = createMetricElement('Max Time');
    const eTotalElem = createMetricElement('Total Time');
    const stepsElem = createMetricElement('Simulation Steps');
    // Add metrics to the grid
    metricsGrid.appendChild(cellsElem);
    metricsGrid.appendChild(makespanElem);
    metricsGrid.appendChild(tMaxElem);
    metricsGrid.appendChild(tTotalElem);
    metricsGrid.appendChild(eMaxElem);
    metricsGrid.appendChild(eTotalElem);
    metricsGrid.appendChild(stepsElem);
    // Function to update metrics display
    function updateMetrics() {
        cellsElem.querySelector('span:last-child').textContent = wasm.get_available_cells().toString();
        makespanElem.querySelector('span:last-child').textContent = wasm.get_makespan().toString();
        tMaxElem.querySelector('span:last-child').textContent = wasm.get_t_max().toString();
        tTotalElem.querySelector('span:last-child').textContent = wasm.get_t_total().toString();
        eMaxElem.querySelector('span:last-child').textContent = wasm.get_e_max().toString();
        eTotalElem.querySelector('span:last-child').textContent = wasm.get_e_total().toString();
        stepsElem.querySelector('span:last-child').textContent = wasm.get_simulation_steps().toString();
    }
    // Make the update function globally available for other components
    window.updateSimulationMetrics = updateMetrics;
    function calculateSpeedMultiplier(sliderValue) {
        const exponent = sliderValue / 100 * 3 - 1;
        const multiplier = Math.pow(10, exponent);
        return Math.round(multiplier * 10) / 10;
    }
    function updateSimulationSpeed() {
        const sliderValue = parseInt(speedSlider.value);
        const speedMultiplier = calculateSpeedMultiplier(sliderValue);
        speedValueLabel.textContent = `${speedMultiplier.toFixed(1)}x`;
        window.simulationSpeed = speedMultiplier;
        minStepInterval = Math.max(10, Math.round(1000 / speedMultiplier));
    }
    function simulationLoop(now) {
        if (!running)
            return;
        if (now - lastStepTime >= minStepInterval) {
            wasm.simulate_step();
            renderer.renderGrid();
            updateMetrics(); // Update metrics after each step
            lastStepTime = now;
            // Check if all robots are settled (simulation complete)
            if (wasm.is_simulation_complete && wasm.is_simulation_complete()) {
                console.log("Simulation complete - all robots have settled!");
                running = false;
                if (window.algoAnimationFrameId) {
                    cancelAnimationFrame(window.algoAnimationFrameId);
                    delete window.algoAnimationFrameId;
                }
                // Add a visual indicator or notification that simulation is complete
                if (!document.getElementById('simulation-complete-indicator')) {
                    const completeIndicator = document.createElement('div');
                    completeIndicator.id = 'simulation-complete-indicator';
                    completeIndicator.textContent = 'Simulation Complete!';
                    completeIndicator.style.backgroundColor = '#4caf50';
                    completeIndicator.style.color = 'white';
                    completeIndicator.style.padding = '8px 12px';
                    completeIndicator.style.borderRadius = '4px';
                    completeIndicator.style.marginTop = '10px';
                    completeIndicator.style.textAlign = 'center';
                    completeIndicator.style.fontWeight = 'bold';
                    container.appendChild(completeIndicator);
                    // Make it disappear after 5 seconds
                    setTimeout(() => {
                        if (completeIndicator.parentNode) {
                            completeIndicator.parentNode.removeChild(completeIndicator);
                        }
                    }, 5000);
                }
                return;
            }
        }
        window.algoAnimationFrameId = requestAnimationFrame(simulationLoop);
    }
    // Initialize metrics right away
    updateMetrics();
    startButton.onclick = () => {
        if (running)
            return;
        running = true;
        lastStepTime = performance.now();
        window.algoAnimationFrameId = requestAnimationFrame(simulationLoop);
    };
    stopButton.onclick = () => {
        running = false;
        if (window.algoAnimationFrameId) {
            cancelAnimationFrame(window.algoAnimationFrameId);
            delete window.algoAnimationFrameId;
        }
    };
    resetButton.onclick = () => {
        running = false;
        if (window.algoAnimationFrameId) {
            cancelAnimationFrame(window.algoAnimationFrameId);
            delete window.algoAnimationFrameId;
        }
        // Remove simulation complete indicator if it exists
        const indicator = document.getElementById('simulation-complete-indicator');
        if (indicator && indicator.parentNode) {
            indicator.parentNode.removeChild(indicator);
        }
        // Use the new reset function if available, otherwise fall back to create_demo_grid
        wasm.reset_simulation();
        renderer.renderGrid();
        // Reset metrics display
        updateMetrics();
    };
    speedSlider.addEventListener('input', () => {
        updateSimulationSpeed();
    });
    updateSimulationSpeed();
    const probContainer = document.createElement('div');
    probContainer.style.marginBottom = '15px';
    probContainer.style.borderTop = '1px solid #555';
    probContainer.style.paddingTop = '10px';
    const probLabel = document.createElement('div');
    probLabel.textContent = 'Robot Active Probability:';
    probLabel.style.marginBottom = '8px';
    probContainer.appendChild(probLabel);
    const probRow = document.createElement('div');
    probRow.style.display = 'flex';
    probRow.style.alignItems = 'center';
    probRow.style.gap = '10px';
    const probSlider = document.createElement('input');
    probSlider.type = 'range';
    probSlider.min = '0';
    probSlider.max = '100';
    probSlider.value = '50';
    probSlider.style.flex = '1';
    probSlider.style.cursor = 'pointer';
    const probValue = document.createElement('span');
    probValue.textContent = '50%';
    probValue.style.minWidth = '40px';
    probValue.style.textAlign = 'right';
    probSlider.addEventListener('input', () => {
        const p = parseInt(probSlider.value, 10);
        probValue.textContent = `${p}%`;
        if (typeof wasm.set_active_probability === 'function') {
            wasm.set_active_probability(p);
        }
    });
    probRow.appendChild(probSlider);
    probRow.appendChild(probValue);
    probContainer.appendChild(probRow);
    container.appendChild(speedControlContainer);
    container.appendChild(probContainer);
    container.appendChild(metricsContainer);
}
//# sourceMappingURL=simulationControls.js.map