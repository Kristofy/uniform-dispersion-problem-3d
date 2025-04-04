// Freestanding WebAssembly implementation with no standard library dependencies
// Constants for fixed array sizes
#define MAX_SIZE 20
#define MAX_ROBOTS 100
#define MAX_QUEUE_SIZE 1000
#define INT_MAX 2147483647

// Cell states matching the Unity version
enum CellState {
    WALL,
    OCCUPIED,
    FREE
};

// 3D Vector implementation
struct Vector3Int {
    int x, y, z;
    
    Vector3Int() : x(0), y(0), z(0) {}
    Vector3Int(int x, int y, int z) : x(x), y(y), z(z) {}
    
    Vector3Int operator+(const Vector3Int& other) const {
        return Vector3Int(x + other.x, y + other.y, z + other.z);
    }
    
    int operator*(const Vector3Int& other) const {
        return x * other.x + y * other.y + z * other.z;
    }
    
    bool operator==(const Vector3Int& other) const {
        return x == other.x && y == other.y && z == other.z;
    }
};

// Custom memory functions internally defined (no external imports)
// Custom memset implementation
void* my_memset(void* dest, int val, unsigned long len) {
    unsigned char* ptr = (unsigned char*)dest;
    while (len-- > 0) {
        *ptr++ = val;
    }
    return dest;
}

// Custom memcpy implementation
void* my_memcpy(void* dest, const void* src, unsigned long len) {
    unsigned char* d = (unsigned char*)dest;
    const unsigned char* s = (const unsigned char*)src;
    while (len--) {
        *d++ = *s++;
    }
    return dest;
}

// Custom abs implementation
int my_abs(int n) {
    return n < 0 ? -n : n;
}

// Simple Queue implementation for BFS
struct Queue {
    Vector3Int items[MAX_QUEUE_SIZE];
    int front;
    int rear;
    int size;
    
    Queue() : front(0), rear(-1), size(0) {}
    
    bool empty() {
        return size == 0;
    }
    
    void push(Vector3Int item) {
        if (size < MAX_QUEUE_SIZE) {
            rear = (rear + 1) % MAX_QUEUE_SIZE;
            items[rear] = item;
            size++;
        }
    }
    
    Vector3Int pop() {
        Vector3Int item = items[front];
        front = (front + 1) % MAX_QUEUE_SIZE;
        size--;
        return item;
    }
};

// Static Vector3Int constants
const Vector3Int up(0, 1, 0);
const Vector3Int down(0, -1, 0);
const Vector3Int left(-1, 0, 0);
const Vector3Int right(1, 0, 0);
const Vector3Int forward(0, 0, 1);
const Vector3Int back(0, 0, -1);

// Secondary direction pool to avoid dynamic memory allocation
Vector3Int secondary_dir_pool[MAX_ROBOTS];
bool secondary_dir_used[MAX_ROBOTS];

// Helper function to get an unused secondary direction
int get_unused_secondary_dir() {
    for (int i = 0; i < MAX_ROBOTS; i++) {
        if (!secondary_dir_used[i]) {
            secondary_dir_used[i] = true;
            return i;
        }
    }
    return -1; // No free slots
}

// Helper function to release a secondary direction
void release_secondary_dir(int index) {
    if (index >= 0 && index < MAX_ROBOTS) {
        secondary_dir_used[index] = false;
    }
}

// Min function since we can't use std::min
int min_int(int a, int b) {
    return a < b ? a : b;
}

// Robot class
class Robot {
public:
    Vector3Int position;
    Vector3Int target;
    Vector3Int dir;
    int secondary_dir_index;
    Vector3Int last_move;
    bool ever_moved;
    int active_for;
    bool active;
    int settled_for;
    
    // Temporary neighbors storage
    CellState neighbors[3][3][3];
    
    Robot() : 
        position(0, 0, 0), 
        target(0, 0, 0), 
        dir(1, 0, 0),
        secondary_dir_index(-1),
        ever_moved(false),
        active_for(0),
        active(true),
        settled_for(0) {}
        
    Robot(int x, int y, int z) : 
        position(x, y, z), 
        target(x, y, z),
        dir(1, 0, 0),
        secondary_dir_index(-1),
        ever_moved(false),
        active_for(0),
        active(true),
        settled_for(0) {}
    
