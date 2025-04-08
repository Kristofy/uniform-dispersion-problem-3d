import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
document.addEventListener("DOMContentLoaded", main, false);
// Cell types enum that matches the C++ enum
var CellType;
(function (CellType) {
    CellType[CellType["EMPTY"] = 0] = "EMPTY";
    CellType[CellType["WALL"] = 1] = "WALL";
    CellType[CellType["ROBOT"] = 2] = "ROBOT";
    CellType[CellType["SETTLED_ROBOT"] = 3] = "SETTLED_ROBOT";
    CellType[CellType["DOOR"] = 4] = "DOOR";
})(CellType || (CellType = {}));
// Robot differential states matching the C++ enum
var RobotDiff;
(function (RobotDiff) {
    RobotDiff[RobotDiff["NoChange"] = 0] = "NoChange";
    RobotDiff[RobotDiff["Moving"] = 1] = "Moving";
    RobotDiff[RobotDiff["Stopped"] = 2] = "Stopped";
    RobotDiff[RobotDiff["Settled"] = 3] = "Settled";
    RobotDiff[RobotDiff["Invalid"] = 4] = "Invalid";
})(RobotDiff || (RobotDiff = {}));
// Direction enum matching the six cardinal directions in the C++ code
var Direction;
(function (Direction) {
    Direction[Direction["Up"] = 0] = "Up";
    Direction[Direction["Forward"] = 1] = "Forward";
    Direction[Direction["Left"] = 2] = "Left";
    Direction[Direction["Down"] = 3] = "Down";
    Direction[Direction["Back"] = 4] = "Back";
    Direction[Direction["Right"] = 5] = "Right"; // (1,0,0)
})(Direction || (Direction = {}));
// Direction vectors matching the C++ code
const DirectionVectors = {
    [Direction.Up]: new THREE.Vector3(0, 1, 0),
    [Direction.Forward]: new THREE.Vector3(0, 0, 1),
    [Direction.Left]: new THREE.Vector3(-1, 0, 0),
    [Direction.Down]: new THREE.Vector3(0, -1, 0),
    [Direction.Back]: new THREE.Vector3(0, 0, -1),
    [Direction.Right]: new THREE.Vector3(1, 0, 0)
};
// Function to decode boxed robot state value from WASM
function decodeRobotState(boxedValue) {
    if (boxedValue < 0)
        return null; // Invalid state
    // Extract state and direction
    // State is in the first 3 bits (0-7), direction in bits 3-5 (0-7)
    const state = boxedValue & 0x7; // First 3 bits for state
    const direction = (boxedValue >> 3) & 0x7; // Next 3 bits for direction
    return {
        diffState: state,
        direction: direction
    };
}
/**
 * Loads a WebAssembly module and returns its exports.
 */
