import { CellType } from './types.js';
import { memset, memcpy, wasmLoad } from './wasm/utils.js';
import { Grid3DRenderer } from './renderer/Grid3DRenderer.js';
const params = new URLSearchParams(window.location.search);
const mapParam = params.get('map') ?? "0";
const mapIndex = parseInt(mapParam, 10);
document.addEventListener("DOMContentLoaded", main, false);
const NUM_SIMULATIONS = 15;
// Statistics tracking
const globalStats = {
    steps: Array(NUM_SIMULATIONS).fill(NaN),
    minSteps: Infinity,
    maxSteps: 0,
    avgSteps: 0,
    variance: 0,
    makespans: Array(NUM_SIMULATIONS).fill(NaN),
    minMakespan: Infinity,
    maxMakespan: 0,
    avgMakespan: 0,
    varMakespan: 0,
    tTotals: Array(NUM_SIMULATIONS).fill(NaN),
    minTTotal: Infinity,
    maxTTotal: 0,
    avgTTotal: 0,
    varTTotal: 0,
    tMaxs: Array(NUM_SIMULATIONS).fill(NaN),
    minTMax: Infinity,
    maxTMax: 0,
    avgTMax: 0,
    varTMax: 0,
    eTotals: Array(NUM_SIMULATIONS).fill(NaN),
    minETotal: Infinity,
    maxETotal: 0,
    avgETotal: 0,
    varETotal: 0,
    eMaxs: Array(NUM_SIMULATIONS).fill(NaN),
    minEMax: Infinity,
    maxEMax: 0,
    avgEMax: 0,
    varEMax: 0
};
// Parse speed and pvalue from URL params
const speedParam = params.get('speed');
const pvalueParam = params.get('pvalue');
const defaultSpeed = speedParam ? parseFloat(speedParam) : 1.0;
const defaultPValue = pvalueParam ? parseInt(pvalueParam, 10) : 50;
const simulations = [];
document.addEventListener("DOMContentLoaded", main, false);
async function main() {
    // Hide loading message once everything is initialized
    const loadingElement = document.getElementById('loading');
    const container = document.getElementById('simulations-container');
    try {
        // Create multiple simulation instances
        for (let i = 0; i < NUM_SIMULATIONS; i++) {
            try {
                const sim = await createSimulationInstance(i);
                simulations.push(sim);
            }
            catch (error) {
                console.error(`Error creating simulation ${i}:`, error);
            }
        }
        // Set up global controls
        setupGlobalControls();
        // Hide loading message
        if (loadingElement && loadingElement.parentNode) {
            loadingElement.parentNode.removeChild(loadingElement);
        }
        // Start with initial stats display
        updateGlobalStats();
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
async function createSimulationInstance(index) {
    // Create a container for this simulation instance
    const simulationContainer = document.createElement('div');
    simulationContainer.className = 'simulation-container';
    simulationContainer.id = `simulation-${index}`;
    const container = document.getElementById('simulations-container');
    if (!container)
        throw new Error('Simulations container not found');
    container.appendChild(simulationContainer);
    // Create container for the 3D scene
    const sceneContainer = document.createElement('div');
    sceneContainer.style.width = '100%';
    sceneContainer.style.height = '100%';
    sceneContainer.style.position = 'relative';
    simulationContainer.appendChild(sceneContainer);
    // Create stats container
    const statsContainer = document.createElement('div');
    statsContainer.className = 'simulation-stats';
    statsContainer.innerHTML = `
  <div style="display: grid; grid-template-columns: 1.2fr 1fr 1.2fr 1fr; row-gap: 2px; column-gap: 8px;">
    <div><b>ID</b> ${index}</div><div></div><div><b>R</b> <span id="robots-${index}">0</span></div>
    <div><b>Mk</b> <span id="makespan-${index}">0</span></div><div><b>T<sub>total</sub></b> <span id="ttotal-${index}">0</span></div><div><b>T<sub>max</sub></b> <span id="tmax-${index}">0</span></div><div><b>E<sub>total</sub></b> <span id="etotal-${index}">0</span></div>
    <div><b>E<sub>max</sub></b> <span id="emax-${index}">0</span></div>
  </div>
`;
    simulationContainer.appendChild(statsContainer);
    // Create crosshair element
    const crosshair = document.createElement('div');
    crosshair.className = 'crosshair';
    crosshair.style.display = 'none'; // We don't need crosshairs for these simulations
    sceneContainer.appendChild(crosshair);
    // Set up memory for WebAssembly
    const memory = new WebAssembly.Memory({ initial: 100, maximum: 1000, shared: false });
    const imports = {
        env: {
            console_log: (code) => {
                // We can limit console output to avoid flooding console
                if (code === 5001 || code === 5002) { // Start/End simulation step
                    console.log(`Sim ${index} - Code ${code}`);
                }
            },
            memory: memory,
            memset: (ptr, value, size) => {
                return memset(ptr, value, size, memory);
            },
            memcpy: (dest, src, len) => {
                return memcpy(dest, src, len, memory);
            },
            randomInt: (min, max) => {
                return Math.floor(Math.random() * (max - min + 1)) + min;
            }
        },
    };
    // Load the WebAssembly module
    const wasm = await wasmLoad("main.wasm", imports);
    // Set pvalue if available
    if (typeof wasm.set_active_probability === 'function') {
        wasm.set_active_probability(defaultPValue);
    }
    // Create a 3D renderer
    const gridRenderer = new Grid3DRenderer(wasm, sceneContainer, crosshair);
    // --- Load map from URL param if present ---
    // Only do this for the first simulation (index 0)
    let mapLoadedFromUrl = false;
    if (mapParam !== null) {
        if (!isNaN(mapIndex) && wasm.get_map_count && mapIndex >= 0 && mapIndex < wasm.get_map_count()) {
            wasm.load_map(mapIndex);
            mapLoadedFromUrl = true;
        }
    }
    // If not loaded from URL, use random map as before
    if (!mapLoadedFromUrl) {
        console.log("Map id not found in URL, loading random map");
        const mapCount = wasm.get_map_count();
        if (mapCount > 0) {
            const randomMapIndex = Math.floor(Math.random() * mapCount);
            console.log(`Simulation ${index}: Loading map ${randomMapIndex} of ${mapCount}`);
            wasm.load_map(randomMapIndex);
        }
        else {
            wasm.create_demo_grid();
        }
    }
    // Set default transparencies
    gridRenderer.setMaterialOpacity(CellType.WALL, 0); // 0% (fully transparent)
    gridRenderer.setMaterialOpacity(CellType.EMPTY, 1); // 100% (fully visible)
    // Render the grid and setup camera with automatic orbiting
    gridRenderer.renderGrid();
    // Setup camera with a good zoom level and start orbiting
    // Use slightly different orbit speeds for visual variety
    const baseOrbitSpeed = 0.1;
    const orbitSpeed = baseOrbitSpeed * (0.8 + Math.random() * 0.4); // 80% to 120% of base speed
    gridRenderer.setupCameraView(1.8, true, orbitSpeed);
    // Create simulation object
    const simulation = {
        index,
        wasm,
        gridRenderer,
        running: false,
        animFrameId: null,
        lastStepTime: 0,
        stepInterval: 300 / defaultSpeed, // ms, adjust as needed
        metrics: {
            steps: 0,
            robots: wasm.get_robot_count ? wasm.get_robot_count() : 0,
            makespan: wasm.get_makespan ? wasm.get_makespan() : 0,
            t_total: wasm.get_t_total ? wasm.get_t_total() : 0,
            t_max: wasm.get_t_max ? wasm.get_t_max() : 0,
            e_total: wasm.get_e_total ? wasm.get_e_total() : 0,
            e_max: wasm.get_e_max ? wasm.get_e_max() : 0
        },
        statsElements: {
            steps: document.getElementById(`steps-${index}`),
            robots: document.getElementById(`robots-${index}`),
            makespan: document.getElementById(`makespan-${index}`),
            ttotal: document.getElementById(`ttotal-${index}`),
            tmax: document.getElementById(`tmax-${index}`),
            etotal: document.getElementById(`etotal-${index}`),
            emax: document.getElementById(`emax-${index}`)
        }
    };
    // Update the robot count display
    updateSimulationStats(simulation);
    return simulation;
}
function startSimulation(simulation) {
    if (simulation.running)
        return;
    simulation.running = true;
    simulation.lastStepTime = performance.now();
    function simulationLoop(now) {
        if (!simulation.running)
            return;
        if (now - simulation.lastStepTime >= simulation.stepInterval) {
            simulation.wasm.simulate_step();
            simulation.gridRenderer.renderGrid();
            // Update metrics
            simulation.metrics.steps = simulation.wasm.get_simulation_steps();
            simulation.metrics.robots = simulation.wasm.get_robot_count ? simulation.wasm.get_robot_count() : 0;
            simulation.metrics.makespan = simulation.wasm.get_makespan ? simulation.wasm.get_makespan() : 0;
            simulation.metrics.t_total = simulation.wasm.get_t_total ? simulation.wasm.get_t_total() : 0;
            simulation.metrics.t_max = simulation.wasm.get_t_max ? simulation.wasm.get_t_max() : 0;
            simulation.metrics.e_total = simulation.wasm.get_e_total ? simulation.wasm.get_e_total() : 0;
            simulation.metrics.e_max = simulation.wasm.get_e_max ? simulation.wasm.get_e_max() : 0;
            updateSimulationStats(simulation);
            // Live update globalStats for this simulation index
            globalStats.steps[simulation.index] = simulation.metrics.steps;
            globalStats.makespans[simulation.index] = simulation.metrics.makespan;
            globalStats.tTotals[simulation.index] = simulation.metrics.t_total;
            globalStats.tMaxs[simulation.index] = simulation.metrics.t_max;
            globalStats.eTotals[simulation.index] = simulation.metrics.e_total;
            globalStats.eMaxs[simulation.index] = simulation.metrics.e_max;
            updateGlobalStats();
            simulation.lastStepTime = now;
            // Check if simulation is complete
            if (simulation.wasm.is_simulation_complete && simulation.wasm.is_simulation_complete()) {
                stopSimulation(simulation);
                return;
            }
        }
        simulation.animFrameId = requestAnimationFrame(simulationLoop);
    }
    simulation.animFrameId = requestAnimationFrame(simulationLoop);
}
function stopSimulation(simulation) {
    simulation.running = false;
    if (simulation.animFrameId) {
        cancelAnimationFrame(simulation.animFrameId);
        simulation.animFrameId = null;
    }
}
function resetSimulation(simulation) {
    stopSimulation(simulation);
    if (simulation.wasm.reset_simulation) {
        simulation.wasm.reset_simulation();
    }
    else {
        // Fallback to loading a random map
        const mapCount = simulation.wasm.get_map_count();
        if (mapCount > 0) {
            const randomMapIndex = Math.floor(Math.random() * mapCount);
            simulation.wasm.load_map(randomMapIndex);
        }
        else {
            simulation.wasm.create_demo_grid();
        }
    }
    simulation.gridRenderer.renderGrid();
    simulation.metrics.steps = 0;
    simulation.metrics.robots = simulation.wasm.get_robot_count ? simulation.wasm.get_robot_count() : 0;
    // Reset this simulation's stats in globalStats
    globalStats.steps[simulation.index] = NaN;
    globalStats.makespans[simulation.index] = NaN;
    globalStats.tTotals[simulation.index] = NaN;
    globalStats.tMaxs[simulation.index] = NaN;
    globalStats.eTotals[simulation.index] = NaN;
    globalStats.eMaxs[simulation.index] = NaN;
    updateGlobalStats();
    updateSimulationStats(simulation);
}
function updateSimulationStats(simulation) {
    if (simulation.statsElements.steps) {
        simulation.statsElements.steps.textContent = simulation.metrics.steps.toString();
    }
    if (simulation.statsElements.robots) {
        simulation.statsElements.robots.textContent = simulation.metrics.robots.toString();
    }
    if (simulation.statsElements.makespan) {
        simulation.statsElements.makespan.textContent = simulation.metrics.makespan.toString();
    }
    if (simulation.statsElements.ttotal) {
        simulation.statsElements.ttotal.textContent = simulation.metrics.t_total.toString();
    }
    if (simulation.statsElements.tmax) {
        simulation.statsElements.tmax.textContent = simulation.metrics.t_max.toString();
    }
    if (simulation.statsElements.etotal) {
        simulation.statsElements.etotal.textContent = simulation.metrics.e_total.toString();
    }
    if (simulation.statsElements.emax) {
        simulation.statsElements.emax.textContent = simulation.metrics.e_max.toString();
    }
}
function addToGlobalStats(metrics, index) {
    // Deprecated: now handled live in simulation loop
}
function calcStats(arr) {
    if (arr.length === 0)
        return { min: NaN, max: NaN, avg: NaN, var: NaN };
    const min = Math.min(...arr);
    const max = Math.max(...arr);
    const avg = arr.reduce((a, b) => a + b, 0) / arr.length;
    const variance = arr.length > 1 ? arr.reduce((a, b) => a + Math.pow(b - avg, 2), 0) / arr.length : 0;
    return { min, max, avg, var: variance };
}
function updateGlobalStats() {
    // Only use finite values for stats
    const valid = (arr) => arr.filter(x => isFinite(x));
    const stepsStats = calcStats(valid(globalStats.steps));
    globalStats.minSteps = stepsStats.min;
    globalStats.maxSteps = stepsStats.max;
    globalStats.avgSteps = stepsStats.avg;
    globalStats.variance = stepsStats.var;
    const makespanStats = calcStats(valid(globalStats.makespans));
    globalStats.minMakespan = makespanStats.min;
    globalStats.maxMakespan = makespanStats.max;
    globalStats.avgMakespan = makespanStats.avg;
    globalStats.varMakespan = makespanStats.var;
    const tTotalStats = calcStats(valid(globalStats.tTotals));
    globalStats.minTTotal = tTotalStats.min;
    globalStats.maxTTotal = tTotalStats.max;
    globalStats.avgTTotal = tTotalStats.avg;
    globalStats.varTTotal = tTotalStats.var;
    const tMaxStats = calcStats(valid(globalStats.tMaxs));
    globalStats.minTMax = tMaxStats.min;
    globalStats.maxTMax = tMaxStats.max;
    globalStats.avgTMax = tMaxStats.avg;
    globalStats.varTMax = tMaxStats.var;
    const eTotalStats = calcStats(valid(globalStats.eTotals));
    globalStats.minETotal = eTotalStats.min;
    globalStats.maxETotal = eTotalStats.max;
    globalStats.avgETotal = eTotalStats.avg;
    globalStats.varETotal = eTotalStats.var;
    const eMaxStats = calcStats(valid(globalStats.eMaxs));
    globalStats.minEMax = eMaxStats.min;
    globalStats.maxEMax = eMaxStats.max;
    globalStats.avgEMax = eMaxStats.avg;
    globalStats.varEMax = eMaxStats.var;
    // Update UI for new compact Unicode format
    const set = (id, value) => {
        const el = document.getElementById(id);
        if (el)
            el.textContent = isFinite(value) ? value.toFixed(id.includes('avg') || id.includes('var') ? 1 : 0) : '-';
    };
    set('global-max-makespan', globalStats.maxMakespan);
    set('global-min-makespan', globalStats.minMakespan);
    set('global-avg-makespan', globalStats.avgMakespan);
    set('global-var-makespan', globalStats.varMakespan);
    set('global-max-ttotal', globalStats.maxTTotal);
    set('global-min-ttotal', globalStats.minTTotal);
    set('global-avg-ttotal', globalStats.avgTTotal);
    set('global-var-ttotal', globalStats.varTTotal);
    set('global-max-tmax', globalStats.maxTMax);
    set('global-min-tmax', globalStats.minTMax);
    set('global-avg-tmax', globalStats.avgTMax);
    set('global-var-tmax', globalStats.varTMax);
    set('global-max-etotal', globalStats.maxETotal);
    set('global-min-etotal', globalStats.minETotal);
    set('global-avg-etotal', globalStats.avgETotal);
    set('global-var-etotal', globalStats.varETotal);
    set('global-max-emax', globalStats.maxEMax);
    set('global-min-emax', globalStats.minEMax);
    set('global-avg-emax', globalStats.avgEMax);
    set('global-var-emax', globalStats.varEMax);
}
function setupGlobalControls() {
    const startAllBtn = document.getElementById('start-all');
    const resetAllBtn = document.getElementById('reset-all');
    startAllBtn.addEventListener('click', () => {
        simulations.forEach(sim => {
            startSimulation(sim);
        });
    });
    resetAllBtn.addEventListener('click', () => {
        simulations.forEach(sim => {
            resetSimulation(sim);
        });
        // Reset global statistics
        globalStats.steps.fill(NaN);
        globalStats.makespans.fill(NaN);
        globalStats.tTotals.fill(NaN);
        globalStats.tMaxs.fill(NaN);
        globalStats.eTotals.fill(NaN);
        globalStats.eMaxs.fill(NaN);
        globalStats.minSteps = Infinity;
        globalStats.maxSteps = 0;
        globalStats.avgSteps = 0;
        globalStats.variance = 0;
        globalStats.minMakespan = Infinity;
        globalStats.maxMakespan = 0;
        globalStats.avgMakespan = 0;
        globalStats.varMakespan = 0;
        globalStats.minTTotal = Infinity;
        globalStats.maxTTotal = 0;
        globalStats.avgTTotal = 0;
        globalStats.varTTotal = 0;
        globalStats.minTMax = Infinity;
        globalStats.maxTMax = 0;
        globalStats.avgTMax = 0;
        globalStats.varTMax = 0;
        globalStats.minETotal = Infinity;
        globalStats.maxETotal = 0;
        globalStats.avgETotal = 0;
        globalStats.varETotal = 0;
        globalStats.minEMax = Infinity;
        globalStats.maxEMax = 0;
        globalStats.avgEMax = 0;
        globalStats.varEMax = 0;
        updateGlobalStats();
    });
}
//# sourceMappingURL=multi-simulation.js.map