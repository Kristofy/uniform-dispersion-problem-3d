#include <stdint.h>

// Cell types
enum CellType {
    EMPTY = 0,
    WALL = 1,
    ROBOT = 2,
    SETTLED_ROBOT = 3,
    DOOR = 4
};

// Forward declarations
extern "C" void console_log(uint32_t value);
extern uint8_t memory;
extern "C" void* memset(void* ptr, int value, int size);

// Grid dimensions and data
constexpr int MAX_GRID_SIZE = 20;
uint8_t grid[MAX_GRID_SIZE][MAX_GRID_SIZE][MAX_GRID_SIZE];
int grid_size_x = 10;
int grid_size_y = 10;
int grid_size_z = 10;

// Initialize the grid
extern "C" void init_grid(int size_x, int size_y, int size_z) {
    // Limit grid size to prevent overflow
    grid_size_x = (size_x > 0 && size_x <= MAX_GRID_SIZE) ? size_x : 10;
    grid_size_y = (size_y > 0 && size_y <= MAX_GRID_SIZE) ? size_y : 10;
    grid_size_z = (size_z > 0 && size_z <= MAX_GRID_SIZE) ? size_z : 10;
    
    // Initialize all cells as empty using the imported memset function
    memset((void*)grid, EMPTY, MAX_GRID_SIZE * MAX_GRID_SIZE * MAX_GRID_SIZE);
}

// Get a cell value
extern "C" int get_cell(int x, int y, int z) {
    if (x < 0 || x >= grid_size_x || y < 0 || y >= grid_size_y || z < 0 || z >= grid_size_z) {
        return -1; // Out of bounds
    }
    return grid[x][y][z];
}

// Set a cell value
extern "C" int set_cell(int x, int y, int z, int cell_type) {
    if (x < 0 || x >= grid_size_x || y < 0 || y >= grid_size_y || z < 0 || z >= grid_size_z) {
        return -1; // Out of bounds
    }
    if (cell_type < EMPTY || cell_type > DOOR) {
        return -1; // Invalid cell type
    }
    
    grid[x][y][z] = cell_type;
    return 1; // Success
}

// Get grid dimensions
extern "C" int get_grid_size_x() { return grid_size_x; }
extern "C" int get_grid_size_y() { return grid_size_y; }
extern "C" int get_grid_size_z() { return grid_size_z; }

// Create a sample grid setup for demonstration
extern "C" void create_demo_grid() {
    init_grid(10, 10, 10);
    
    // Create floor
    for (int x = 0; x < grid_size_x; x++) {
        for (int z = 0; z < grid_size_z; z++) {
            set_cell(x, 0, z, WALL);
        }
    }
    
    // Create some walls
    for (int y = 0; y < 5; y++) {
        set_cell(3, y, 3, WALL);
        set_cell(3, y, 4, WALL);
        set_cell(3, y, 5, WALL);
        set_cell(3, y, 6, WALL);
    }
    
    // Add a door
    set_cell(3, 1, 5, DOOR);
    
    // Place some robots
    set_cell(1, 1, 1, ROBOT);
    set_cell(5, 1, 5, ROBOT);
    set_cell(8, 1, 8, SETTLED_ROBOT);
}