    // Get all possible directions
    void getAllDirections(Vector3Int directions[6]) {
        directions[0] = up;
        directions[1] = forward;
        directions[2] = left;
        directions[3] = down;
        directions[4] = back;
        directions[5] = right;
    }
    
    // Get next direction in cycle
    Vector3Int sucDir(const Vector3Int& d) {
        if (d.x == 1 && d.y == 0 && d.z == 0) return Vector3Int(0, 1, 0);
        if (d.x == 0 && d.y == 1 && d.z == 0) return Vector3Int(0, 0, 1);
        if (d.x == 0 && d.y == 0 && d.z == 1) return Vector3Int(-1, 0, 0);
        if (d.x == -1 && d.y == 0 && d.z == 0) return Vector3Int(0, -1, 0);
        if (d.x == 0 && d.y == -1 && d.z == 0) return Vector3Int(0, 0, -1);
        if (d.x == 0 && d.y == 0 && d.z == -1) return Vector3Int(1, 0, 0);
        return Vector3Int(0, 0, 0);
    }
    
    // Get relative cell state from neighbors
    CellState getRelative(const Vector3Int& rel_coords) {
        return neighbors[rel_coords.x + 1][rel_coords.y + 1][rel_coords.z + 1];
    }
    
    // Set next move direction
    void setNextMoveDir(const Vector3Int& rel_coords) {
        target = position + rel_coords;
        last_move = rel_coords;
    }
    
    // Get compatible directions
    void getCompatibleDirs(const Vector3Int& d, Vector3Int result[4]) {
        result[0] = sucDir(d);
        result[1] = sucDir(sucDir(d));
        result[2] = sucDir(sucDir(sucDir(sucDir(d))));
        result[3] = sucDir(sucDir(sucDir(sucDir(sucDir(d)))));
    }
    
