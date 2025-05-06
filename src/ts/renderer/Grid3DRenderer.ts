import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { CellType, WasmExports } from '../types.js';

export class Grid3DRenderer {
    private wasm: WasmExports;
    private container: HTMLElement;
    private crosshair: HTMLElement;
    private scene: THREE.Scene;
    private camera: THREE.PerspectiveCamera;
    private renderer: THREE.WebGLRenderer;
    private controls: OrbitControls;
    private selectedCellType: CellType = CellType.WALL;
    private materialOpacities: Map<CellType, number> = new Map();
    private animationFrameId: number | null = null;
    private keyState: { [key: string]: boolean } = {};
    private cameraDefaultPosition = new THREE.Vector3(20, 20, 20);
    private cameraDefaultTarget = new THREE.Vector3(0, 0, 0);

    private geometry: THREE.BoxGeometry | null = null;
    private material: THREE.MeshStandardMaterial | null = null;
    private mesh: THREE.InstancedMesh | null = null;
    private dummy: THREE.Object3D = new THREE.Object3D();
    private color: THREE.Color = new THREE.Color();
    // Removed lastVisibleCount, will compare mesh.count directly

    constructor(wasm: WasmExports, container: HTMLElement, crosshair: HTMLElement) {
        this.wasm = wasm;
        this.container = container;
        this.crosshair = crosshair;
        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(60, this.container.clientWidth / this.container.clientHeight, 0.1, 1000);
        this.camera.position.copy(this.cameraDefaultPosition);
        this.camera.lookAt(this.cameraDefaultTarget);
        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setClearColor(0x111111);
        this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
        this.container.appendChild(this.renderer.domElement);
        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.target.copy(this.cameraDefaultTarget);
        this.controls.update();
        window.addEventListener('resize', this.onWindowResize.bind(this));

        this.initMaterialOpacities();
        this.setupInstancedMesh(); // Setup mesh structure once
        this.renderGrid(); // Initial render
        this.animate(); // Start animation loop
    }

    private initMaterialOpacities() {
        // Default opacities - adjust as needed
        this.materialOpacities.set(CellType.EMPTY, 0.05); // Slightly visible empty cells
        this.materialOpacities.set(CellType.WALL, 0.9);  // Mostly opaque walls
        this.materialOpacities.set(CellType.ROBOT, 1);
        this.materialOpacities.set(CellType.SETTLED_ROBOT, 1);
        this.materialOpacities.set(CellType.DOOR, 1);
        this.materialOpacities.set(CellType.SLEEPING_ROBOT, 1);
    }

    // Setup geometry, material (with shader mods), and initial mesh
    private setupInstancedMesh() {
        this.geometry = new THREE.BoxGeometry(1, 1, 1);
        this.material = new THREE.MeshStandardMaterial({
            // vertexColors: false, // Using instance colors via shader
            transparent: true,    // Required for opacity < 1
            roughness: 0.7,
            metalness: 0.3,
            // side: THREE.DoubleSide, // Render back faces if needed for transparency
        });

        // Modify shader for per-instance color and opacity
        this.material.onBeforeCompile = (shader) => {
            // Add attributes and varyings
            shader.vertexShader = `
                attribute vec3 instanceColor;
                attribute float instanceOpacity;
                varying vec3 vInstanceColor;
                varying float vInstanceOpacity;
            ` + shader.vertexShader;

            // Pass attributes to fragment shader
            shader.vertexShader = shader.vertexShader.replace(
                '#include <begin_vertex>',
                `
                #include <begin_vertex>
                vInstanceColor = instanceColor;
                vInstanceOpacity = instanceOpacity;
                `
            );

            // Add varyings to fragment shader
            shader.fragmentShader = `
                varying vec3 vInstanceColor;
                varying float vInstanceOpacity;
            ` + shader.fragmentShader;

            // Apply instance color and opacity
            shader.fragmentShader = shader.fragmentShader.replace(
                '#include <color_fragment>',
                `
                #include <color_fragment>
                // Apply instance color directly
                diffuseColor.rgb = vInstanceColor;
                // Apply instance opacity to alpha
                diffuseColor.a *= vInstanceOpacity;
                `
            );

             // Discard fully transparent fragments for potential performance gain
             shader.fragmentShader = shader.fragmentShader.replace(
                '#include <alphatest_fragment>',
                `
                #include <alphatest_fragment>
                 // Use a small threshold to avoid floating point issues
                if ( diffuseColor.a < 0.01 ) discard;
                `
            );

            // Ensure the final output uses the modified alpha
            shader.fragmentShader = shader.fragmentShader.replace(
                '#include <output_fragment>',
                `
                #include <output_fragment>
                 // Standard output uses diffuseColor.a for transparency
                 gl_FragColor = vec4( outgoingLight, diffuseColor.a );
                `
            );
        };

        // Create mesh with initial count 0, will be updated in renderGrid
        this.mesh = new THREE.InstancedMesh(this.geometry, this.material, 0);
        this.mesh.name = "gridCells"; // Name for easier debugging/removal
        this.scene.add(this.mesh);
    }


