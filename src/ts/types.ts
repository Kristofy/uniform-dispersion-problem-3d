// Shared types and enums for the 3D grid app
import * as THREE from 'three';

export enum CellType {
    EMPTY = 0,
    WALL = 1,
    ROBOT = 2,
    SETTLED_ROBOT = 3,
    DOOR = 4,
    SLEEPING_ROBOT = 5
}

export enum RobotDiff {
    NoChange = 0,
    Moving = 1,
    Stopped = 2,
    Settled = 3,
    Sleeping = 4,
    Invalid = 5,
}

export enum Direction {
    Up = 0,
    Forward = 1,
    Left = 2,
    Down = 3,
    Back = 4,
    Right = 5
}

export const DirectionVectors = {
    [Direction.Up]: new THREE.Vector3(0, 1, 0),
    [Direction.Forward]: new THREE.Vector3(0, 0, 1),
    [Direction.Left]: new THREE.Vector3(-1, 0, 0),
    [Direction.Down]: new THREE.Vector3(0, -1, 0),
    [Direction.Back]: new THREE.Vector3(0, 0, -1),
    [Direction.Right]: new THREE.Vector3(1, 0, 0)
};

export interface RobotState {
    diffState: RobotDiff;
    direction: Direction;
}

export interface WasmExports {
    addone: (arg: number) => number;
    simulate_step: () => void;
    init_grid: (x: number, y: number, z: number) => void;
    get_cell: (x: number, y: number, z: number) => number;
    set_cell: (x: number, y: number, z: number, value: number) => number;
    get_grid_size_x: () => number;
    get_grid_size_y: () => number;
    get_grid_size_z: () => number;
    // Simulation metrics
    get_available_cells: () => number;
    get_makespan: () => number;
    get_t_max: () => number;
    get_t_total: () => number;
    get_e_max: () => number;
    get_e_total: () => number;
    get_simulation_steps: () => number;
    get_robot_count: () => number;
    is_simulation_complete: () => boolean;
    reset_simulation: () => void;
    create_demo_grid: () => void;
    pop_robot_state: (robot_index: number) => number;
    load_map: (map_index: number) => void;
    get_map_count: () => number;
    get_map_name_length: (map_index: number) => number;
    get_map_name_char: (map_index: number, char_index: number) => number;
    get_map_size_x: (map_index: number) => number;
    get_map_size_y: (map_index: number) => number;
    get_map_size_z: (map_index: number) => number;
    set_active_probability: (p: number) => void;
}
