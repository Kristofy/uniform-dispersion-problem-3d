#include "maps.h"

constexpr int MAX_SIZE = 20;
constexpr int MAX_ROBOTS = 100;
constexpr int MAX_QUEUE_SIZE = 1000;
constexpr int INT_MAX = 2147483647;

#if defined(__EMSCRIPTEN__) || defined(NO_STD_LIB)
// Custom implementations when compiling for WASM or with -nostdlib

void* memset(void* dest, int val, unsigned long len) {
    unsigned char* ptr = (unsigned char*)dest;
    while (len-- > 0) {
        *ptr++ = val;
    }
    return dest;
}

// Custom memcpy implementation
void* memcpy(void* dest, const void* src, unsigned long len) {
    unsigned char* d = (unsigned char*)dest;
    const unsigned char* s = (const unsigned char*)src;
    while (len--) {
        *d++ = *s++;
    }
    return dest;
}

// Custom abs implementation - renamed to abs to avoid potential conflicts
int abs(int n) {
    return n < 0 ? -n : n;
}

int strlen(const char* str) {
    const char* s = str;
    while (*s) {
        ++s;
    }
    return s - str;
}

// Simple array class templated over type and size
template<typename T, unsigned long N>
class array {
private:
    T _data[N];

public:
    // Default constructor
    array() {}
    
    // Constructor with initializer
    array(const T (&init)[N]) {
        for (unsigned long i = 0; i < N; ++i) {
            _data[i] = init[i];
        }
    }

    // Copy constructor
    array(const array& other) {
        for (unsigned long i = 0; i < N; ++i) {
            _data[i] = other._data[i];
        }
    }

    // Move constructor
    array(array&& other) noexcept {
        for (unsigned long i = 0; i < N; ++i) {
            _data[i] = static_cast<T&&>(other._data[i]);
        }
    }

    // Copy assignment operator
    array& operator=(const array& other) {
        if (this != &other) {
            for (unsigned long i = 0; i < N; ++i) {
                _data[i] = other._data[i];
            }
        }
        return *this;
    }

    // Move assignment operator
    array& operator=(array&& other) noexcept {
        if (this != &other) {
            for (unsigned long i = 0; i < N; ++i) {
                _data[i] = static_cast<T&&>(other._data[i]);
            }
        }
        return *this;
    }
    
    // Element access with bounds checking
    T& operator[](unsigned long index) {
        if (index >= N) {
            // Simple panic in no-stdlib environment
            for (;;) {}  // Infinite loop as error handling
        }
        return _data[index];
    }
    
    // Const element access
    const T& operator[](unsigned long index) const {
        if (index >= N) {
            // Simple panic in no-stdlib environment
            for (;;) {}  // Infinite loop as error handling
        }
        return _data[index];
    }
    
    // Get array size
    unsigned long size() const {
        return N;
    }
    
    // Get pointer to underlying data
    T* data() {
        return _data;
    }
    
    // Get const pointer to underlying data
    const T* data() const {
        return _data;
    }
    

    void fill(const T& value) {
        for (unsigned long i = 0; i < N; ++i) {
            _data[i] = value;
        }
    }


    // Use pointers as iterators
    using iterator = T*;
    using const_iterator = const T*;

    // Begin and end methods for range-based for loops
    iterator begin() { return _data; }
    const_iterator begin() const { return _data; }
    const_iterator cbegin() const { return _data; }

    iterator end() { return _data + N; }
    const_iterator end() const { return _data + N; }
    const_iterator cend() const { return _data + N; }
    
};

#else
// Include standard headers when compiling for native with libc
#include <cstring>  // For memset and memcpy
#include <cstdlib>  // For abs
#include <array>   // For std::array
#include <string>  // For strlen

using std::array;
using std::strlen;

// Define an alias for abs to ensure consistency with the custom implementation
inline int abs(int n) {
    return std::abs(n);
}