    public setMaterialOpacity(type: CellType, opacity: number) {
        this.materialOpacities.set(type, opacity);
        this.renderGrid(); // Re-render when opacity changes
    }

    public getMaterialOpacity(type: CellType): number {
        return this.materialOpacities.get(type) ?? 1;
    }

    public setSelectedCellType(type: CellType) {
        this.selectedCellType = type;
        // Potentially trigger UI update or other logic here
    }

    public renderGrid() {
        // Get grid size
        const sizeX = this.wasm.get_grid_size_x();
        const sizeY = this.wasm.get_grid_size_y();
        const sizeZ = this.wasm.get_grid_size_z();
        // Compute centering offsets
        const offsetX = (sizeX - 1) / 2;
        const offsetY = 0; // Assuming base is at y=0
        const offsetZ = (sizeZ - 1) / 2;

        // Collect data for visible cells
        const cellData: { x: number, y: number, z: number, type: CellType }[] = [];
        for (let x = 0; x < sizeX; x++) {
            for (let y = 0; y < sizeY; y++) {
                for (let z = 0; z < sizeZ; z++) {
                    const cellType = this.wasm.get_cell(x, y, z);
                    const opacity = this.materialOpacities.get(cellType) ?? 1;
                    // Only instance cells that are not fully transparent (use a small threshold)
                    if (opacity > 0.01) {
                         cellData.push({ x, y, z, type: cellType });
                    }
                }
            }
        }
        const visibleCount = cellData.length;

        // Ensure mesh exists and has the correct size
        // Dispose old mesh resources ONLY if count changes drastically or becomes 0?
        // For simplicity, let's just update the count and attributes if mesh exists
        if (!this.mesh || !this.geometry || !this.material) {
            console.error("Mesh, geometry or material not initialized!");
            return;
        }

        // Check if mesh needs resizing (more instances needed than allocated)
        if (visibleCount > this.mesh.count) {
             // Recreate mesh if needed (can be expensive)
             this.scene.remove(this.mesh);
             this.mesh.dispose(); // Dispose old instance data
             this.mesh = new THREE.InstancedMesh(this.geometry, this.material, visibleCount);
             this.mesh.name = "gridCells";
             this.scene.add(this.mesh);
             // Force attribute recreation below
             this.geometry.deleteAttribute('instanceColor');
             this.geometry.deleteAttribute('instanceOpacity');
        }
        // Update the number of instances to draw
        this.mesh.count = visibleCount;


        // Prepare attribute arrays
        const matrix = new THREE.Matrix4();
        const colorArray = new Float32Array(visibleCount * 3);
        const opacityArray = new Float32Array(visibleCount);

        // Populate arrays and set instance matrices
        let i = 0;
        for (const data of cellData) {
            const { x, y, z, type } = data;

            // Set transform matrix
            this.dummy.position.set(x - offsetX, y + 0.5 - offsetY, z - offsetZ); // Center cells vertically
            this.dummy.updateMatrix();
            this.mesh.setMatrixAt(i, this.dummy.matrix);

            // Set color attribute data
            this.color.set(this.getCellColor(type));
            this.color.toArray(colorArray, i * 3);

            // Set opacity attribute data
            opacityArray[i] = this.materialOpacities.get(type) ?? 1;

            i++;
        }

        // Update geometry attributes for color
        const colorAttribute = this.geometry.getAttribute('instanceColor') as THREE.InstancedBufferAttribute | undefined;
        if (!colorAttribute || colorAttribute.count < visibleCount) {
             this.geometry.setAttribute('instanceColor', new THREE.InstancedBufferAttribute(colorArray, 3));
        } else {
             colorAttribute.copyArray(colorArray);
             colorAttribute.needsUpdate = true;
        }

        // Update geometry attributes for opacity
        const opacityAttribute = this.geometry.getAttribute('instanceOpacity') as THREE.InstancedBufferAttribute | undefined;
         if (!opacityAttribute || opacityAttribute.count < visibleCount) {
             this.geometry.setAttribute('instanceOpacity', new THREE.InstancedBufferAttribute(opacityArray, 1));
        } else {
             opacityAttribute.copyArray(opacityArray);
             opacityAttribute.needsUpdate = true;
        }

        // Mark instance matrix attribute for update
        this.mesh.instanceMatrix.needsUpdate = true;

        // --- Scene Setup (Lights, Helpers) ---
        // Remove old lights/helpers if they exist to avoid duplicates
        const objectsToRemove = this.scene.children.filter(obj =>
            obj.type === 'DirectionalLight' || obj.type === 'AmbientLight' || obj.type === 'AxesHelper' || obj.type === 'GridHelper'
        );
        objectsToRemove.forEach(obj => this.scene.remove(obj));

        // Add lights
        const light = new THREE.DirectionalLight(0xffffff, 1.2); // Slightly brighter light
        light.position.set(sizeX * 0.5, sizeY * 1.5, sizeZ * 0.5); // Position relative to grid size
        this.scene.add(light);
        const ambient = new THREE.AmbientLight(0xffffff, 0.6); // Slightly brighter ambient
        this.scene.add(ambient);

        // Add axis and grid helpers for orientation
        const helperScale = Math.max(sizeX, sizeY, sizeZ) * 1.1;
        const axesHelper = new THREE.AxesHelper(helperScale);
        axesHelper.position.set(-offsetX, -offsetY, -offsetZ); // Align with grid corner
        this.scene.add(axesHelper);

        const gridHelper = new THREE.GridHelper(Math.max(sizeX, sizeZ), Math.max(sizeX, sizeZ));
        gridHelper.position.y = 0; // Align grid helper with the base (y=0)
        this.scene.add(gridHelper);

        // Rendering is handled by the animate loop
    }