    // Check if two points are reachable
    bool reachable(const Vector3Int& from, const Vector3Int& to) {
        if (neighbors[from.x][from.y][from.z] == WALL || neighbors[to.x][to.y][to.z] == WALL) return false;
        
        bool reach[3][3][3] = {{{false}}};
        reach[from.x][from.y][from.z] = true;
        
        bool change;
        do {
            change = false;
            for (int i = 0; i < 3; i++) {
                for (int j = 0; j < 3; j++) {
                    for (int k = 0; k < 3; k++) {
                        for (int i2 = 0; i2 < 3; i2++) {
                            for (int j2 = 0; j2 < 3; j2++) {
                                for (int k2 = 0; k2 < 3; k2++) {
                                    if (my_abs(i - i2) <= 1 && my_abs(j - j2) <= 1 && my_abs(k - k2) <= 1 &&
                                        my_abs(i - i2) + my_abs(j - j2) + my_abs(k - k2) == 1) {
                                        if (reach[i][j][k] && !reach[i2][j2][k2] && neighbors[i2][j2][k2] != WALL) {
                                            reach[i2][j2][k2] = true;
                                            change = true;
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        } while (change);
        
        return reach[to.x][to.y][to.z];
    }
    
    // The main decision function for robot movement
    void lookCompute(const int tav) {
        active_for++;
        
        // Check if robot is blocked from all sides
        bool block_all = true;
        Vector3Int directions[6];
        getAllDirections(directions);
        
        for (int i = 0; i < 6; i++) {
            if (getRelative(directions[i]) != WALL) {
                block_all = false;
                break;
            }
        }
        
        // If blocked, become inactive
        if (block_all) {
            active = false;
            return;
        }
        
        // First move logic
        if (!ever_moved) {
            for (int i = 0; i < 6; i++) {
                if (getRelative(dir) == FREE) {
                    setNextMoveDir(dir);
                    ever_moved = true;
                    return;
                }
                dir = sucDir(dir);
            }
        }
        
        // Count walls around to determine if we can settle
        int sarok_count_neighbs = 
            (getRelative(up) == WALL || getRelative(down) == WALL ? 1 : 0) +
            (getRelative(left) == WALL || getRelative(right) == WALL ? 1 : 0) +
            (getRelative(back) == WALL || getRelative(forward) == WALL ? 1 : 0);
            
        int wall_count = 
            (getRelative(up) == WALL ? 1 : 0) + 
            (getRelative(down) == WALL ? 1 : 0) +
            (getRelative(left) == WALL ? 1 : 0) + 
            (getRelative(right) == WALL ? 1 : 0) +
            (getRelative(back) == WALL ? 1 : 0) + 
            (getRelative(forward) == WALL ? 1 : 0);
            
        // Enhanced corner check - extra conditions for settling in corners
        bool enhanced_corner = 
            ((getRelative(up) == WALL && getRelative(left) == WALL && getRelative(forward) == WALL) ||
             (getRelative(up) == WALL && getRelative(left) == WALL && getRelative(back) == WALL) ||
             (getRelative(up) == WALL && getRelative(right) == WALL && getRelative(forward) == WALL) ||
             (getRelative(up) == WALL && getRelative(right) == WALL && getRelative(back) == WALL) ||
             (getRelative(down) == WALL && getRelative(left) == WALL && getRelative(forward) == WALL) ||
             (getRelative(down) == WALL && getRelative(left) == WALL && getRelative(back) == WALL) ||
             (getRelative(down) == WALL && getRelative(right) == WALL && getRelative(forward) == WALL) ||
             (getRelative(down) == WALL && getRelative(right) == WALL && getRelative(back) == WALL));
            
        // Check if we can settle - must have walls in all 3 axis directions and at least 4 walls total
        // OR must be in a proper geometric corner (3 walls meeting at perpendicular angles)
        if ((sarok_count_neighbs == 3 && wall_count >= 4) || enhanced_corner) {
            bool can_settle = true;
            
            // Only perform path blocking checks if not in a geometric corner
            if (!enhanced_corner) {
                // Try to settle - check if converting ourselves to a wall would block any paths
                for (int i = 0; i <= 2; i++) {
                    for (int j = 0; j <= 2; j++) {
                        for (int k = 0; k <= 2; k++) {
                            for (int i2 = 0; i2 <= 2; i2++) {
                                for (int j2 = 0; j2 <= 2; j2++) {
                                    for (int k2 = 0; k2 <= 2; k2++) {
                                        // Skip checks involving the center cell (where the robot is)
                                        if ((i == 1 && j == 1 && k == 1) || (i2 == 1 && j2 == 1 && k2 == 1)) continue;
                                        
                                        Vector3Int from(i, j, k), to(i2, j2, k2);
                                        
                                        // First check if there's currently a path between these cells
                                        bool can_traverse_now = reachable(from, to);
                                        
                                        // Store original center cell state (OCCUPIED)
                                        CellState prev = neighbors[1][1][1];
                                        
                                        // Temporarily make center cell a WALL to simulate robot settling
                                        neighbors[1][1][1] = WALL;
                                        
                                        // Check if there's still a path after settling
                                        bool can_traverse_later = reachable(from, to);
                                        
                                        // Restore the original cell state
                                        neighbors[1][1][1] = prev;
                                        
                                        // If settling would block a path that currently exists, we can't settle
                                        if (can_traverse_now && !can_traverse_later) {
                                            can_settle = false;
                                            break;
                                        }
                                    }
                                    if (!can_settle) break;
                                }
                                if (!can_settle) break;
                            }
                            if (!can_settle) break;
                        }
                        if (!can_settle) break;
                    }
                    if (!can_settle) break;
                }
            }
            
            if (can_settle) {
                // Exact match with original code: log a message for debugging if we're settling at a non-expected distance
                if (active_for != tav + 1) {
                    // In a real WebAssembly environment, you would implement logging differently
                    // or remove this if it's just for debugging
                }
                active = false;
                return;
            }
        }
        
        // Continue with normal movement logic if we can't settle
        // Try to move in current direction
        if (getRelative(dir) == FREE) {
            setNextMoveDir(dir);
            return;
        }
        
        // Try secondary direction
        if (secondary_dir_index >= 0) {
            if (getRelative(secondary_dir_pool[secondary_dir_index]) == FREE) {
                setNextMoveDir(secondary_dir_pool[secondary_dir_index]);
                return;
            } else {
                // Try compatible directions
                Vector3Int compatible_dirs[4];
                getCompatibleDirs(last_move, compatible_dirs);
                
                for (int i = 0; i < 4; i++) {
                    Vector3Int& d = compatible_dirs[i];
                    if (d * secondary_dir_pool[secondary_dir_index] == 0 && d * dir == 0 && getRelative(d) == FREE) {
                        release_secondary_dir(secondary_dir_index);
                        secondary_dir_index = -1;
                        dir = d;
                        setNextMoveDir(dir);
                        return;
                    }
                }
            }
        } else {
            // Try compatible directions with current direction
            Vector3Int compatible_dirs[4];
            getCompatibleDirs(dir, compatible_dirs);
            
            for (int i = 0; i < 4; i++) {
                if (getRelative(compatible_dirs[i]) == FREE) {
                    int new_index = get_unused_secondary_dir();
                    if (new_index >= 0) {
                        secondary_dir_pool[new_index] = compatible_dirs[i];
                        secondary_dir_index = new_index;
                        setNextMoveDir(secondary_dir_pool[secondary_dir_index]);
                        return;
                    }
                }
            }
        }
        
        // Last resort: try compatible directions with last move
        Vector3Int last_compatible_dirs[4];
        getCompatibleDirs(last_move, last_compatible_dirs);
        
        for (int i = 0; i < 4; i++) {
            if (getRelative(last_compatible_dirs[i]) == FREE) {
                if (secondary_dir_index >= 0) {
                    release_secondary_dir(secondary_dir_index);
                    secondary_dir_index = -1;
                }
                dir = last_compatible_dirs[i];
                setNextMoveDir(dir);
                return;
            }
        }
        
        // If we reached here, no valid move was found
        // This is a critical error that should never happen in valid scenarios
        // In C# this triggers an assertion: Assert.IsTrue(false)
        // For WebAssembly, we'll handle it by making the robot inactive
        active = false;
        // In a real application, you might want to add logging or other error handling here
    }
    
    // Move the robot to its target
    void move() {
        position = target;
    }
};

// Global variables for the algorithm
int width = 5;
int height = 5;
int depth = 5;
bool map[MAX_SIZE][MAX_SIZE][MAX_SIZE];
int distances[MAX_SIZE][MAX_SIZE][MAX_SIZE];
Robot* robot_field[MAX_SIZE][MAX_SIZE][MAX_SIZE];
Robot robots[MAX_ROBOTS];
int robot_count = 0;
Vector3Int start_pos(0, 0, 0);

// Get cell state based on coordinates and robot field
extern "C" CellState getCellState(int x, int y, int z) {
    if (x < 0 || y < 0 || z < 0 || x >= height || y >= width || z >= depth) {
        return WALL;
    }
    if (!map[x][y][z] || (robot_field[x][y][z] && !robot_field[x][y][z]->active)) {
        return WALL;
    }
    if (robot_field[x][y][z]) {
        return OCCUPIED;
    }
    return FREE;
}

// Generate neighbor states for a given position
extern "C" void generateNeighbors(int x, int y, int z, CellState neighbors[3][3][3]) {
    for (int i = x - 1; i <= x + 1; i++) {
        for (int j = y - 1; j <= y + 1; j++) {
            for (int k = z - 1; k <= z + 1; k++) {
                neighbors[i-x+1][j-y+1][k-z+1] = getCellState(i, j, k);
            }
        }
    }
}

// Generate the robot field based on current positions
extern "C" void generateRobotField() {
    my_memset(robot_field, 0, sizeof(robot_field));
    
    for (int i = 0; i < robot_count; i++) {
        Robot& robot = robots[i];
        int x = robot.position.x;
        int y = robot.position.y;
        int z = robot.position.z;
        
        if (robot_field[x][y][z] == nullptr) {
            if (map[x][y][z]) {
                robot_field[x][y][z] = &robot;
            }
        }
    }
}

// BFS to calculate distances from start position
extern "C" void bfs() {
    // Initialize distances
    for (int i = 0; i < height; i++) {
        for (int j = 0; j < width; j++) {
            for (int k = 0; k < depth; k++) {
                distances[i][j][k] = INT_MAX;
            }
        }
    }
    
    // Use our custom queue for BFS
    Queue q;
    distances[start_pos.x][start_pos.y][start_pos.z] = 0;
    q.push(start_pos);
    
    while (!q.empty()) {
        Vector3Int v = q.pop();
        
        const Vector3Int directions[6] = {up, down, back, forward, left, right};
        
        for (int i = 0; i < 6; i++) {
            Vector3Int next = v + directions[i];
            
            if (next.x < 0 || next.x >= height) continue;
            if (next.y < 0 || next.y >= width) continue;
            if (next.z < 0 || next.z >= depth) continue;
            if (distances[next.x][next.y][next.z] != INT_MAX) continue;
            if (!map[next.x][next.y][next.z]) continue;
            
            distances[next.x][next.y][next.z] = distances[v.x][v.y][v.z] + 1;
            q.push(next);
        }
    }
}

// Initialize the grid with dimensions
extern "C" void init_grid(int x, int y, int z) {
    height = min_int(MAX_SIZE, x);
    width = min_int(MAX_SIZE, y);
    depth = min_int(MAX_SIZE, z);
    
    my_memset(map, 0, sizeof(map));
    my_memset(distances, 0, sizeof(distances));
    my_memset(robot_field, 0, sizeof(robot_field));
    my_memset(secondary_dir_used, 0, sizeof(secondary_dir_used));
    
    robot_count = 0;
}

// Set cell in the map
extern "C" void set_cell(int x, int y, int z, bool value) {
    if (x >= 0 && x < height && y >= 0 && y < width && z >= 0 && z < depth) {
        map[x][y][z] = value;
    }
}

// Set start position
extern "C" void set_start_position(int x, int y, int z) {
    start_pos = Vector3Int(x, y, z);
}

// Add a robot at the specified position
extern "C" void add_robot(int x, int y, int z) {
    if (robot_count < MAX_ROBOTS) {
        robots[robot_count] = Robot(x, y, z);
        robot_count++;
    }
}

// Simulate one step of the algorithm
extern "C" void simulate_step() {
    // Calculate neighbors for each robot and update their state
    for (int i = 0; i < robot_count; i++) {
        Robot& robot = robots[i];
        if (robot.active) {
            CellState neighbors[3][3][3];
            generateNeighbors(robot.position.x, robot.position.y, robot.position.z, neighbors);
            my_memcpy(robot.neighbors, neighbors, sizeof(neighbors));
            robot.lookCompute(distances[robot.position.x][robot.position.y][robot.position.z]);
        }
    }
    
    // Check if we need to add a new robot at the start position
    if (robot_field[start_pos.x][start_pos.y][start_pos.z] == nullptr) {
        add_robot(start_pos.x, start_pos.y, start_pos.z);
    }
    
    // Move all active robots
    for (int i = 0; i < robot_count; i++) {
        Robot& robot = robots[i];
        if (robot.active) {
            robot.move();
        } else {
            robot.settled_for++;
        }
    }
    
    // Update robot field
    generateRobotField();
}

// Create a demo grid for testing
extern "C" void create_demo_grid() {
    // Initialize a simple grid
    init_grid(10, 10, 10);
    
    // Create a simple hollow cube
    for (int x = 2; x < 8; x++) {
        for (int y = 2; y < 8; y++) {
            for (int z = 2; z < 8; z++) {
                // Make only the shell of the cube
                if (x == 2 || x == 7 || y == 2 || y == 7 || z == 2 || z == 7) {
                    set_cell(x, y, z, true);
                }
            }
        }
    }
    
    // Set start position
    set_start_position(2, 2, 2);
    
    // Calculate distances with BFS
    bfs();
    
    // Add initial robot
    add_robot(start_pos.x, start_pos.y, start_pos.z);
    
    // Generate robot field
    generateRobotField();
}

// Get grid dimensions
extern "C" int get_grid_size_x() { return height; }
extern "C" int get_grid_size_y() { return width; }
extern "C" int get_grid_size_z() { return depth; }

// Get cell state for rendering
extern "C" int get_cell(int x, int y, int z) {
    if (x < 0 || x >= height || y < 0 || y >= width || z < 0 || z >= depth) {
        return 0; // Empty
    }
    
    if (!map[x][y][z]) {
        return 0; // Empty
    }
    
    if (robot_field[x][y][z] == nullptr) {
        if (x == start_pos.x && y == start_pos.y && z == start_pos.z) {
            return 4; // Door/Start position
        }
        return 1; // Wall
    } else {
        if (robot_field[x][y][z]->active) {
            return 2; // Active robot
        } else {
            if (robot_field[x][y][z]->settled_for <= 5) {
                return 3; // Recently settled robot
            } else {
                return 1; // Wall (settled robot becomes part of the structure)
            }
        }
    }
}

