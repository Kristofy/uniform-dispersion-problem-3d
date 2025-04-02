import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

document.addEventListener("DOMContentLoaded", main, false);

// Cell types enum that matches the C++ enum
enum CellType {
    EMPTY = 0,
    WALL = 1,
    ROBOT = 2,
    SETTLED_ROBOT = 3,
    DOOR = 4
}

// Interface for our WebAssembly exports
interface WasmExports {
    addone: (arg: number) => number;
    init_grid: (x: number, y: number, z: number) => void;
    get_cell: (x: number, y: number, z: number) => number;
    set_cell: (x: number, y: number, z: number, value: number) => number;
    get_grid_size_x: () => number;
    get_grid_size_y: () => number;
    get_grid_size_z: () => number;
    create_demo_grid: () => void;
}

/**
 * Loads a WebAssembly module and returns its exports.
 */
async function wasmLoad<T extends object>(fileName: string, imports: WebAssembly.Imports): Promise<T> {
    // Use fetch instead of XMLHttpRequest for better handling of binary data
    const response = await fetch(fileName);
    if (!response.ok) {
        throw new Error(`Failed to load WebAssembly module: ${response.statusText}`);
    }
    
    const wasmBuffer = await response.arrayBuffer();
    const wasmModule = await WebAssembly.compile(wasmBuffer);
    const instance = await WebAssembly.instantiate(wasmModule, imports);
    
    return instance.exports as T;
}

class Grid3DRenderer {
    private scene: THREE.Scene;
    private camera: THREE.PerspectiveCamera;
    private renderer: THREE.WebGLRenderer;
    private controls: OrbitControls;
    private wasmModule: WasmExports;
    private cellMeshes: THREE.Mesh[] = [];
    private cellSize = 1;
    private cellSpacing = 0.1;
    private showEmptyCells = false;
    private raycaster = new THREE.Raycaster();
    private mouse = new THREE.Vector2();
    private selectedCellType: CellType = CellType.WALL;
    private hoveredCell: THREE.Mesh | null = null;
    private hoveredCellOriginalMaterial: THREE.Material | null = null;
    private highlightMaterial = new THREE.MeshPhongMaterial({ 
        color: 0xffff00,
        transparent: true,
        opacity: 0.7,
        emissive: 0x555500
    });
    
    // Movement controls
    private moveSpeed = 0.2;
    private wasdEnabled = false;
    private keyStates: { [key: string]: boolean } = {};
    private moveVector = new THREE.Vector3();
    private cameraDirection = new THREE.Vector3();
    