#endif


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
    Vector3Int(const Vector3Int& other) : x(other.x), y(other.y), z(other.z) {}
    
    Vector3Int operator+(const Vector3Int& other) const {
        return Vector3Int(x + other.x, y + other.y, z + other.z);
    }

    Vector3Int operator-() const {
        return Vector3Int(-x, -y, -z);
    }
    
    Vector3Int operator-(const Vector3Int& other) const {
        return Vector3Int(x - other.x, y - other.y, z - other.z);
    }
    
    int dot(const Vector3Int& other) const {
        return x * other.x + y * other.y + z * other.z;
    }
    
    bool operator==(const Vector3Int& other) const {
        return x == other.x && y == other.y && z == other.z;
    }

    bool operator!=(const Vector3Int& other) const {
        return !(*this == other);
    }
};



// External JS function for logging
extern "C" void console_log(int value);

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
static Vector3Int up;
static Vector3Int down;
static Vector3Int left;
static Vector3Int right;
static Vector3Int forward;
static Vector3Int back;
static Vector3Int zero;

// Min function since we can't use std::min
int min_int(int a, int b) {
    return a < b ? a : b;
}

// Robot class
class Robot {
public:
    Vector3Int position;
    Vector3Int target;
    Vector3Int kulso_irany;   // External direction (from C# code)
    Vector3Int primary_dir;   // Primary direction value
    Vector3Int secondary_dir; // Secondary direction value
    Vector3Int last_move;
    bool ever_moved;
    int active_for;
    array<CellState, 3*3*3> neighbors_tmp; // Neighbors state (3x3x3)
    bool active;
    int settled_for; // For rendering as wall
    
    Robot(): 
        position(zero),
        target(zero),
        kulso_irany(up),
        primary_dir(zero),
        secondary_dir(zero),
        last_move(zero),
        ever_moved(false),
        active_for(0),
        active(false),
        settled_for(0) {}

    Robot(Vector3Int pos):
        position(pos),
        target(pos),
        kulso_irany(up),
        primary_dir(zero),
        secondary_dir(zero),
        last_move(zero),
        ever_moved(false),
        active_for(0),
        active(true),   // Set to true by default - robots should be active when created
        settled_for(0) {}