async function wasmLoad(fileName, imports) {
    // Use fetch instead of XMLHttpRequest for better handling of binary data
    const response = await fetch(fileName);
    if (!response.ok) {
        throw new Error(`Failed to load WebAssembly module: ${response.statusText}`);
    }
    const wasmBuffer = await response.arrayBuffer();
    const wasmModule = await WebAssembly.compile(wasmBuffer);
    const instance = await WebAssembly.instantiate(wasmModule, imports);
    return instance.exports;
}
class Grid3DRenderer {
    // Enhanced robot event logging system
    logRobotEvent(eventType, robotId, position, details) {
        const timestamp = new Date().toISOString().substr(11, 12); // HH:MM:SS.mmm format
        const posStr = position ? `at (${position.x},${position.y},${position.z})` : '';
        const detailsStr = details ? `: ${details}` : '';
        // console.log(`[${timestamp}] Robot #${robotId} ${eventType} ${posStr}${detailsStr}`);
        // Future enhancement: send to UI log panel if needed
    }
    constructor(wasmModule, container, crosshairElement) {
        this.cellMeshes = [];
        this.cellSize = 1;
        this.cellSpacing = 0.1;
        this.showEmptyCells = false;
        this.raycaster = new THREE.Raycaster();
        this.mouse = new THREE.Vector2();
        this.selectedCellType = CellType.WALL;
        this.hoveredCell = null;
        this.hoveredCellOriginalMaterial = null;
        this.highlightMaterial = new THREE.MeshPhongMaterial({
            color: 0xffff00,
            transparent: true,
            opacity: 0.7,
            emissive: 0x555500
        });
        // New animation tracking
        this.robotAnimations = new Map();
        this.animationDuration = 500; // ms
        this.gridPositionToWorldPosition = new Map();
        // Movement controls
        this.moveSpeed = 0.2;
        this.wasdEnabled = false;
        this.keyStates = {};
        this.moveVector = new THREE.Vector3();
        this.cameraDirection = new THREE.Vector3();
        // Drag control in WASD mode
        this.isDragging = false;
        this.dragStartPoint = new THREE.Vector3();
        this.dragStartMouseX = 0;
        this.dragStartMouseY = 0;
        this.prevDeltaX = 0;
        this.prevDeltaY = 0;
        this.groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0); // y=0 plane for fallback
        this.dragSensitivity = 0.01; // Lower for smoother rotation
        // Pointer lock properties
        this.isPointerLocked = false;
        this.pointerLockEnabled = false;
        // Materials for different cell types
        this.materials = {
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
        // Store opacity values for each material type
        this.materialOpacities = {};
        // Geometry for cells
        this.cellGeometry = new THREE.BoxGeometry(this.cellSize, this.cellSize, this.cellSize);
        // Add robot state tracking
        this.robotMeshMap = new Map(); // Maps robot index to mesh
        this.robotStateMap = new Map(); // Maps robot index to its state
        this.maxRobotIndex = 100; // Match MAX_ROBOTS from C++
        this.wasmModule = wasmModule;
        this.crosshairElement = crosshairElement; // Store crosshair element
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
        // Initialize material opacities with defaults
        // this.materialOpacities[CellType.EMPTY] = 1.0; // Empty cells are fully visible (100% opacity) by default
        // this.materialOpacities[CellType.WALL] = 0.0;
        // this.materialOpacities[CellType.ROBOT] = 1.0;
        // this.materialOpacities[CellType.SETTLED_ROBOT] = 1.0;
        // this.materialOpacities[CellType.DOOR] = 1.0;
        this.setMaterialOpacity(CellType.EMPTY, 1.0); // Empty cells are fully visible (100% opacity) by default
        this.setMaterialOpacity(CellType.WALL, 0.0);
        this.setMaterialOpacity(CellType.ROBOT, 1.0);
        this.setMaterialOpacity(CellType.SETTLED_ROBOT, 1.0);
        this.setMaterialOpacity(CellType.DOOR, 1.0);
        // Show empty cells by default since they'll be controlled by transparency
        this.showEmptyCells = true;
        // Create lights
        this.addLights();
        // Add axes helper
        const axesHelper = new THREE.AxesHelper(10);
        this.scene.add(axesHelper);
        // Add event listeners for cell interaction
        this.setupInteraction(container);
        // Handle window resize
        window.addEventListener('resize', () => this.onWindowResize(container), false);
        // Set up pointer lock change and error event listeners
        document.addEventListener('pointerlockchange', () => this.pointerLockChangeHandler(), false);
        document.addEventListener('pointerlockerror', () => this.pointerLockErrorHandler(), false);
        // Start animation loop
        this.animate();
    }
    // Pointer lock event handlers
    pointerLockChangeHandler() {
        if (document.pointerLockElement === this.renderer.domElement) {
            this.isPointerLocked = true;
            this.crosshairElement.style.display = 'block'; // Show crosshair
        }
        else {
            this.isPointerLocked = false;
            this.crosshairElement.style.display = 'none'; // Hide crosshair
            // If WASD is still enabled but we're not locked, try to relock
            if (this.pointerLockEnabled && this.wasdEnabled) {
                // Add a slight delay to prevent immediate relock when escape is pressed
                setTimeout(() => {
                    if (this.pointerLockEnabled && this.wasdEnabled) {
                        this.requestPointerLock();
                    }
                }, 200);
            }
        }
    }
    pointerLockErrorHandler() {
        console.error('Pointer lock error');
        this.crosshairElement.style.display = 'none'; // Ensure crosshair is hidden on error
    }
    requestPointerLock() {
        if (!this.isPointerLocked && this.pointerLockEnabled) {
            // Unfocus any active UI element before locking
            if (document.activeElement && document.activeElement instanceof HTMLElement) {
                document.activeElement.blur();
            }
            this.renderer.domElement.requestPointerLock();
        }
    }
    exitPointerLock() {
        if (this.isPointerLocked) {
            document.exitPointerLock();
        }
    }
    // Toggle pointer lock functionality
    togglePointerLock(enable) {
        this.pointerLockEnabled = enable;
        if (enable && this.wasdEnabled) {
            this.requestPointerLock();
        }
        else {
            this.exitPointerLock();
        }
    }
    // Add interaction handlers
    setupInteraction(container) {
        // Mouse move for highlighting cells and camera rotation in pointer lock
        container.addEventListener('mousemove', (event) => {
            // Only update mouse coordinates from event if not pointer locked
            if (!this.isPointerLocked) {
                // Calculate mouse position in normalized device coordinates
                const rect = container.getBoundingClientRect();
                this.mouse.x = ((event.clientX - rect.left) / container.clientWidth) * 2 - 1;
                this.mouse.y = -((event.clientY - rect.top) / container.clientHeight) * 2 + 1;
            }
            else {
                // In pointer lock, use movementX/Y for camera rotation
                const movementX = event.movementX || 0;
                const movementY = event.movementY || 0;
                // Apply rotation based on mouse movement
                const rotationSpeed = 0.002; // Adjust sensitivity
                // --- Minecraft-style Rotation ---
                // Horizontal rotation (Yaw): Rotate around the global Y axis
                const yawAngle = -movementX * rotationSpeed; // Reverted: Negative sign for correct left/right mouse movement
                this.camera.rotateOnWorldAxis(new THREE.Vector3(0, 1, 0), yawAngle);
                // Vertical rotation (Pitch): Rotate around the camera's local X axis
                const pitchAngle = -movementY * rotationSpeed; // Negative for correct mouse movement (up/down)
                // Calculate the current pitch angle to enforce limits
                const currentPitch = this.camera.rotation.x;
                const maxPitch = Math.PI / 2 - 0.1; // Limit slightly before straight up
                const minPitch = -Math.PI / 2 + 0.1; // Limit slightly before straight down
                // Apply pitch rotation only if within limits
                if (currentPitch + pitchAngle > minPitch && currentPitch + pitchAngle < maxPitch) {
                    this.camera.rotateX(pitchAngle);
                }
                // --- End Minecraft-style Rotation ---
            }
            // Handle dragging in WASD mode (when not pointer locked)
            if (this.wasdEnabled && this.isDragging && !this.isPointerLocked) {
                this.handleDragMove();
            }
        });
        // Click to modify cells (Orbit mode) or request pointer lock
        container.addEventListener('click', (event) => {
            // If WASD mode is enabled with pointer lock, first ensure pointer is locked
            if (this.wasdEnabled && this.pointerLockEnabled && !this.isPointerLocked) {
                this.requestPointerLock();
                return; // Don't process the click further
            }
            // If in orbit mode, handle cell modification
            if (!this.wasdEnabled && !this.isPointerLocked) {
                this.raycaster.setFromCamera(this.mouse, this.camera);
                const intersects = this.raycaster.intersectObjects(this.cellMeshes);
                if (intersects.length > 0) {
                    // We clicked on an existing cell
                    const cellData = intersects[0].object.userData;
                    if (cellData && typeof cellData.x === 'number') {
                        // Update the cell in the WASM module (replace with new type)
                        this.wasmModule.set_cell(cellData.x, cellData.y, cellData.z, this.selectedCellType);
                        this.renderGrid();
                    }
                }
                else {
                    // Try to place a block in empty space (similar to Minecraft)
                    const allObjects = this.scene.children.filter(child => child instanceof THREE.Mesh);
                    const blockIntersects = this.raycaster.intersectObjects(allObjects);
                    if (blockIntersects.length > 0 && this.selectedCellType !== CellType.EMPTY) {
                        const intersection = blockIntersects[0];
                        const normal = intersection.face?.normal.clone();
                        if (normal && intersection.object instanceof THREE.Mesh && intersection.object.userData) {
                            // Convert the normal to grid space
                            normal.x = Math.round(normal.x);
                            normal.y = Math.round(normal.y);
                            normal.z = Math.round(normal.z);
                            const clickedMesh = intersection.object;
                            if (clickedMesh.userData && typeof clickedMesh.userData.x === 'number') {
                                const clickedBlock = clickedMesh.userData;
                                const newX = clickedBlock.x + normal.x;
                                const newY = clickedBlock.y + normal.y;
                                const newZ = clickedBlock.z + normal.z;
                                if (this.isWithinBounds(newX, newY, newZ)) {
                                    this.wasmModule.set_cell(newX, newY, newZ, this.selectedCellType);
                                    this.renderGrid();
                                }
                            }
                        }
                    }
                }
            }
        });
        // Mouse down for dragging (WASD orbit) and pointer lock interactions
        container.addEventListener('mousedown', (event) => {
            if (this.wasdEnabled) {
                if (this.isPointerLocked) {
                    // Handle block interaction in pointer lock mode
                    this.handlePointerLockInteraction(event.button);
                }
                else {
                    // Start dragging for camera rotation if not locked
                    this.isDragging = true;
                    this.handleDragStart();
                }
            }
        });
        // Mouse up to end drag
        window.addEventListener('mouseup', () => {
            this.isDragging = false;
        });
        // Prevent context menu on right click
        container.addEventListener('contextmenu', (event) => {
            event.preventDefault();
        });
        // Keyboard controls for movement
        window.addEventListener('keydown', (event) => {
            this.keyStates[event.key] = true;
            // Handle Escape key to disable pointer lock but keep WASD mode
            if (event.key === 'Escape' && this.isPointerLocked) {
                // Browser handles exit, pointerLockChangeHandler will update state
                this.pointerLockEnabled = false; // Temporarily disable auto-relock
                // Re-enable after a short timeout if WASD is still active
                setTimeout(() => {
                    if (this.wasdEnabled) {
                        this.pointerLockEnabled = true; // Re-enable but don't force lock
                    }
                }, 500);
            }
        });
        window.addEventListener('keyup', (event) => {
            this.keyStates[event.key] = false;
        });
    }
    // Handle block placement/deletion in pointer lock mode
    handlePointerLockInteraction(button) {
        if (!this.isPointerLocked)
            return;
        // Raycast from the center of the screen
        this.mouse.set(0, 0); // Center of screen
        this.raycaster.setFromCamera(this.mouse, this.camera);
        const intersects = this.raycaster.intersectObjects(this.cellMeshes);
        if (intersects.length > 0) {
            const intersection = intersects[0];
            const mesh = intersection.object;
            const cellData = mesh.userData;
            if (cellData && typeof cellData.x === 'number') {
                if (button === 0) { // Left click - Delete block
                    // console.log(`TS: Deleting block at (${cellData.x}, ${cellData.y}, ${cellData.z})`);
                    this.wasmModule.set_cell(cellData.x, cellData.y, cellData.z, CellType.EMPTY);
                    this.renderGrid();
                }
                else if (button === 2) { // Right click - Place block
                    const normal = intersection.face?.normal.clone();
                    if (normal) {
                        // Convert the normal to grid space offset
                        normal.x = Math.round(normal.x);
                        normal.y = Math.round(normal.y);
                        normal.z = Math.round(normal.z);
                        // Calculate the position of the new block
                        const newX = cellData.x + normal.x;
                        const newY = cellData.y + normal.y;
                        const newZ = cellData.z + normal.z;
                        // Check if the new position is within grid bounds
                        if (this.isWithinBounds(newX, newY, newZ)) {
                            // console.log(`TS: Placing block type ${this.selectedCellType} at (${newX}, ${newY}, ${newZ})`);
                            // Set the cell at the new location with the selected type
                            this.wasmModule.set_cell(newX, newY, newZ, this.selectedCellType);
                            this.renderGrid();
                        }
                    }
                }
            }
        }
    }
    // Check if coordinates are within grid bounds
    isWithinBounds(x, y, z) {
        return x >= 0 && x < this.wasmModule.get_grid_size_x() &&
            y >= 0 && y < this.wasmModule.get_grid_size_y() &&
            z >= 0 && z < this.wasmModule.get_grid_size_z();
    }
    // Set currently selected cell type
    setSelectedCellType(cellType) {
        this.selectedCellType = cellType;
    }
    // Toggle showing empty cells
    toggleEmptyCells(show) {
        this.showEmptyCells = show;
        this.renderGrid();
    }
    // Set transparency for any specific material type
    setMaterialOpacity(cellType, opacity) {
        const material = this.materials[cellType];
        material.opacity = opacity;
        material.transparent = opacity < 1.0;
        material.needsUpdate = true; // Ensure material update propagates
        // Update all existing cells of this type
        this.cellMeshes.forEach(mesh => {
            if (mesh.userData.type === cellType) {
                // Ensure we're updating the instance material, not the shared one
                const meshMaterial = mesh.material;
                if (meshMaterial && meshMaterial.uuid !== material.uuid) { // Check if it's a clone
                    meshMaterial.opacity = opacity;
                    meshMaterial.transparent = opacity < 1.0;
                    meshMaterial.needsUpdate = true;
                }
                else {
                    // If it's sharing the material, we only need to update the source material once (done above)
                }
            }
        });
        // Store opacity settings to reapply when rendering
        this.materialOpacities[cellType] = opacity;
    }
    // Get material opacity for a specific cell type
    getMaterialOpacity(cellType) {
        return this.materialOpacities[cellType] ?? 1.0;
    }
    // Get material for a specific cell type
    getMaterialForCellType(cellType) {
        return this.materials[cellType] || null;
    }
    // Set transparency for wall cells
    setWallTransparency(opacity) {
        this.setMaterialOpacity(CellType.WALL, opacity);
    }
    // Toggle between WASD controls and orbital controls
    toggleWASDControls(enable) {
        this.wasdEnabled = enable;
        // Handle pointer lock state according to WASD state
        if (enable) {
            this.controls.enabled = false; // Disable orbit controls while in WASD mode
            this.pointerLockEnabled = true; // Enable pointer lock
            this.requestPointerLock(); // Request pointer lock immediately
        }
        else {
            // Disable pointer lock when exiting WASD mode
            this.pointerLockEnabled = false;
            this.exitPointerLock(); // This will trigger pointerLockChangeHandler to hide crosshair
            // Re-enable orbit controls
            this.controls.enabled = true;
            // Reset any key states when disabling WASD
            this.keyStates = {};
            // Start animation to return to default position
            this.animateCameraToDefaultPosition();
        }
    }
    // Reset camera to default orbital position
    resetCameraView() {
        // Disable WASD mode if it's active and return its previous state
        const wasWasdEnabled = this.wasdEnabled;
        if (this.wasdEnabled) {
            this.toggleWASDControls(false);
        }
        // Animate camera to default position
        this.animateCameraToDefaultPosition();
        // Return whether WASD was disabled
        return wasWasdEnabled;
    }
    // Animate camera back to default position
    animateCameraToDefaultPosition() {
        const defaultPosition = new THREE.Vector3(15, 15, 15);
        const defaultTarget = new THREE.Vector3(0, 0, 0);
        // Store starting position and target
        const startPosition = this.camera.position.clone();
        const startTarget = this.controls.target.clone();
        // Animation parameters
        const duration = 1000; // milliseconds
        const startTime = performance.now();
        // Animation function
        const animate = (currentTime) => {
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
    addLights() {
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
            light.position.set(...dir.position);
            this.scene.add(light);
        });
    }
    // Update the renderer on window resize
    onWindowResize(container) {
        const width = container.clientWidth;
        const height = container.clientHeight;
        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(width, height);
    }
    // Animation loop with raycasting for cell highlighting
    animate() {
        requestAnimationFrame(() => this.animate());
        const currentTime = performance.now();
        // Update robot movement animations
        this.updateRobotAnimations(currentTime);
        // Update the picking ray with the camera and mouse position
        // If pointer locked, raycast from center, otherwise use mouse position
        if (this.isPointerLocked) {
            this.mouse.set(0, 0); // Center of screen
        }
        this.raycaster.setFromCamera(this.mouse, this.camera);
        // Calculate objects intersecting the picking ray
        const intersects = this.raycaster.intersectObjects(this.cellMeshes);
        // --- Optimized Highlighting Logic --- 
        let currentIntersectedMesh = null;
        if (intersects.length > 0) {
            const intersectedMeshCandidate = intersects[0].object;
            const cellType = intersectedMeshCandidate.userData.type;
            // Only consider non-empty cells for highlighting unless showEmptyCells is true
            if (cellType !== CellType.EMPTY || this.showEmptyCells) {
                currentIntersectedMesh = intersectedMeshCandidate;
            }
        }
        // Check if the hovered cell has changed
        if (currentIntersectedMesh !== this.hoveredCell) {
            // Restore the previously hovered cell's material if there was one
            if (this.hoveredCell && this.hoveredCellOriginalMaterial) {
                this.hoveredCell.material = this.hoveredCellOriginalMaterial;
            }
            // Update to the new hovered cell (or null if no intersection)
            this.hoveredCell = currentIntersectedMesh;
            if (this.hoveredCell) {
                // Store the new original material and apply the highlight
                this.hoveredCellOriginalMaterial = this.hoveredCell.material;
                this.hoveredCell.material = this.highlightMaterial;
            }
            else {
                // No cell is hovered anymore
                this.hoveredCellOriginalMaterial = null;
            }
        }
        // --- End Optimized Highlighting Logic ---
        // Handle keyboard movement when WASD mode is enabled
        if (this.wasdEnabled) {
            // Calculate movement based on key states
            this.moveVector.set(0, 0, 0);
            // Get full camera direction for true Minecraft-like movement
            this.camera.getWorldDirection(this.cameraDirection);
            // Forward/backward movement (follows camera direction)
            if (this.keyStates['w'] || this.keyStates['W']) {
                this.moveVector.add(this.cameraDirection.clone().multiplyScalar(this.moveSpeed));
            }
            if (this.keyStates['s'] || this.keyStates['S']) {
                this.moveVector.add(this.cameraDirection.clone().multiplyScalar(-this.moveSpeed));
            }
            // Strafe movement (perpendicular to camera direction)
            const right = new THREE.Vector3().crossVectors(this.camera.up, this.cameraDirection).normalize();
            if (this.keyStates['a'] || this.keyStates['A']) {
                this.moveVector.add(right.clone().multiplyScalar(this.moveSpeed)); // A = move left
            }
            if (this.keyStates['d'] || this.keyStates['D']) {
                this.moveVector.add(right.clone().multiplyScalar(-this.moveSpeed)); // D = move right
            }
            // Add vertical movement with Space and Shift (global up/down)
            if (this.keyStates[' ']) { // Space key
                this.moveVector.add(new THREE.Vector3(0, this.moveSpeed, 0));
            }
            if (this.keyStates['Shift']) { // Shift key
                this.moveVector.add(new THREE.Vector3(0, -this.moveSpeed, 0));
            }
            // Apply movement to camera position if there is movement
            if (this.moveVector.lengthSq() > 0) { // Use lengthSq for efficiency
                // Move the camera
                this.camera.position.add(this.moveVector);
            }
        }
        // Update controls only if orbit controls are enabled
        if (this.controls.enabled) {
            this.controls.update();
        }
        this.renderer.render(this.scene, this.camera);
    }
    // Update robot movement animations
    updateRobotAnimations(currentTime) {
        // With instant snapping, we don't need to update anything in the animation loop
        // But we'll keep the method for future animation needs
        // The robotAnimations map now just stores position data, but no active animations
        // since we're using instant snapping instead of smooth transitions
    }
    // Clear the grid visualization
    clearGrid() {
        // Clear all meshes from scene
        this.cellMeshes.forEach(mesh => {
            // Dispose geometry and material if they are unique instances
            if (mesh.geometry)
                mesh.geometry.dispose();
            if (mesh.material) {
                if (Array.isArray(mesh.material)) {
                    mesh.material.forEach(m => m.dispose());
                }
                else {
                    // Only dispose if it's not one of the shared materials or the highlight material
                    const isShared = Object.values(this.materials).includes(mesh.material) || mesh.material === this.highlightMaterial;
                    if (!isShared) {
                        mesh.material.dispose();
                    }
                }
            }
            this.scene.remove(mesh);
        });
        this.cellMeshes = [];
        // Clear animations
        this.robotAnimations.clear();
        // Clear grid position map
        this.gridPositionToWorldPosition.clear();
        // Remove existing grid helper if present
        const existingGridHelper = this.scene.getObjectByName("gridHelper");
        if (existingGridHelper) {
            this.scene.remove(existingGridHelper);
            if (existingGridHelper instanceof THREE.GridHelper) {
                existingGridHelper.dispose();
            }
        }
    }
    // Get world position for grid coordinates
    getWorldPositionForGridCoords(x, y, z) {
        const sizeX = this.wasmModule.get_grid_size_x();
        const sizeZ = this.wasmModule.get_grid_size_z();
        const totalCellSize = this.cellSize + this.cellSpacing;
        const posX = x * totalCellSize - ((sizeX - 1) * totalCellSize) / 2;
        const posY = y * totalCellSize; // Assuming ground is at y=0
        const posZ = z * totalCellSize - ((sizeZ - 1) * totalCellSize) / 2;
        return new THREE.Vector3(posX, posY, posZ);
    }
    // Get a key for grid position
    getGridPositionKey(x, y, z) {
        return `${x},${y},${z}`;
    }
    // Render the grid from WASM data
    renderGrid() {
        // console.log("TS: renderGrid START");
        // Process robot states from the WASM module to get their movement information
        const robotStates = this.processRobotStates();
        // console.log(`TS: Processed ${robotStates.size} robot states`);
        // Save current robot positions before clearing to animate transitions
        const previousRobotPositions = new Map();
        // Clear the robot mesh map before rebuilding it
        this.robotMeshMap.clear();
        this.cellMeshes.forEach(mesh => {
            if (mesh.userData.type === CellType.ROBOT || mesh.userData.type === CellType.SETTLED_ROBOT) {
                const key = this.getGridPositionKey(mesh.userData.x, mesh.userData.y, mesh.userData.z);
                // Store the mesh itself and its current world position
                previousRobotPositions.set(key, { mesh: mesh, position: mesh.position.clone() });
            }
        });
        this.clearGrid();
        const sizeX = this.wasmModule.get_grid_size_x();
        const sizeY = this.wasmModule.get_grid_size_y();
        const sizeZ = this.wasmModule.get_grid_size_z();
        // First pass: add all non-robot cells and store positions
        for (let x = 0; x < sizeX; x++) {
            for (let y = 0; y < sizeY; y++) {
                for (let z = 0; z < sizeZ; z++) {
                    const cellType = this.wasmModule.get_cell(x, y, z);
                    const worldPosition = this.getWorldPositionForGridCoords(x, y, z);
                    // Store world position for this grid coordinate
                    const key = this.getGridPositionKey(x, y, z);
                    this.gridPositionToWorldPosition.set(key, worldPosition.clone());
                    // Add non-robot cells to scene
                    if ((cellType === CellType.WALL || cellType === CellType.DOOR || cellType === CellType.EMPTY) &&
                        (cellType !== CellType.EMPTY || this.showEmptyCells)) {
                        this.addStaticCellToScene(x, y, z, cellType, worldPosition);
                    }
                }
            }
        }
        // Second pass: add robot cells with animation based on robot states
        const currentRobots = new Set(); // Keep track of robots added in this frame
        let robotIndex = 0; // Index for robot tracking
        for (let x = 0; x < sizeX; x++) {
            for (let y = 0; y < sizeY; y++) {
                for (let z = 0; z < sizeZ; z++) {
                    const cellType = this.wasmModule.get_cell(x, y, z);
                    if (cellType === CellType.ROBOT || cellType === CellType.SETTLED_ROBOT) {
                        const currentKey = this.getGridPositionKey(x, y, z);
                        const worldPosition = this.gridPositionToWorldPosition.get(currentKey);
                        currentRobots.add(currentKey); // Mark this position as having a robot now
                        // Create mesh at this position
                        const mesh = this.addRobotCellToScene(x, y, z, cellType, worldPosition);
                        // Track this robot with an index for state tracking
                        this.robotMeshMap.set(robotIndex, mesh);
                        // Check if we have state information for this robot
                        const robotState = robotStates.get(robotIndex);
                        if (robotState) {
                            // Handle the robot according to its state
                            switch (robotState.diffState) {
                                case RobotDiff.Moving: {
                                    // Calculate previous position based on movement direction
                                    const moveVector = DirectionVectors[robotState.direction];
                                    // Calculate the position the robot is moving from
                                    const prevX = x - moveVector.x;
                                    const prevY = y - moveVector.y;
                                    const prevZ = z - moveVector.z;
                                    if (this.isWithinBounds(prevX, prevY, prevZ)) {
                                        const prevKey = this.getGridPositionKey(prevX, prevY, prevZ);
                                        const prevPosition = this.gridPositionToWorldPosition.get(prevKey);
                                        if (prevPosition) {
                                            // Animate the robot from its previous position
                                            this.setupRobotAnimation(mesh, prevPosition, worldPosition);
                                            // Log the movement with new logging system
                                            this.logRobotEvent("MOVED", robotIndex, { x, y, z }, `from (${prevX},${prevY},${prevZ})`);
                                        }
                                        else {
                                            // Just place at current position if we couldn't find the previous position
                                            mesh.position.copy(worldPosition);
                                        }
                                    }
                                    else {
                                        // If previous position is out of bounds, just place at current position
                                        mesh.position.copy(worldPosition);
                                    }
                                    break;
                                }
                                case RobotDiff.Settled: {
                                    // Just place the robot at its current position and change its material
                                    mesh.position.copy(worldPosition);
                                    const material = mesh.material;
                                    material.color.set(0x0055ff); // Blue color for settled robot
                                    material.emissive.set(0x000066); // Blue emissive
                                    // Log settlement with new logging system
                                    this.logRobotEvent("SETTLED", robotIndex, { x, y, z });
                                    break;
                                }
                                case RobotDiff.Stopped: {
                                    // Robot stopped moving
                                    mesh.position.copy(worldPosition);
                                    this.logRobotEvent("STOPPED", robotIndex, { x, y, z });
                                    break;
                                }
                                case RobotDiff.NoChange:
                                default:
                                    // For other states, just place at current position
                                    mesh.position.copy(worldPosition);
                                    break;
                            }
                        }
                        else {
                            // If no state info for this robot, just place it directly
                            mesh.position.copy(worldPosition);
                            // Check if this robot existed before at this same position
                            const previousState = previousRobotPositions.get(currentKey);
                            if (previousState) {
                                // It was already here, reuse position
                                previousRobotPositions.delete(currentKey); // Remove from list of "moved from"
                            }
                            else {
                                // This is a new robot (spawned)
                                this.logRobotEvent("SPAWNED", robotIndex, { x, y, z });
                            }
                        }
                        robotIndex++;
                    }
                }
            }
        }
        // Any robots remaining in previousRobotPositions have disappeared (likely settled into walls)
        const trulyDisappearedRobots = new Map(previousRobotPositions);
        for (const [prevKey, prevData] of previousRobotPositions.entries()) {
            const coords = prevKey.split(',').map(Number);
            if (coords.length === 3) {
                const currentCellType = this.wasmModule.get_cell(coords[0], coords[1], coords[2]);
                // If the previous position is now a wall, it didn't disappear, it just settled/was replaced
                if (currentCellType === CellType.WALL) {
                    trulyDisappearedRobots.delete(prevKey);
                    // Use our new logging system for transformation events
                    this.logRobotEvent("TRANSFORMED_TO_WALL", robotIndex, { x: coords[0], y: coords[1], z: coords[2] }, "Robot settled and became part of the environment");
                }
            }
        }
        // Log information about any robots that truly disappeared (which should be rare/none)
        if (trulyDisappearedRobots.size > 0) {
            for (const [key, data] of trulyDisappearedRobots.entries()) {
                const coords = key.split(',').map(Number);
                this.logRobotEvent("DISAPPEARED", robotIndex, { x: coords[0], y: coords[1], z: coords[2] }, "Robot unexpectedly vanished from the simulation");
            }
        }
        // Create a grid helper at the base level
        const gridHelperSize = Math.max(sizeX, sizeZ) * (this.cellSize + this.cellSpacing);
        const gridHelperDivisions = Math.max(sizeX, sizeZ);
        const gridHelper = new THREE.GridHelper(gridHelperSize, gridHelperDivisions);
        gridHelper.position.y = -this.cellSize / 2 - this.cellSpacing; // Position slightly below cells
        gridHelper.name = "gridHelper"; // Name it for easy removal
        this.scene.add(gridHelper);
        // console.log("TS: renderGrid END");
    }
    // Add a static cell mesh to the scene (walls, empty, door)
    addStaticCellToScene(x, y, z, cellType, position) {
        // Select material based on cell type - CLONE it to allow individual changes (like transparency)
        const material = this.materials[cellType].clone();
        // Apply current wall transparency if it's a wall
        if (cellType === CellType.WALL) {
            const baseMaterial = this.materials[CellType.WALL];
            material.opacity = baseMaterial.opacity;
            material.transparent = baseMaterial.transparent;
        }
        // Create mesh
        const mesh = new THREE.Mesh(this.cellGeometry, material);
        mesh.position.copy(position);
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
        return mesh;
    }
    // Add a robot cell mesh to the scene (which will be animated)
    addRobotCellToScene(x, y, z, cellType, position) {
        // Select material based on cell type - CLONE it
        const material = this.materials[cellType].clone();
        // Apply the stored opacity setting for this cell type
        const storedOpacity = this.materialOpacities[cellType];
        if (storedOpacity !== undefined) {
            material.opacity = storedOpacity;
            material.transparent = storedOpacity < 1.0;
        }
        // Ensure settled robots have distinct appearance from walls but respect transparency
        if (cellType === CellType.SETTLED_ROBOT) {
            material.color.set(0x0055ff); // Blue color
            material.emissive.set(0x000066); // Blue emissive
        }
        // Create mesh
        const mesh = new THREE.Mesh(this.cellGeometry, material);
        // Position will be set by animation or directly in renderGrid
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
        return mesh;
    }
    // Setup a robot movement animation
    setupRobotAnimation(mesh, startPos, targetPos) {
        // Skip animation and immediately place at target position
        mesh.position.copy(targetPos);
        // Log the snap movement for debugging
        // console.log(`TS: Snapped robot from (${startPos.x.toFixed(2)}, ${startPos.y.toFixed(2)}, ${startPos.z.toFixed(2)}) to (${targetPos.x.toFixed(2)}, ${targetPos.y.toFixed(2)}, ${targetPos.z.toFixed(2)})`);
        // We don't need to track animation state anymore since it's instant
        // But we'll keep the structure in place for future changes
        const animation = {
            mesh: mesh,
            startPosition: targetPos.clone(), // Both start and end are the same now
            targetPosition: targetPos.clone(),
            startTime: performance.now(),
            duration: 0, // Zero duration for instant movement
            isAnimating: false // Not animating
        };
        // Add to animations map, using mesh ID as key (not really needed but kept for structure)
        this.robotAnimations.set(mesh.id, animation);
    }
    // Handle drag move in WASD mode (when not pointer locked)
    handleDragMove() {
        if (!this.isDragging || this.isPointerLocked)
            return;
        // Calculate the current mouse position's delta from the start position
        const deltaX = this.mouse.x - this.dragStartMouseX;
        const deltaY = this.mouse.y - this.dragStartMouseY;
        // Use smaller rotation factor for more precise control
        const rotationFactor = this.dragSensitivity * 50; // Increase sensitivity for drag rotation
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
        const currentAngle = this.cameraDirection.angleTo(new THREE.Vector3(0, 1, 0)) - Math.PI / 2;
        // Limit the angle to avoid camera flipping
        if ((currentAngle + verticalAngle > -Math.PI / 2.1) &&
            (currentAngle + verticalAngle < Math.PI / 2.1)) {
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
    // Handle drag start in WASD mode (when not pointer locked)
    handleDragStart() {
        // Set drag start
        this.dragStartMouseX = this.mouse.x;
        this.dragStartMouseY = this.mouse.y;
        // In WASD mode, we want to rotate around the camera's current look-at point
        this.camera.getWorldDirection(this.cameraDirection);
        const lookAtDistance = 10; // Distance to look-at point
        this.controls.target.copy(this.camera.position).add(this.cameraDirection.multiplyScalar(lookAtDistance));
    }
    // Process robot states from the WASM module
    processRobotStates() {
        // Clear the current robot state map
        this.robotStateMap.clear();
        // Poll all potential robot indices (up to maxRobotIndex)
        for (let i = 0; i < this.maxRobotIndex; i++) {
            const boxedState = this.wasmModule.pop_robot_state(i);
            const robotState = decodeRobotState(boxedState);
            if (robotState && robotState.diffState !== RobotDiff.Invalid) {
                // Store valid robot states
                this.robotStateMap.set(i, robotState);
                // Log the decoded robot state event
                const stateName = RobotDiff[robotState.diffState];
                const directionName = Direction[robotState.direction];
                if (stateName === "NoChange")
                    continue;
                // console.log(`WASM Robot Event: Robot ${i} - State: ${stateName}, Direction: ${directionName}`);
            }
        }
        return this.robotStateMap;
    }
}
// Implementation of memset for WebAssembly
function memset(ptr, value, size) {
    const memory = window.wasmMemory;
    if (!memory) {
        console.error("Wasm memory not found for memset");
        return ptr;
    }
    const buffer = new Uint8Array(memory.buffer);
    // Fill the memory with the value
    buffer.fill(value, ptr, ptr + size);
    return ptr; // Return the original pointer as memset does in C
}
// Implementation of memcpy for WebAssembly
function memcpy(dest, src, len) {
    const memory = window.wasmMemory;
    if (!memory) {
        console.error("Wasm memory not found for memcpy");
        return dest;
    }
    const buffer = new Uint8Array(memory.buffer);
    // Copy bytes from source to destination
    const srcArray = buffer.subarray(src, src + len);
    buffer.set(srcArray, dest);
    return dest; // Return the destination pointer as memcpy does in C
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
                memset: memset, // Provide the memset implementation
                memcpy: memcpy, // Provide the memcpy implementation
            },
        };
        // Load the WebAssembly module
        const wasm = await wasmLoad("main.wasm", imports);
        console.log("WASM module loaded:", wasm);
        // Create a demo grid
        wasm.create_demo_grid();
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
// Create a simple UI
function createUI(wasm, renderer) {
    const uiContainer = document.createElement('div');
    uiContainer.style.position = 'absolute';
    uiContainer.style.top = '10px';
    uiContainer.style.left = '10px';
    uiContainer.style.padding = '10px';
    uiContainer.style.backgroundColor = 'rgba(0, 0, 0, 0.7)'; // Slightly darker
    uiContainer.style.color = 'white';
    uiContainer.style.fontFamily = 'Arial, sans-serif';
    uiContainer.style.borderRadius = '5px';
    uiContainer.style.maxWidth = '250px';
    uiContainer.style.zIndex = '10'; // Ensure UI is above canvas
    // Title
    const title = document.createElement('h3');
    title.textContent = '3D Grid Controls';
    title.style.margin = '0 0 10px 0';
    uiContainer.appendChild(title);
    // Instructions
    const instructions = document.createElement('p');
    instructions.innerHTML = `<b>Orbit Mode:</b> Rotate/Zoom with mouse. Click to place selected block.<br>
                              <b>WASD Mode:</b> Use WASD + Space/Shift to move. Mouse controls view. Left-click to delete block, Right-click to place block. Press Esc to exit pointer lock.`;
    instructions.style.margin = '0 0 15px 0';
    instructions.style.fontSize = '13px'; // Slightly smaller
    instructions.style.lineHeight = '1.4';
    uiContainer.appendChild(instructions);
    // Cell type selection with integrated transparency
    const cellTypeContainer = document.createElement('div');
    cellTypeContainer.style.marginBottom = '15px';
    const cellTypeLabel = document.createElement('div');
    cellTypeLabel.textContent = 'Block Types & Transparency:';
    cellTypeLabel.style.marginBottom = '5px';
    cellTypeContainer.appendChild(cellTypeLabel);
    // Cell type buttons with integrated transparency sliders
    const cellTypes = [
        { type: CellType.EMPTY, name: 'Empty', color: '#555555' }, // Darker for empty representation
        { type: CellType.WALL, name: 'Wall', color: '#808080' },
        { type: CellType.ROBOT, name: 'Robot', color: '#00cc00' }, // Brighter green
        { type: CellType.SETTLED_ROBOT, name: 'Settled', color: '#0055ff' }, // Brighter blue
        { type: CellType.DOOR, name: 'Door', color: '#ff8800' }
    ];
    // Create a grid container for block types (2 columns)
    const blockTypesGrid = document.createElement('div');
    blockTypesGrid.style.display = 'grid';
    blockTypesGrid.style.gridTemplateColumns = '1fr 1fr';
    blockTypesGrid.style.gap = '8px';
    blockTypesGrid.style.marginBottom = '10px';
    // Track the currently selected block type
    let selectedCellTypeForPlacement = null;
    // Sliders container (separate section below the grid)
    const slidersContainer = document.createElement('div');
    slidersContainer.style.marginTop = '10px';
    // Create all transparency sliders with labels
    const transparencySliders = {};
    cellTypes.forEach(cellType => {
        // Create block selection button for the grid
        const blockButton = document.createElement('button');
        blockButton.textContent = cellType.name;
        blockButton.style.backgroundColor = cellType.color;
        blockButton.style.color = ['Empty', 'Wall'].includes(cellType.name) ? 'black' : 'white';
        blockButton.style.border = '1px solid #444';
        blockButton.style.borderRadius = '3px';
        blockButton.style.padding = '6px 8px';
        blockButton.style.width = '100%';
        blockButton.style.cursor = 'pointer';
        blockButton.style.fontWeight = 'bold';
        blockButton.style.fontSize = '14px';
        // Add event listener for the button to select block type
        blockButton.addEventListener('click', () => {
            // Toggle selection state
            if (blockButton.style.outline === '2px solid white') {
                blockButton.style.outline = 'none';
                selectedCellTypeForPlacement = null;
                renderer.setSelectedCellType(CellType.WALL); // Default to wall when nothing selected
                return;
            }
            // Update selected type
            selectedCellTypeForPlacement = cellType.type;
            renderer.setSelectedCellType(cellType.type);
            // Update button styles - deselect all others
            document.querySelectorAll('[data-block-button]').forEach((elem) => {
                if (elem instanceof HTMLElement) {
                    elem.style.outline = 'none';
                }
            });
            blockButton.style.outline = '2px solid white';
        });
        // Mark this as a block button for selection logic
        blockButton.setAttribute('data-block-button', 'true');
        blockButton.setAttribute('data-block-type', cellType.type.toString());
        // Add button to the grid
        blockTypesGrid.appendChild(blockButton);
        // Create transparency control for this block type
        const sliderContainer = document.createElement('div');
        sliderContainer.style.marginBottom = '6px';
        // Create header with type name and value
        const sliderHeader = document.createElement('div');
        sliderHeader.style.display = 'flex';
        sliderHeader.style.justifyContent = 'space-between';
        sliderHeader.style.alignItems = 'center';
        sliderHeader.style.marginBottom = '2px';
        const sliderLabel = document.createElement('span');
        sliderLabel.textContent = `${cellType.name} opacity:`;
        sliderLabel.style.fontSize = '12px';
        const valueDisplay = document.createElement('span');
        // Get current opacity from renderer - set Empty to 0 regardless of renderer's current setting
        let currentOpacity = renderer.getMaterialOpacity(cellType.type);
        valueDisplay.textContent = `${Math.round(currentOpacity * 100)}%`;
        valueDisplay.style.fontSize = '12px';
        valueDisplay.style.minWidth = '36px';
        valueDisplay.style.textAlign = 'right';
        sliderHeader.appendChild(sliderLabel);
        sliderHeader.appendChild(valueDisplay);
        // Create slider
        const transparencySlider = document.createElement('input');
        transparencySlider.type = 'range';
        transparencySlider.min = '0';
        transparencySlider.max = '100';
        transparencySlider.value = (currentOpacity * 100).toString(); // Set initial value
        transparencySlider.style.width = '100%';
        transparencySlider.style.marginBottom = '0';
        transparencySlider.style.cursor = 'pointer';
        // Add event listener to update opacity
        transparencySlider.addEventListener('input', () => {
            const opacity = parseInt(transparencySlider.value) / 100;
            valueDisplay.textContent = `${transparencySlider.value}%`;
            renderer.setMaterialOpacity(cellType.type, opacity);
        });
        // Store slider reference for later updates
        transparencySliders[cellType.type] = {
            slider: transparencySlider,
            value: valueDisplay
        };
        sliderContainer.appendChild(sliderHeader);
        sliderContainer.appendChild(transparencySlider);
        slidersContainer.appendChild(sliderContainer);
    });
    // Add the grid of buttons to the container
    cellTypeContainer.appendChild(blockTypesGrid);
    cellTypeContainer.appendChild(slidersContainer);
    uiContainer.appendChild(cellTypeContainer);
    // WASD movement toggle
    const wasdContainer = document.createElement('div');
    wasdContainer.style.marginBottom = '15px'; // Keep margin before algo controls
    wasdContainer.style.display = 'flex';
    wasdContainer.style.alignItems = 'center';
    wasdContainer.style.borderTop = '1px solid #555';
    wasdContainer.style.paddingTop = '10px';
    const wasdCheckbox = document.createElement('input');
    wasdCheckbox.type = 'checkbox';
    wasdCheckbox.id = 'wasd-movement';
    wasdCheckbox.style.marginRight = '8px';
    wasdCheckbox.addEventListener('change', (e) => {
        const target = e.target;
        renderer.toggleWASDControls(target.checked);
    });
    const wasdLabel = document.createElement('label');
    wasdLabel.setAttribute('for', 'wasd-movement');
    wasdLabel.textContent = 'Enable WASD Mode';
    wasdLabel.style.cursor = 'pointer';
    wasdContainer.appendChild(wasdCheckbox);
    wasdContainer.appendChild(wasdLabel);
    uiContainer.appendChild(wasdContainer);
    const buttonStyle = `
    padding: 6px 10px; 
    margin-right: 5px; 
    margin-bottom: 5px; 
    cursor: pointer; 
    border: 1px solid #444; 
    background-color: #333; 
    color: white;
    `;
    // Add Reset View button
    const resetViewButton = document.createElement('button');
    resetViewButton.textContent = 'Reset Camera';
    resetViewButton.style.cssText = buttonStyle + 'width: 100%;';
    resetViewButton.onclick = () => {
        const wasWasdEnabled = renderer.resetCameraView();
        // Update the WASD checkbox if it was enabled
        if (wasWasdEnabled) {
            wasdCheckbox.checked = false;
        }
    };
    uiContainer.appendChild(resetViewButton);
    // Add controls for algorithm execution
    const algoControlsContainer = document.createElement('div');
    algoControlsContainer.style.marginBottom = '10px'; // Reduced margin
    algoControlsContainer.style.borderTop = '1px solid #555'; // Separator
    algoControlsContainer.style.paddingTop = '10px'; // Space above buttons
    const algoTitle = document.createElement('div');
    algoTitle.textContent = 'Simulation Controls:';
    algoTitle.style.marginBottom = '8px';
    algoControlsContainer.appendChild(algoTitle);
    const startButton = document.createElement('button');
    startButton.textContent = 'Start';
    startButton.style.cssText = buttonStyle;
    startButton.onclick = () => {
        // Clear existing interval if any
        if (window.algoIntervalId) {
            clearInterval(window.algoIntervalId);
        }
        // Call WebAssembly function to start the algorithm
        const intervalId = setInterval(() => {
            wasm.simulate_step();
            renderer.renderGrid(); // Re-render after each step
        }, 200); // Slower interval for better visualization
        // Store interval ID to stop later if needed
        window.algoIntervalId = intervalId;
    };
    algoControlsContainer.appendChild(startButton);
    const stopButton = document.createElement('button');
    stopButton.textContent = 'Stop';
    stopButton.style.cssText = buttonStyle;
    stopButton.onclick = () => {
        // Stop the algorithm
        if (window.algoIntervalId) {
            clearInterval(window.algoIntervalId);
            delete window.algoIntervalId; // Clear the stored ID
        }
    };
    algoControlsContainer.appendChild(stopButton);
    const resetButton = document.createElement('button');
    resetButton.textContent = 'Reset';
    resetButton.style.cssText = buttonStyle;
    resetButton.onclick = () => {
        // Stop simulation if running
        if (window.algoIntervalId) {
            clearInterval(window.algoIntervalId);
            delete window.algoIntervalId;
        }
        // Reset the grid and algorithm state
        wasm.create_demo_grid();
        renderer.renderGrid();
    };
    algoControlsContainer.appendChild(resetButton);
    uiContainer.appendChild(algoControlsContainer);
    // Simulation speed control
    const speedControlContainer = document.createElement('div');
    speedControlContainer.style.marginBottom = '15px';
    speedControlContainer.style.borderTop = '1px solid #555'; // Separator
    speedControlContainer.style.paddingTop = '10px'; // Space above elements
    const speedLabel = document.createElement('div');
    speedLabel.textContent = 'Simulation Speed:';
    speedLabel.style.marginBottom = '8px';
    speedControlContainer.appendChild(speedLabel);
    // Create a container for the slider and its value display
    const sliderContainer = document.createElement('div');
    sliderContainer.style.display = 'flex';
    sliderContainer.style.alignItems = 'center';
    sliderContainer.style.gap = '10px';
    // Create slider for simulation speed with exponential scale
    const speedSlider = document.createElement('input');
    speedSlider.type = 'range';
    speedSlider.min = '0';
    speedSlider.max = '100';
    speedSlider.value = '50'; // Default middle value
    speedSlider.style.flex = '1';
    speedSlider.style.cursor = 'pointer';
    // Create label to display the current speed value
    const speedValueLabel = document.createElement('span');
    speedValueLabel.textContent = '1.0x'; // Default display
    speedValueLabel.style.minWidth = '40px';
    speedValueLabel.style.textAlign = 'right';
    // Calculate speed multiplier using exponential function
    // This gives much better control over the low end while still allowing high speeds
    function calculateSpeedMultiplier(sliderValue) {
        // Convert slider value (0-100) to exponential scale
        // This function will give speed values from 0.1x to ~50x
        const exponent = sliderValue / 100 * 3 - 1; // Maps 0-100 to -1 to 2
        const multiplier = Math.pow(10, exponent); // 10^exponent gives 0.1 to 100
        // Round to one decimal place for display and calculations
        return Math.round(multiplier * 10) / 10;
    }
    // Function to update the simulation speed based on slider value
    function updateSimulationSpeed() {
        const sliderValue = parseInt(speedSlider.value);
        const speedMultiplier = calculateSpeedMultiplier(sliderValue);
        // Update display
        speedValueLabel.textContent = `${speedMultiplier.toFixed(1)}x`;
        // Store the speed value for the simulation
        window.simulationSpeed = speedMultiplier;
        // If simulation is currently running, restart it with the new speed
        if (window.algoIntervalId) {
            clearInterval(window.algoIntervalId);
            // Calculate interval in ms (1000ms / speed multiplier)
            const intervalMs = Math.max(10, Math.round(1000 / speedMultiplier));
            // Restart with new interval
            const intervalId = setInterval(() => {
                wasm.simulate_step();
                renderer.renderGrid();
            }, intervalMs);
            window.algoIntervalId = intervalId;
        }
    }
    // Initialize with default speed
    updateSimulationSpeed();
    // Add event listener to update the displayed value and stored speed
    speedSlider.addEventListener('input', () => {
        updateSimulationSpeed();
    });
    sliderContainer.appendChild(speedSlider);
    sliderContainer.appendChild(speedValueLabel);
    speedControlContainer.appendChild(sliderContainer);
    uiContainer.appendChild(speedControlContainer);
    // Map selection container
    const mapSelectionContainer = document.createElement('div');
    mapSelectionContainer.style.marginBottom = '15px';
    mapSelectionContainer.style.borderTop = '1px solid #555'; // Separator
    mapSelectionContainer.style.paddingTop = '10px'; // Space above elements
    const mapSelectionTitle = document.createElement('div');
    mapSelectionTitle.textContent = 'Preloaded Maps:';
    mapSelectionTitle.style.marginBottom = '8px';
    mapSelectionContainer.appendChild(mapSelectionTitle);
    // Get map count from WASM
    const mapCount = wasm.get_map_count();
    console.log(`Found ${mapCount} maps in WASM module`);
    // Helper function to get map name from WASM
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
    // Dynamically create buttons for each map
    for (let i = 0; i < mapCount; i++) {
        const mapName = getMapName(i);
        const sizeX = wasm.get_map_size_x(i);
        const sizeY = wasm.get_map_size_y(i);
        const sizeZ = wasm.get_map_size_z(i);
        const mapButton = document.createElement('button');
        mapButton.textContent = `${mapName} (${sizeX}x${sizeY}x${sizeZ})`;
        mapButton.style.cssText = buttonStyle + 'display: block; width: 100%;';
        mapButton.onclick = () => {
            // Stop simulation if running
            if (window.algoIntervalId) {
                clearInterval(window.algoIntervalId);
                delete window.algoIntervalId;
            }
            // Load the selected map
            wasm.load_map(i);
            renderer.renderGrid();
            console.log(`Loaded map ${i}: ${mapName}`);
        };
        mapSelectionContainer.appendChild(mapButton);
    }
    uiContainer.appendChild(mapSelectionContainer);
    document.body.appendChild(uiContainer);
    // Set default selected cell type and trigger its style
    const defaultButton = document.querySelector('[data-block-button]'); // Select first button
    if (defaultButton) {
        defaultButton.click(); // This will trigger the click event handler
    }
}
//# sourceMappingURL=app.js.map