    // Drag control in WASD mode
    private isDragging = false;
    private dragStartPoint = new THREE.Vector3();
    private dragStartMouseX = 0;
    private dragStartMouseY = 0;
    private prevDeltaX = 0;
    private prevDeltaY = 0;
    private groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0); // y=0 plane for fallback
    private dragSensitivity = 0.01; // Lower for smoother rotation
    
    // Materials for different cell types
    private materials = {
        [CellType.EMPTY]: new THREE.MeshPhongMaterial({ 
            color: 0xffffff, 
            transparent: true, 
            opacity: 0.1,
            wireframe: true 
        }),
        [CellType.WALL]: new THREE.MeshPhongMaterial({ 
            color: 0x808080 
        }),
        [CellType.ROBOT]: new THREE.MeshPhongMaterial({ 
            color: 0x00ff00, 
            emissive: 0x006600 
        }),
        [CellType.SETTLED_ROBOT]: new THREE.MeshPhongMaterial({ 
            color: 0x0000ff, 
            emissive: 0x000066 
        }),
        [CellType.DOOR]: new THREE.MeshPhongMaterial({ 
            color: 0xff8800, 
            emissive: 0x663300 
        })
    };
    
    // Geometry for cells
    private cellGeometry = new THREE.BoxGeometry(this.cellSize, this.cellSize, this.cellSize);
    
    constructor(wasmModule: WasmExports, container: HTMLElement) {
        this.wasmModule = wasmModule;
        
        // Create the THREE.js scene
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x111111);
        
        // Set up camera
        const aspectRatio = container.clientWidth / container.clientHeight;
        this.camera = new THREE.PerspectiveCamera(75, aspectRatio, 0.1, 1000);
        this.camera.position.set(15, 15, 15);
        this.camera.lookAt(0, 0, 0);
        
        // Set up renderer
        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setSize(container.clientWidth, container.clientHeight);
        this.renderer.setPixelRatio(window.devicePixelRatio);
        container.appendChild(this.renderer.domElement);
        
        // Add orbit controls for camera
        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.1;
        
        // Create lights
        this.addLights();
        
        // Add axes helper
        const axesHelper = new THREE.AxesHelper(10);
        this.scene.add(axesHelper);
        
        // Add event listeners for cell interaction
        this.setupInteraction(container);
        
        // Handle window resize
        window.addEventListener('resize', () => this.onWindowResize(container), false);
        
        // Start animation loop
        this.animate();
    }
    
    // Add interaction handlers
    private setupInteraction(container: HTMLElement) {
        // Mouse move for highlighting cells
        container.addEventListener('mousemove', (event) => {
            // Calculate mouse position in normalized device coordinates
            this.mouse.x = (event.clientX / container.clientWidth) * 2 - 1;
            this.mouse.y = - (event.clientY / container.clientHeight) * 2 + 1;
            
            // Handle dragging in WASD mode
            if (this.wasdEnabled && this.isDragging) {
                this.handleDragMove();
            }
        });
        
        // Click to modify cells
        container.addEventListener('click', (event) => {
            if (this.hoveredCell) {
                // Get the cell coordinates from the hovered mesh's userData
                const cellData = this.hoveredCell.userData;
                if (cellData && typeof cellData.x === 'number') {
                    // Update the cell in the WASM module
                    this.wasmModule.set_cell(cellData.x, cellData.y, cellData.z, this.selectedCellType);
                    
                    // Re-render the grid to reflect changes
                    this.renderGrid();
                }
            }
        });
        
        // Mouse down for dragging in WASD mode
        container.addEventListener('mousedown', (event) => {
            if (this.wasdEnabled) {
                this.isDragging = true;
                this.handleDragStart();
            }
        });
        
        // Mouse up to end drag
        window.addEventListener('mouseup', () => {
            this.isDragging = false;
        });
        
        // Keyboard controls for movement
        window.addEventListener('keydown', (event) => {
            this.keyStates[event.key] = true;
        });
        
        window.addEventListener('keyup', (event) => {
            this.keyStates[event.key] = false;
        });
    }
    
    // Set currently selected cell type
    public setSelectedCellType(cellType: CellType) {
        this.selectedCellType = cellType;
    }
    
    // Toggle showing empty cells
    public toggleEmptyCells(show: boolean) {
        this.showEmptyCells = show;
        this.renderGrid();
    }
    
    // Set transparency for wall cells
    public setWallTransparency(opacity: number) {
        const material = this.materials[CellType.WALL] as THREE.MeshPhongMaterial;
        material.opacity = opacity;
        material.transparent = opacity < 1.0;
        
        // Update all wall cells
        this.cellMeshes.forEach(mesh => {
            if (mesh.userData.type === CellType.WALL) {
                const meshMaterial = mesh.material as THREE.MeshPhongMaterial;
                meshMaterial.opacity = opacity;
                meshMaterial.transparent = opacity < 1.0;
                meshMaterial.needsUpdate = true;
            }
        });
    }
    
    // Toggle between WASD controls and orbital controls
    public toggleWASDControls(enable: boolean) {
        this.wasdEnabled = enable;
        
        // Always keep rotation enabled regardless of WASD state
        this.controls.enableRotate = true;
        
        if (!enable) {
            // Reset any key states when disabling WASD
            this.keyStates = {};
            
            // Start animation to return to default position
            this.animateCameraToDefaultPosition();
        }
    }
    
    // Animate camera back to default position
    private animateCameraToDefaultPosition() {
        const defaultPosition = new THREE.Vector3(15, 15, 15);
        const defaultTarget = new THREE.Vector3(0, 0, 0);
        
        // Store starting position and target
        const startPosition = this.camera.position.clone();
        const startTarget = this.controls.target.clone();
        
        // Animation parameters
        const duration = 1000; // milliseconds
        const startTime = performance.now();
        
        // Animation function
        const animate = (currentTime: number) => {
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / duration, 1);
            
            // Ease function (cubic ease-out)
            const ease = 1 - Math.pow(1 - progress, 3);
            
            // Interpolate camera position
            this.camera.position.lerpVectors(startPosition, defaultPosition, ease);
            
            // Interpolate controls target
            this.controls.target.lerpVectors(startTarget, defaultTarget, ease);
            
            // Update controls
            this.controls.update();
            
            // Continue animation if not complete
            if (progress < 1) {
                requestAnimationFrame(animate);
            }
        };
        
        // Start animation
        requestAnimationFrame(animate);
    }
    
    // Add lights to the scene
    private addLights() {
        // Ambient light
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
        this.scene.add(ambientLight);
        
        // Directional lights from different angles
        const directions = [
            { position: [10, 20, 10], intensity: 0.8 },
            { position: [-10, 20, 10], intensity: 0.4 },
            { position: [0, -10, -10], intensity: 0.3 }
        ];
        
        directions.forEach(dir => {
            const light = new THREE.DirectionalLight(0xffffff, dir.intensity);
            light.position.set(...dir.position as [number, number, number]);
            this.scene.add(light);
        });
    }
    
    // Update the renderer on window resize
    private onWindowResize(container: HTMLElement) {
        const width = container.clientWidth;
        const height = container.clientHeight;
        
        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(width, height);
    }
    
    // Animation loop with raycasting for cell highlighting
    private animate() {
        requestAnimationFrame(() => this.animate());
        
        // Update the picking ray with the camera and mouse position
        this.raycaster.setFromCamera(this.mouse, this.camera);
        
        // Calculate objects intersecting the picking ray
        const intersects = this.raycaster.intersectObjects(this.cellMeshes);
        
        // Restore previously hovered cell material if there was one
        if (this.hoveredCell && this.hoveredCellOriginalMaterial) {
            this.hoveredCell.material = this.hoveredCellOriginalMaterial;
            this.hoveredCell = null;
            this.hoveredCellOriginalMaterial = null;
        }
        
        // Handle new intersection
        if (intersects.length > 0) {
            this.hoveredCell = intersects[0].object as THREE.Mesh;
            this.hoveredCellOriginalMaterial = Array.isArray(this.hoveredCell.material) 
                ? this.hoveredCell.material[0] 
                : this.hoveredCell.material;
            this.hoveredCell.material = this.highlightMaterial;
        }
        
        // Handle keyboard movement when WASD mode is enabled
        if (this.wasdEnabled) {
            // Calculate movement based on key states
            this.moveVector.set(0, 0, 0);
            
            // Forward/backward movement (along camera direction)
            if (this.keyStates['w'] || this.keyStates['W']) {
                this.camera.getWorldDirection(this.cameraDirection);
                this.moveVector.add(this.cameraDirection.multiplyScalar(this.moveSpeed));
            }
            if (this.keyStates['s'] || this.keyStates['S']) {
                this.camera.getWorldDirection(this.cameraDirection);
                this.moveVector.add(this.cameraDirection.multiplyScalar(-this.moveSpeed));
            }
            
            // Left/right movement (perpendicular to camera direction)
            if (this.keyStates['a'] || this.keyStates['A']) {
                this.camera.getWorldDirection(this.cameraDirection);
                this.cameraDirection.cross(this.camera.up).normalize().multiplyScalar(-this.moveSpeed);
                this.moveVector.add(this.cameraDirection);
            }
            if (this.keyStates['d'] || this.keyStates['D']) {
                this.camera.getWorldDirection(this.cameraDirection);
                this.cameraDirection.cross(this.camera.up).normalize().multiplyScalar(this.moveSpeed);
                this.moveVector.add(this.cameraDirection);
            }
            
            // Apply movement to camera position if there is movement
            if (this.moveVector.length() > 0) {
                // Move the camera
                this.camera.position.add(this.moveVector);
                
                // Move the orbit controls target along with the camera to maintain relative position
                // This keeps the camera pointing in the same direction during WASD movement
                // while still allowing orbit controls to work
                this.controls.target.add(this.moveVector);
            }
        }
        
        // Update controls last (they will update the camera based on mouse input)
        this.controls.update();
        
        this.renderer.render(this.scene, this.camera);
    }
    
    // Clear the grid visualization
    public clearGrid() {
        this.cellMeshes.forEach(mesh => this.scene.remove(mesh));
        this.cellMeshes = [];
    }
    
    // Render the grid from WASM data
    public renderGrid() {
        this.clearGrid();
        
        const sizeX = this.wasmModule.get_grid_size_x();
        const sizeY = this.wasmModule.get_grid_size_y();
        const sizeZ = this.wasmModule.get_grid_size_z();
        
        // Calculate grid center for positioning
        const centerX = (sizeX - 1) * (this.cellSize + this.cellSpacing) / 2;
        const centerY = (sizeY - 1) * (this.cellSize + this.cellSpacing) / 2;
        const centerZ = (sizeZ - 1) * (this.cellSize + this.cellSpacing) / 2;
        
        // Create a mesh for each cell
        for (let x = 0; x < sizeX; x++) {
            for (let y = 0; y < sizeY; y++) {
                for (let z = 0; z < sizeZ; z++) {
                    const cellType = this.wasmModule.get_cell(x, y, z);
                    
                    // Add cell to scene if it's not empty or if we're showing empty cells
                    if (cellType !== CellType.EMPTY || this.showEmptyCells) {
                        this.addCellToScene(x, y, z, cellType);
                    }
                }
            }
        }
        
        // Create a grid helper at the base level
        const gridHelper = new THREE.GridHelper(
            Math.max(sizeX, sizeZ) * (this.cellSize + this.cellSpacing) + 2, 
            Math.max(sizeX, sizeZ)
        );
        gridHelper.position.y = -0.5;
        this.scene.add(gridHelper);
    }
    
    // Add a cell mesh to the scene
    private addCellToScene(x: number, y: number, z: number, cellType: CellType) {
        // Position calculation to center the grid
        const posX = x * (this.cellSize + this.cellSpacing) - ((this.wasmModule.get_grid_size_x() - 1) * (this.cellSize + this.cellSpacing)) / 2;
        const posY = y * (this.cellSize + this.cellSpacing);
        const posZ = z * (this.cellSize + this.cellSpacing) - ((this.wasmModule.get_grid_size_z() - 1) * (this.cellSize + this.cellSpacing)) / 2;
        
        // Select material based on cell type
        const material = this.materials[cellType].clone();
        
        // Create mesh
        const mesh = new THREE.Mesh(this.cellGeometry, material);
        mesh.position.set(posX, posY, posZ);
        
        // Store cell coordinates and type in user data for later reference
        mesh.userData = {
            x: x,
            y: y,
            z: z,
            type: cellType
        };
        
        // Add to scene and keep track of it
        this.scene.add(mesh);
        this.cellMeshes.push(mesh);
        
        // For robot types, add a small animation
        if (cellType === CellType.ROBOT || cellType === CellType.SETTLED_ROBOT) {
            this.animateRobot(mesh);
        }
    }
    
    // Simple animation for robot cells
    private animateRobot(mesh: THREE.Mesh) {
        const initialY = mesh.position.y;
        const animationData = {
            phase: Math.random() * Math.PI * 2, // Random starting phase
            speed: 0.5 + Math.random() * 0.5,   // Random speed
        };
        
        // Animation closure
        const animate = () => {
            animationData.phase += 0.02 * animationData.speed;
            mesh.position.y = initialY + Math.sin(animationData.phase) * 0.2;
            requestAnimationFrame(animate);
        };
        
        // Start animation
        animate();
    }
    
    // Handle drag move in WASD mode
    private handleDragMove() {
        if (!this.isDragging) return;

        // Calculate the current mouse position's delta from the start position
        const deltaX = this.mouse.x - this.dragStartMouseX;
        const deltaY = this.mouse.y - this.dragStartMouseY;
        
        // Use smaller rotation factor for more precise control
        const rotationFactor = this.dragSensitivity;
        
        // Update camera rotation directly in first-person style
        // Horizontal rotation (around Y axis)
        this.camera.position.sub(this.controls.target);
        this.camera.position.applyAxisAngle(new THREE.Vector3(0, 1, 0), -deltaX * rotationFactor);
        this.camera.position.add(this.controls.target);
        
        // Vertical rotation (around local X axis)
        // Get right vector for proper up/down rotation
        const right = new THREE.Vector3();
        this.camera.getWorldDirection(this.cameraDirection);
        right.crossVectors(this.camera.up, this.cameraDirection).normalize();
        
        // Apply vertical rotation with limits to prevent flipping
        const verticalAngle = -deltaY * rotationFactor;
        // Get current up-down angle
        const currentAngle = this.cameraDirection.angleTo(new THREE.Vector3(0, 1, 0)) - Math.PI/2;
        // Limit the angle to avoid camera flipping
        if ((currentAngle + verticalAngle > -Math.PI/2.1) && 
            (currentAngle + verticalAngle < Math.PI/2.1)) {
            this.camera.position.sub(this.controls.target);
            this.camera.position.applyAxisAngle(right, verticalAngle);
            this.camera.position.add(this.controls.target);
        }
        
        // Make camera look at the target point
        this.camera.lookAt(this.controls.target);
        
        // Update starting position for next frame to create continuous movement
        this.dragStartMouseX = this.mouse.x;
        this.dragStartMouseY = this.mouse.y;
    }
    
    // Handle drag start in WASD mode
    private handleDragStart() {
        // Set drag start
        this.dragStartMouseX = this.mouse.x;
        this.dragStartMouseY = this.mouse.y;
        
        // In WASD mode, we want to rotate around the camera's current look-at point
        this.camera.getWorldDirection(this.cameraDirection);
        const lookAtDistance = 10; // Distance to look-at point
        this.controls.target.copy(this.camera.position).add(
            this.cameraDirection.multiplyScalar(lookAtDistance)
        );
    }
}