    // Get the compatible directions
    array<Vector3Int, 4> getCompatibleDirs(const Vector3Int& dir) {
        array<Vector3Int, 4> directions;
        directions[0] = sucDir(dir);
        directions[1] = sucDir(directions[0]);
        directions[2] = sucDir(sucDir(sucDir(dir)));
        directions[3] = sucDir(directions[2]);
        return directions;
    }
    
        
    // Get all possible directions
    const array<Vector3Int, 6>& getAllDirections() {
        static array<Vector3Int, 6> directions;
        directions[0] = up;
        directions[1] = forward;
        directions[2] = left;
        directions[3] = down;
        directions[4] = back;
        directions[5] = right;
        return directions;
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

    int neighbors_index(const Vector3Int& rel_coords) {
        return (rel_coords.x + 1) * 9 + (rel_coords.y + 1) * 3 + (rel_coords.z + 1);
    }

    int neighbors_index(int x, int y, int z) {
        return (x + 1) * 9 + (y + 1) * 3 + (z + 1);
    }

    // Get relative cell state from neighbors
    CellState getRelative(const Vector3Int& rel_coords) {
        int index = neighbors_index(rel_coords);
        return neighbors_tmp[index];
    }

    // Set next move direction
    void setNextMoveDir(const Vector3Int& rel_coords) {
        ever_moved = true;  // Set ever_moved flag like in C# implementation
        target = position + rel_coords;
        last_move = rel_coords;
        // console_log(neighbors_index(rel_coords));

        // console_log(target.x);
        // console_log(target.y);
        // console_log(target.z);
        // console_log(last_move.x);
        // console_log(last_move.y);
        // console_log(last_move.z);
    }

    // Check if two points are reachable
    bool reachable(const Vector3Int& from, const Vector3Int& to, array<CellState, 3*3*3>& neighbors) {
        int from_index = neighbors_index(from);
        int to_index = neighbors_index(to);
        if (neighbors[from_index] == WALL || neighbors[to_index] == WALL) return false;
        
        bool reach[3][3][3] = {};
        reach[from.x+1][from.y+1][from.z+1] = true;
        
        bool change;
        do {
            change = false;
            for (int i = 0; i < 3; i++) {
                for (int j = 0; j < 3; j++) {
                    for (int k = 0; k < 3; k++) {
                        for (int i2 = 0; i2 < 3; i2++) {
                            for (int j2 = 0; j2 < 3; j2++) {
                                for (int k2 = 0; k2 < 3; k2++) {
                                    if (abs(i - i2) <= 1 && abs(j - j2) <= 1 && abs(k - k2) <= 1 &&
                                        abs(i - i2) + abs(j - j2) + abs(k - k2) == 1) {
                                        int index = i2 * 9 + j2 * 3 + k2;
                                        if (reach[i][j][k] && !reach[i2][j2][k2] && neighbors[index] != WALL) {
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
        
        return reach[to.x+1][to.y+1][to.z+1];
    }

    // Calculate dot product of two vectors
    int dot(const Vector3Int& v1, const Vector3Int& v2) {
        return v1.x * v2.x + v1.y * v2.y + v1.z * v2.z;
    }

    // Initialize primary direction
    void initPrimary() {
        primary_dir = zero; // Reset primary direction
        secondary_dir = zero; // Reset secondary direction
    
        for(const auto& dir : getAllDirections()) {
            if (dot(dir, kulso_irany) == 0 && dir != -last_move) {
                if (getRelative(dir) == FREE) {
                    primary_dir = dir;
                    secondary_dir = sucDir(primary_dir);
                    while(dot(secondary_dir, kulso_irany) != 0) {
                        secondary_dir = sucDir(secondary_dir);
                    }
                    break; // Exit after finding the first valid direction
                }
            }
        }
    }

    // The main decision function for robot movement
    void lookCompute(array<CellState, 3 * 3 * 3>& neighbors, array<CellState, 3 * 3 * 3>& neighbors2, const int tav) {
        active_for++;
        neighbors_tmp = neighbors; // Copy neighbors to temporary variable

        // console_log(3);

        // console_log(last_move.x);
        // console_log(last_move.y);
        // console_log(last_move.z);
        // console_log(kulso_irany.x);
        // console_log(kulso_irany.y);
        // console_log(kulso_irany.z);
        // console_log(97);
        // First check if we can move in the preferred direction (kulso_irany)
        if (-kulso_irany != last_move && getRelative(kulso_irany) != WALL) {
            primary_dir = zero;
            secondary_dir = zero;
            setNextMoveDir(kulso_irany);
            // console_log(4);
            return;
        }

        // console_log(5);

        // Check if robot is blocked from all sides
        neighbors_tmp = neighbors;
        bool block_all = true;
        
        for (const auto& dir : getAllDirections()) {
            if (getRelative(dir) != WALL) {
                block_all = false;
                break;
            }
        }
        
        if (block_all) {
            active = false;
            return;
        }

        if (primary_dir == zero) {
            initPrimary();
            if (primary_dir != zero) {
                setNextMoveDir(primary_dir);
                return;
            }
        }

        if (primary_dir != zero) {
            if (getRelative(primary_dir) == FREE) {
                setNextMoveDir(primary_dir);
                return;
            }
            
            if (getRelative(secondary_dir) == FREE) {
                setNextMoveDir(secondary_dir);
                return;
            }
        }

        // Trying to settle
        bool can_settle = ever_moved;

        // Make the top and bottom layers walls in neighbors2
        for (int i = 0; i <= 2; i++) {
            for (int j = 0; j <= 2; j++) {
                int idx1 = i * 9 + 0 * 3 + j;
                int idx2 = i * 9 + 2 * 3 + j;
                neighbors2[idx1] = WALL;
                neighbors2[idx2] = WALL;
            }
        }

        // Check if settling would block any paths
        for (int i = 0; i <= 2; i++) {
            for (int j = 0; j <= 2; j++) {
                for (int k = 0; k <= 2; k++) {
                    for (int i2 = 0; i2 <= 2; i2++) {
                        for (int j2 = 0; j2 <= 2; j2++) {
                            for (int k2 = 0; k2 <= 2; k2++) {
                                // Skip checks involving the center cell (where the robot is)
                                if (i == 1 && j == 1 && k == 1) continue;
                                if (i2 == 1 && j2 == 1 && k2 == 1) continue;

                                Vector3Int from(i - 1, j - 1, k - 1);
                                Vector3Int to(i2 - 1, j2 - 1, k2 - 1);
                                
                                // Check with original neighbors
                                bool can_traverse_now = reachable(from, to, neighbors);
                                int center_idx = neighbors_index(0, 0, 0);
                                neighbors[center_idx] = WALL;
                                bool can_traverse_later = reachable(from, to, neighbors);
                                neighbors[center_idx] = OCCUPIED;

                                if (can_traverse_now && !can_traverse_later) {
                                    can_settle = false;
                                }
                                
                                can_traverse_now = reachable(from, to, neighbors2);
                                center_idx = neighbors_index(0, 0, 0);
                                neighbors2[center_idx] = WALL;
                                can_traverse_later = reachable(from, to, neighbors2);
                                neighbors2[center_idx] = OCCUPIED;
                                
                                if (can_traverse_now && !can_traverse_later) {
                                    can_settle = false;
                                }
                            }
                        }
                    }
                }
            }
        }

        if (can_settle) {
            // Log a message for debugging if we're settling at a non-expected distance
            if (active_for != tav + 1) {
                // console_log(7000 + tav); // Log settling at unexpected time
            }
            active = false;
            return;
        } else {
            // If can't settle, try to find another direction
            initPrimary(); // Re-initialize to check again
            if (primary_dir != zero) {
                setNextMoveDir(primary_dir);
                return;
            }

            if (getRelative(-kulso_irany) == FREE && kulso_irany != last_move) {
                setNextMoveDir(-kulso_irany);
                return;
            }
        }

        // If we got here, we couldn't find a valid move direction
        // console_log(4000); // Log: Could not decide on a direction
        active = false; // Make robot inactive to avoid errors
    }

    // Move the robot to its target
    void move() {
        position = target;
        // console_log(99);
    }
};


// a generic method to be able to get the change between this and the next step
// We will have one diff per robot
enum class RobotState {
    IDLE = 0, // Could not move 
    ACTIVE = 1, // Looking for a move
    SETTLED = 2, // Settled
};

RobotState prev_robot_states[MAX_ROBOTS], curr_robot_states[MAX_ROBOTS];


void initialize_robot_states() {
    for (int i = 0; i < MAX_ROBOTS; ++i) {
        prev_robot_states[i] = RobotState::IDLE;
        curr_robot_states[i] = RobotState::IDLE;
    }
}

// Global variables for the algorithm
int width = 3;
int height = 4;
int depth = 4;
bool map[MAX_SIZE][MAX_SIZE][MAX_SIZE];
int distances[MAX_SIZE][MAX_SIZE][MAX_SIZE];
Robot* robot_field[MAX_SIZE][MAX_SIZE][MAX_SIZE];
Robot robots[MAX_ROBOTS];
int robot_count = 0;
Vector3Int start_pos(0, 0, 0);


// Set start position
extern "C" void set_start_position(int x, int y, int z) {
    start_pos = Vector3Int(x, y, z);
}


// Get cell state based on coordinates and robot field
extern "C" CellState getCellState(int x, int y, int z) {
    if (x < 0 || y < 0 || z < 0 || x >= height || y >= width || z >= depth) {
        return WALL;
    }
    // If map[x][y][z] is false, it's a wall (not walkable)
    if (!map[x][y][z] || (robot_field[x][y][z] != nullptr && !robot_field[x][y][z]->active)) {
        return WALL;
    }

    // If an active robot is here, it's occupied
    if (robot_field[x][y][z] != nullptr) {
        return OCCUPIED;
    }
    // Otherwise, it's free and walkable
    return FREE;
}

// Generate neighbor states for a given position
extern "C" void generateNeighbors(int x, int y, int z, array<CellState, 3*3*3> &neighbors) {

    int idx = 0;
    for (int i = x - 1; i <= x + 1; i++) {
        for (int j = y - 1; j <= y + 1; j++) {
            for (int k = z - 1; k <= z + 1; k++) {
                neighbors[idx++] = getCellState(i, j, k);
            }
        }
    }
}

// Generate the robot field based on current positions
extern "C" void generateRobotField() {
    // Clear the robot field first
    memset(robot_field, 0, sizeof(robot_field));
    
    for (int i = 0; i < robot_count; i++) {
        Robot& robot = robots[i];
        int x = robot.position.x;
        int y = robot.position.y;
        int z = robot.position.z;
        
        if (robot_field[x][y][z] == nullptr) {
            if (map[x][y][z]) {
                robot_field[x][y][z] = &robot;
            } else {
                // console_log(5000 + i); // Log: Robot position is not walkable
                // console_log(666);
            }
        } else {
            // Log the collision: robot tried to occupy a position already occupied by robot_field[x][y][z]
            // console_log(10000 + i * 100 + (robot_field[x][y][z] - robots)); // Log: Robots collided
            // console_log(666);

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
    
    const Vector3Int directions[6] = {up, down, back, forward, left, right};
    while (!q.empty()) {
        Vector3Int v = q.pop();
        
        
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
    
    memset(map, 0, sizeof(map));
    memset(distances, 0, sizeof(distances));
    memset(robot_field, 0, sizeof(robot_field));
    
    robot_count = 0;

    initialize_robot_states();
    start_pos = Vector3Int(0, 0, 0);
}

// Set cell in the map
extern "C" void set_cell(int x, int y, int z, int value) {
    if (x >= 0 && x < height && y >= 0 && y < width && z >= 0 && z < depth) {
        // Determine walkability based on type
        bool is_walkable = (value == 0 || value == 2 || value == 3 || value == 4);
        map[x][y][z] = is_walkable;

        // Handle robot state based on the new cell type
        Robot* existing_robot = robot_field[x][y][z];

        if (value == 1) { // Placing a WALL
            // If there was a robot, just make it inactive (settled) instead of removing it
            if (existing_robot && existing_robot->active) {
                existing_robot->active = false;  // Make the robot inactive/settled
                existing_robot->settled_for = 6; // Set as "older" settled robot to render as wall
                // // console_log(2000 + (existing_robot - robots)); // Log: Robot became inactive (wall placed)
            }
        } else if (value == 2 || value == 3) { // Placing a ROBOT or SETTLED_ROBOT
            // Add a robot only if the cell is currently empty of robots
            if (!existing_robot && robot_count < MAX_ROBOTS) {
                robots[robot_count] = Robot(Vector3Int(x, y, z));
                robots[robot_count].active = (value == 2); // Active only if type is ROBOT
                robot_field[x][y][z] = &robots[robot_count];
                // // console_log(1000 + robot_count); // Log: Robot added by set_cell
                robot_count++;
            } else if (existing_robot) {
                 // If placing on an existing robot, update its state (e.g., make it settled)
                 existing_robot->active = (value == 2);
            }
        } else if (value == 0) { // Placing EMPTY
            // If there was a robot, don't remove it - instead we'll let it move naturally
            // This prevents robots from disappearing when empty cells are placed
        } else if (value == 4) { // Placing DOOR
            set_start_position(x, y, z);
            // Don't remove robots at the door position - they can coexist
        }
    }
}

// Add a robot at the specified position
extern "C" void add_robot(int x, int y, int z) {
    if (robot_count > MAX_ROBOTS) {
        // // console_log(3000); // Log: Robot limit reached
        return;
    }

    robots[robot_count] = Robot(Vector3Int(x, y, z));
    // // console_log(1000 + robot_count); // Log: Robot added
    robot_count++;
}

// Simulate one step of the algorithm
extern "C" void simulate_step() {
    // Log start position for debugging
    // console_log(6000 + start_pos.x * 100 + start_pos.y * 10 + start_pos.z); // Log: start_pos coordinates (6xyz)
    
    // Check if there's a robot at the start position and log it
    int robot_index = -1;
    if (robot_field[start_pos.x][start_pos.y][start_pos.z] != nullptr) {
        // Find which robot is at the start position
        for (int i = 0; i < robot_count; i++) {
            if (&robots[i] == robot_field[start_pos.x][start_pos.y][start_pos.z]) {
                robot_index = i;
                break;
            }
        }
    }
    // console_log(7000 + robot_index); // Log: Robot index at start position, or -1 if none
    
    // Log all existing robots' positions and states
    for (int i = 0; i < robot_count; i++) {
        Robot& robot = robots[i];
        // Log format: 1SIIIXXYYZZ where S=state(0=active,1=inactive), III=index, XX=x, YY=y, ZZ=z
        // We encode in a single 32-bit integer: robot state (1 bit) + robot index (3 digits) + xyz coords (6 digits)
        int state = robot.active ? 0 : 1;
        // console_log(1000000 + state * 100000 + i * 10000 + robot.position.x * 100 + robot.position.y * 10 + robot.position.z);
    }
    
    // // console_log(5001); // Log: simulate_step start
    
    // Calculate neighbors for each robot and update their state
    for (int i = 0; i < robot_count; i++) {
        Robot& robot = robots[i];


        if (robot.active) {
            // Generate primary neighbor data for the robot's current position
            array<CellState, 3*3*3> neighbours;
            generateNeighbors(robot.position.x, robot.position.y, robot.position.z, neighbours);
            
            // Generate second neighbor data (same as primary but will be modified)
            array<CellState, 3*3*3> neighbours2;
            generateNeighbors(robot.position.x, robot.position.y, robot.position.z, neighbours2);

            // Call lookCompute with the distance from start position
            robot.lookCompute(neighbours, neighbours2, distances[robot.position.x][robot.position.y][robot.position.z]);
        }
    }


    if (robot_field[start_pos.x][start_pos.y][start_pos.z] == nullptr) {
        robots[robot_count] = Robot(start_pos);
        // Make sure the robot state tracking system knows this robot is active
        // robot_field[start_pos.x][start_pos.y][start_pos.z] = &robots[robot_count];
        // console_log(1000 + robot_count); // Log: Robot added by set_cell
        robot_count++;
    }

    

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

    for (int x = 0; x < height; x++) {
        for (int y = 0; y < width; y++) {
            for (int z = 0; z < depth; z++) {
                if (!map[x][y][z]) continue;
               
                if (robot_field[x][y][z] == nullptr) {
                    // Noop
                } else {
                    if (robot_field[x][y][z]->active) {
                        // Active robot - do nothing
                    } else {
                       // Pass
                    }
                }
            
            }
        }
    }


    // // console_log(5002); // Log: simulate_step end
}

// Create a demo grid for testing
extern "C" void create_demo_grid() {

    up = Vector3Int(0, 1, 0);
    down = Vector3Int(0, -1, 0);
    left = Vector3Int(-1, 0, 0);
    right = Vector3Int(1, 0, 0);
    forward = Vector3Int(0, 0, 1);
    back = Vector3Int(0, 0, -1);
    zero = Vector3Int(0, 0, 0);


    // console_log(123);
    // console_log(down.x);
    // console_log(down.y);
    // console_log(down.z);
    // console_log(123);

    // Initialize a simple grid
    // Create a trivial 4 x 4 x 4 grid with walls and a door
    init_grid(3, 4, 4);
    for (int x = 0; x < 3; x++) {
        for (int y = 0; y < 4; y++) {
            for (int z = 0; z < 4; z++) {
                if (x == 0 || x == 2 || y == 0 || y == 3 || z == 0 || z == 3) {
                    set_cell(x, y, z, 1); // Wall
                } else {
                    set_cell(x, y, z, 0); // Empty space
                }
            }
        }
    }

    // The start position (door) is at the center of the grid
    set_cell(2, 1, 1, 4); // Door
    start_pos = Vector3Int(2, 1, 1); // Set start position
}

// Get grid dimensions
extern "C" int get_grid_size_x() { return height; }
extern "C" int get_grid_size_y() { return width; }
extern "C" int get_grid_size_z() { return depth; }

// Get cell state for rendering
extern "C" int get_cell(int x, int y, int z) {
    // 1. Check bounds
    if (x < 0 || x >= height || y < 0 || y >= width || z < 0 || z >= depth) {
        return 0; // Out of bounds is Empty
    }
    
    // 2. Check if it's the start/door position
    if (x == start_pos.x && y == start_pos.y && z == start_pos.z) {
        // Important: Door position is special - always render as DOOR (4), even if a robot is here
        // This ensures the door is always visible and robots can still spawn here
        return 4; // Always render Door at start position
    }
    
    // 3. Check for robots
    if (robot_field[x][y][z] != nullptr) {
        if (robot_field[x][y][z]->active) {
            return 2; // Active robot
        } else {
            // Settled robot
            if (robot_field[x][y][z]->settled_for <= 5) {
                return 3; // Recently settled robot (visual distinction)
            } else {
                // Only log transformation once when robot transitions from state 3 to state 1
                if (robot_field[x][y][z]->settled_for == 6) {
                    // This is the exact point of transition - log it once
                    // // console_log(4000 + (robot_field[x][y][z] - robots)); // Log: Settled robot transforms into wall
                }
                return 3; // Older settled robot visually becomes a wall
            }
        }
    }
    
    // 4. If no robot, check the map
    if (map[x][y][z]) {
        // Walkable space (but not door or robot) -> render as Empty floor/space
        return 0; 
    } else {
        // Not walkable according to map -> render as Wall
        return 1; 
    }
}




// This is a 3 bit type, the rest will be used for metadata
enum class RobotDiff {
    NoChange = 0,
    Moving = 1,
    Stopped = 2,
    Settled = 3,
    Invalid = 4
};

int box_type(Robot& robot, int robot_index, RobotDiff diff) {

    if (robot_index < 0 || robot_index >= MAX_ROBOTS) {
        return -1; // Invalid index
    }

    // we will put the direction of the movement as 3 bits

    // find the direction in getAllDirections
    auto all_directions = robot.getAllDirections();
    int direction = -1;
    for (int i = 0; i < 6; ++i) {
        if (robot.last_move == all_directions[i]) {
            direction = i;
            break;
        }
    }

    // direction = 0 <- up
    // direction = 1 <- forward
    // direction = 2 <- left
    // direction = 3 <- down
    // direction = 4 <- back
    // direction = 5 <- right
    if (direction == -1) {
        // Invalid direction
        return 6; // No direction
    }

    return static_cast<int>(diff) | (direction << 3); 
}


extern "C" int pop_robot_state(int robot_index) {
    if (robot_index < 0 || robot_index >= MAX_ROBOTS) {
        return -1; // Invalid index
    }

    auto curr_state = curr_robot_states[robot_index];
    auto prev_state = prev_robot_states[robot_index];

    RobotDiff answer = RobotDiff::Invalid;
    // define the state transitions

    // IDLE -> ACTIVE = Moving
    if (prev_state == RobotState::IDLE && curr_state == RobotState::ACTIVE) {
        answer = RobotDiff::Moving;
    }

    // ACTIVE -> IDLE = Stopped
    if (prev_state == RobotState::ACTIVE && curr_state == RobotState::IDLE) {
        answer = RobotDiff::Stopped;
    }

    // ACTIVE -> SETTLED = Settled
    if (prev_state == RobotState::ACTIVE && curr_state == RobotState::SETTLED) {
        answer = RobotDiff::Settled;
    }

    // SETTLED -> IDLE = INVALID
    if (prev_state == RobotState::SETTLED && curr_state == RobotState::IDLE) {
        answer = RobotDiff::Invalid;
    }

    // IDLE -> SETTLED = INVALID
    if (prev_state == RobotState::IDLE && curr_state == RobotState::SETTLED) {
        answer = RobotDiff::Settled;
    }

    // SETTLED -> ACTIVE = INVALID
    if (prev_state == RobotState::SETTLED && curr_state == RobotState::ACTIVE) {
        answer = RobotDiff::Invalid;
    }

    // IDLE -> IDLE = No change
    if (prev_state == RobotState::IDLE && curr_state == RobotState::IDLE) {
        answer = RobotDiff::NoChange;
    }

    // ACTIVE -> ACTIVE = No change
    if (prev_state == RobotState::ACTIVE && curr_state == RobotState::ACTIVE) {
        answer = RobotDiff::Moving;
    }

    // SETTLED -> SETTLED = No change
    if (prev_state == RobotState::SETTLED && curr_state == RobotState::SETTLED) {
        answer = RobotDiff::NoChange;
    }

    // Update the previous state to the current state
    prev_robot_states[robot_index] = curr_state;

    // update the current state

    if (robots[robot_index].active) {
        curr_robot_states[robot_index] = RobotState::ACTIVE;
    } else {
        curr_robot_states[robot_index] = RobotState::SETTLED;
    }
    

    return box_type(robots[robot_index], robot_index, answer);
}

// Load a predefined map from maps.h by index
extern "C" void load_map(int map_index) {
    // Make sure our vectors are initialized
    up = Vector3Int(0, 1, 0);
    down = Vector3Int(0, -1, 0);
    left = Vector3Int(-1, 0, 0);
    right = Vector3Int(1, 0, 0);
    forward = Vector3Int(0, 0, 1);
    back = Vector3Int(0, 0, -1);
    zero = Vector3Int(0, 0, 0);

    // Validate map index
    if (map_index < 0 || map_index >= WasmMaps::ALL_MAPS_COUNT) {
        // console_log(8000 + map_index); // Log: Invalid map index
        return;
    }

    // Get the map info
    const WasmMaps::MapInfo& map_info = WasmMaps::all_maps[map_index];
    
    // Initialize the grid with the map dimensions
    init_grid(map_info.size_x, map_info.size_y, map_info.size_z);
    
    // Set the start position
    set_start_position(map_info.start.x, map_info.start.y, map_info.start.z);
    
    // Fill the map data from the binary representation
    // The map data is stored as a flat bool array
    int idx = 0;
    for (int x = 0; x < map_info.size_x; x++) {
        for (int y = 0; y < map_info.size_y; y++) {
            for (int z = 0; z < map_info.size_z; z++) {
                // If the bit is 1, it's a wall, otherwise it's empty
                bool is_walkable = !map_info.data_ptr[idx++];
                map[x][y][z] = is_walkable;
                
                // Set the door at the start position
                if (x == map_info.start.x && y == map_info.start.y && z == map_info.start.z) {
                    set_cell(x, y, z, 4); // Door
                } else if (!is_walkable) {
                    set_cell(x, y, z, 1); // Wall
                } else {
                    set_cell(x, y, z, 0); // Empty
                }
            }
        }
    }
    
    // console_log(9000 + map_index); // Log: Map loaded successfully
}

// Function to get the number of available maps
extern "C" int get_map_count() {
    return WasmMaps::ALL_MAPS_COUNT;
}

// Function to get map name (returns string index to be retrieved by get_map_name_char)
extern "C" int get_map_name_length(int map_index) {
    if (map_index < 0 || map_index >= WasmMaps::ALL_MAPS_COUNT) {
        return -1; // Error: invalid index
    }
    return strlen(WasmMaps::all_maps[map_index].name);
}

// Function to get a specific character of a map name
extern "C" char get_map_name_char(int map_index, int char_index) {
    if (map_index < 0 || map_index >= WasmMaps::ALL_MAPS_COUNT ||
        char_index < 0 || char_index >= strlen(WasmMaps::all_maps[map_index].name)) {
        return '\0'; // Error or null terminator
    }
    return WasmMaps::all_maps[map_index].name[char_index];
}

// Function to get map dimensions
extern "C" int get_map_size_x(int map_index) {
    if (map_index < 0 || map_index >= WasmMaps::ALL_MAPS_COUNT) {
        return -1; // Error: invalid index
    }
    return WasmMaps::all_maps[map_index].size_x;
}

extern "C" int get_map_size_y(int map_index) {
    if (map_index < 0 || map_index >= WasmMaps::ALL_MAPS_COUNT) {
        return -1; // Error: invalid index
    }
    return WasmMaps::all_maps[map_index].size_y;
}

extern "C" int get_map_size_z(int map_index) {
    if (map_index < 0 || map_index >= WasmMaps::ALL_MAPS_COUNT) {
        return -1; // Error: invalid index
    }
    return WasmMaps::all_maps[map_index].size_z;
}