    private getCellColor(cellType: CellType): number {
        switch (cellType) {
            case CellType.EMPTY: return 0xaaaaaa; // Give empty cells a faint color
            case CellType.WALL: return 0x808080;
            case CellType.ROBOT: return 0x00cc00;
            case CellType.SETTLED_ROBOT: return 0x0055ff;
            case CellType.DOOR: return 0xff8800;
            case CellType.SLEEPING_ROBOT: return 0x002200; // Dark green for sleeping
            default: return 0xffffff; // Default fallback
        }
    }

    public resetCameraView(): boolean {
        this.camera.position.copy(this.cameraDefaultPosition);
        this.controls.target.copy(this.cameraDefaultTarget);
        this.controls.update();
        // No explicit render needed if animate loop is running
        return false; // Indicate view was reset
    }

    private onWindowResize = () => {
        this.camera.aspect = this.container.clientWidth / this.container.clientHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
        // No explicit render needed if animate loop is running
    };

    // Animation loop
    private animate = () => {
        this.animationFrameId = requestAnimationFrame(this.animate); // Store frame ID
        this.controls.update(); // Update controls (handles damping, etc.)
        this.renderer.render(this.scene, this.camera); // Render the scene
    };

    /**
     * Sets up camera position and orbit to have a good view of the grid
     * @param zoomOutFactor How much to zoom out (multiplier of grid size)
     * @param startOrbiting Whether to start automatic orbiting
     * @param orbitSpeed Speed of orbit in radians per second (e.g., 0.1 for slow orbit)
     */
    public setupCameraView(zoomOutFactor: number = 1.8, startOrbiting: boolean = true, orbitSpeed: number = 0.1): void {
        // Get grid size to calculate optimal camera position
        const sizeX = this.wasm.get_grid_size_x();
        const sizeY = this.wasm.get_grid_size_y();
        const sizeZ = this.wasm.get_grid_size_z();
        
        // Calculate the diagonal of the grid as a basis for camera distance
        const gridDiagonal = Math.sqrt(sizeX * sizeX + sizeY * sizeY + sizeZ * sizeZ);
        const cameraDistance = gridDiagonal * zoomOutFactor;
        
        // Position camera at an isometric viewpoint
        this.camera.position.set(
            cameraDistance * 0.7,  // Slightly offset X
            cameraDistance * 0.7,  // Above the grid
            cameraDistance * 0.7   // Slightly offset Z
        );
        
        // Target the center of the grid
        const offsetX = (sizeX - 1) / 2;
        const offsetY = (sizeY - 1) / 2;
        const offsetZ = (sizeZ - 1) / 2;
        this.controls.target.set(0, offsetY, 0);
        
        // Apply changes
        this.controls.update();
        
        // Set up automatic orbiting if requested
        if (startOrbiting) {
            this.startAutoOrbit(orbitSpeed);
        }
    }
    