// Implementation of memset for WebAssembly
function memset(ptr: number, value: number, size: number): number {
    const memory = (window as any).wasmMemory;
    const buffer = new Uint8Array(memory.buffer);
    
    // Fill the memory with the value
    for (let i = 0; i < size; i++) {
        buffer[ptr + i] = value;
    }
    
    return ptr; // Return the original pointer as memset does in C
}

//===============================================================
async function main() {
    // Hide loading message once everything is initialized
    const loadingElement = document.getElementById('loading');
    
    try {
        // Create a container for our 3D scene
        const container = document.createElement('div');
        container.style.width = '100%';
        container.style.height = '100vh';
        document.body.appendChild(container);
        
        // Set up memory for WebAssembly
        const memory = new WebAssembly.Memory({ initial: 100, maximum: 1000 });
        // Make memory accessible globally for our memset function
        (window as any).wasmMemory = memory;
        
        const imports = {
            env: {
                console_log: (arg: number) => {
                    console.log(arg);
                },
                memory: memory,
                memset: memset, // Provide the memset implementation
            },
        };

        // Load the WebAssembly module
        const wasm = await wasmLoad<WasmExports>("main.wasm", imports);
        console.log("WASM module loaded:", wasm);
        
        // Create a demo grid
        wasm.create_demo_grid();
        
        // Create the 3D renderer
        const gridRenderer = new Grid3DRenderer(wasm, container);
        
        // Render the grid
        gridRenderer.renderGrid();
        
        // Add UI controls
        createUI(wasm, gridRenderer);
        
        // Hide loading message
        if (loadingElement) {
            loadingElement.style.display = 'none';
        }
    } catch (error: unknown) {
        console.error("Error initializing application:", error);
        
        if (loadingElement) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            loadingElement.textContent = `Error: ${errorMessage}`;
            loadingElement.style.color = 'red';
        }
    }
}

// Create a simple UI
function createUI(wasm: WasmExports, renderer: Grid3DRenderer) {
    const uiContainer = document.createElement('div');
    uiContainer.style.position = 'absolute';
    uiContainer.style.top = '10px';
    uiContainer.style.left = '10px';
    uiContainer.style.padding = '10px';
    uiContainer.style.backgroundColor = 'rgba(0, 0, 0, 0.6)';
    uiContainer.style.color = 'white';
    uiContainer.style.fontFamily = 'Arial, sans-serif';
    uiContainer.style.borderRadius = '5px';
    uiContainer.style.maxWidth = '250px';
    
    // Title
    const title = document.createElement('h3');
    title.textContent = '3D Grid Visualization';
    title.style.margin = '0 0 10px 0';
    uiContainer.appendChild(title);
    
    // Instructions
    const instructions = document.createElement('p');
    instructions.textContent = 'Use mouse to rotate/zoom. Toggle WASD movement for first-person navigation. Click on cells to change them.';
    instructions.style.margin = '0 0 10px 0';
    instructions.style.fontSize = '14px';
    uiContainer.appendChild(instructions);
    
    // Cell type selection
    const cellTypeContainer = document.createElement('div');
    cellTypeContainer.style.marginBottom = '15px';
    
    const cellTypeLabel = document.createElement('div');
    cellTypeLabel.textContent = 'Select Cell Type:';
    cellTypeLabel.style.marginBottom = '5px';
    cellTypeContainer.appendChild(cellTypeLabel);
    
    // Cell type buttons
    const cellTypes = [
        { type: CellType.EMPTY, name: 'Empty', color: '#ffffff' },
        { type: CellType.WALL, name: 'Wall', color: '#808080' },
        { type: CellType.ROBOT, name: 'Robot', color: '#00ff00' },
        { type: CellType.SETTLED_ROBOT, name: 'Settled Robot', color: '#0000ff' },
        { type: CellType.DOOR, name: 'Door', color: '#ff8800' }
    ];
    
    const buttonContainer = document.createElement('div');
    buttonContainer.style.display = 'flex';
    buttonContainer.style.flexWrap = 'wrap';
    buttonContainer.style.gap = '5px';
    
    cellTypes.forEach(cellType => {
        const button = document.createElement('button');
        button.textContent = cellType.name;
        button.style.backgroundColor = cellType.color;
        button.style.color = ['Empty', 'Wall'].includes(cellType.name) ? 'black' : 'white';
        button.style.padding = '5px 10px';
        button.style.flex = '1 0 calc(50% - 5px)';  // Two buttons per row, with gap
        button.style.minWidth = '0';  // Allow button to shrink
        
        button.addEventListener('click', () => {
            renderer.setSelectedCellType(cellType.type);
            // Highlight selected button
            Array.from(buttonContainer.children).forEach(child => {
                (child as HTMLElement).style.border = 'none';
            });
            button.style.border = '2px solid white';
        });
        
        buttonContainer.appendChild(button);
    });
    
    cellTypeContainer.appendChild(buttonContainer);
    uiContainer.appendChild(cellTypeContainer);
    
    // Toggle empty cells
    const showEmptyCellsContainer = document.createElement('div');
    showEmptyCellsContainer.style.marginBottom = '15px';
    
    const emptyCellsCheckbox = document.createElement('input');
    emptyCellsCheckbox.type = 'checkbox';
    emptyCellsCheckbox.id = 'show-empty';
    emptyCellsCheckbox.addEventListener('change', (e) => {
        const target = e.target as HTMLInputElement;
        renderer.toggleEmptyCells(target.checked);
    });
    
    const emptyCellsLabel = document.createElement('label');
    emptyCellsLabel.setAttribute('for', 'show-empty');
    emptyCellsLabel.textContent = 'Show Empty Cells';
    emptyCellsLabel.style.marginLeft = '5px';
    
    showEmptyCellsContainer.appendChild(emptyCellsCheckbox);
    showEmptyCellsContainer.appendChild(emptyCellsLabel);
    uiContainer.appendChild(showEmptyCellsContainer);
    
    // Wall transparency slider
    const transparencyContainer = document.createElement('div');
    transparencyContainer.style.marginBottom = '15px';
    
    const transparencyLabel = document.createElement('label');
    transparencyLabel.textContent = 'Wall Transparency:';
    transparencyLabel.style.display = 'block';
    transparencyLabel.style.marginBottom = '5px';
    
    const transparencySlider = document.createElement('input');
    transparencySlider.type = 'range';
    transparencySlider.min = '0';
    transparencySlider.max = '100';
    transparencySlider.value = '100';
    transparencySlider.style.width = '100%';
    
    transparencySlider.addEventListener('input', (e) => {
        const target = e.target as HTMLInputElement;
        const opacity = parseInt(target.value) / 100;
        renderer.setWallTransparency(opacity);
    });
    
    transparencyContainer.appendChild(transparencyLabel);
    transparencyContainer.appendChild(transparencySlider);
    uiContainer.appendChild(transparencyContainer);
    
    // WASD movement toggle
    const wasdContainer = document.createElement('div');
    wasdContainer.style.marginBottom = '15px';
    
    const wasdCheckbox = document.createElement('input');
    wasdCheckbox.type = 'checkbox';
    wasdCheckbox.id = 'wasd-movement';
    wasdCheckbox.addEventListener('change', (e) => {
        const target = e.target as HTMLInputElement;
        renderer.toggleWASDControls(target.checked);
    });
    
    const wasdLabel = document.createElement('label');
    wasdLabel.setAttribute('for', 'wasd-movement');
    wasdLabel.textContent = 'Enable WASD Movement';
    wasdLabel.style.marginLeft = '5px';
    
    wasdContainer.appendChild(wasdCheckbox);
    wasdContainer.appendChild(wasdLabel);
    uiContainer.appendChild(wasdContainer);
    
    // Reset button
    const resetButton = document.createElement('button');
    resetButton.textContent = 'Reset Demo Grid';
    resetButton.style.width = '100%';
    resetButton.style.padding = '8px';
    resetButton.style.backgroundColor = '#2a6496';
    resetButton.onclick = () => {
        wasm.create_demo_grid();
        renderer.renderGrid();
    };
    uiContainer.appendChild(resetButton);
    
    document.body.appendChild(uiContainer);
    
    // Set default selected cell type
    (buttonContainer.children[1] as HTMLElement).click();  // Select Wall by default
}