    private orbitingEnabled = false;
    private orbitSpeed = 0.1;
    private lastOrbitTime = 0;
    
    /**
     * Start automatic orbiting around the grid
     */
    public startAutoOrbit(speed: number = 0.1): void {
        this.orbitingEnabled = true;
        this.orbitSpeed = speed;
        this.lastOrbitTime = performance.now();
        // Store the initial radius and height for consistent orbit
        const initialRadius = this.camera.position.distanceTo(new THREE.Vector3(this.controls.target.x, this.camera.position.y, this.controls.target.z));
        const fixedY = this.camera.position.y;
        this.animate = () => {
            this.animationFrameId = requestAnimationFrame(this.animate);
            if (this.orbitingEnabled) {
                const now = performance.now();
                const deltaTime = (now - this.lastOrbitTime) / 1000;
                // Only orbit horizontally, keep y fixed
                const currentAngle = Math.atan2(
                    this.camera.position.x - this.controls.target.x,
                    this.camera.position.z - this.controls.target.z
                );
                const newAngle = currentAngle + this.orbitSpeed * deltaTime;
                this.camera.position.x = this.controls.target.x + initialRadius * Math.sin(newAngle);
                this.camera.position.z = this.controls.target.z + initialRadius * Math.cos(newAngle);
                this.camera.position.y = fixedY;
                this.camera.lookAt(this.controls.target);
                this.lastOrbitTime = now;
            }
            this.controls.update();
            this.renderer.render(this.scene, this.camera);
        };
    }
    
    /**
     * Stop automatic orbiting
     */
    public stopAutoOrbit(): void {
        this.orbitingEnabled = false;
    }

    // Cleanup resources
    public dispose() {
        this.stopAutoOrbit();
        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
        }
        window.removeEventListener('resize', this.onWindowResize);
        this.controls.dispose();

        // Remove mesh from scene and dispose its resources
        if (this.mesh) {
            this.scene.remove(this.mesh);
            this.mesh.dispose(); // Disposes instance buffers
        }
        // Dispose shared geometry and material
        if (this.geometry) this.geometry.dispose();
        if (this.material) this.material.dispose();

        // Dispose renderer and remove canvas
        this.renderer.dispose();
        if (this.container.contains(this.renderer.domElement)) {
             this.container.removeChild(this.renderer.domElement);
        }
        console.log("Grid3DRenderer disposed.");
    }
}