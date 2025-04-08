#include <iostream>
#include <vector>
#include <string>
#include <functional>
#include <cstring> 
#include <stdexcept> 

// Sort of a unity build
#include "main.cpp" 

// Forward declaration for the reset function
void resetTestEnvironment();

extern "C" void console_log(int value) {
    // std::cout << "Log: " << value << std::endl;
}

// Simple testing framework for C++ WebAssembly code
class TestFramework {
private:
    struct TestCase {
        std::string name;
        std::function<bool()> test;
    };

    std::vector<TestCase> tests;
    int passed = 0;
    int failed = 0;

public:
    void addTest(const std::string& name, std::function<bool()> test) {
        tests.push_back({name, test});
    }

    void runTests() {
        std::cout << "Running " << tests.size() << " tests...\n";
        
        for (const auto& test : tests) {
            std::cout << "Test: " << test.name << " ... ";
            
            bool result = false;
            try {
                // Reset environment before each test
                resetTestEnvironment(); 
                result = test.test();
                if (result) {
                    std::cout << "PASSED\n";
                    passed++;
                } else {
                    std::cout << "FAILED\n";
                    failed++;
                }
            } catch (const std::exception& e) {
                std::cout << "EXCEPTION: " << e.what() << "\n";
                failed++;
            } catch (...) {
                std::cout << "UNKNOWN EXCEPTION\n";
                failed++;
            }
        }

        std::cout << "\nTest Results: " << passed << " passed, " << failed << " failed\n";
        std::cout << "Total: " << tests.size() << " tests\n";
    }

    bool allPassed() const {
        return failed == 0;
    }
}; 

// Helper function to clear global state between tests
void resetTestEnvironment() {
    // Use small dimensions for focused tests
    height = 3;
    width = 3;
    depth = 3;
    
    // Reset map to all walls initially
    for (int x = 0; x < MAX_SIZE; x++) {
        for (int y = 0; y < MAX_SIZE; y++) {
            for (int z = 0; z < MAX_SIZE; z++) {
                map[x][y][z] = false; // All are walls initially
            }
        }
    }
    
    memset(distances, 0, sizeof(distances));
    memset(robot_field, 0, sizeof(robot_field));
    robot_count = 0;
    start_pos = Vector3Int(0, 0, 0);

    // Clear robots array
    for (int i = 0; i < MAX_ROBOTS; i++) {
        robots[i] = Robot(); // Reinitialize robots
    }
    
    // Make a small walkable area for basic tests (1x1x1 center surrounded by walls)
    map[1][1][1] = true; // Make center cell walkable
}

// Helper functions and test utilities
bool assertEquals(int expected, int actual, const std::string& message = "") {
    if (expected == actual) {
        return true;
    }
    std::cout << "\n  Assertion Failed: Expected: " << expected << ", Actual: " << actual;
    if (!message.empty()) {
        std::cout << " - " << message;
    }
    std::cout << std::endl;
    return false;
}

bool assertTrue(bool condition, const std::string& message = "") {
    if (condition) {
        return true;
    }
    std::cout << "\n  Assertion Failed: Expected: true, Actual: false";
    if (!message.empty()) {
        std::cout << " - " << message;
    }
    std::cout << std::endl;
    return false;
}

bool assertFalse(bool condition, const std::string& message = "") {
    if (!condition) {
        return true;
    }
    std::cout << "\n  Assertion Failed: Expected: false, Actual: true";
    if (!message.empty()) {
        std::cout << " - " << message;
    }
    std::cout << std::endl;
    return false;
}

bool assertVector3Equals(const Vector3Int& expected, const Vector3Int& actual, const std::string& message = "") {
    if (expected == actual) {
        return true;
    }
    std::cout << "\n  Assertion Failed: Expected: (" << expected.x << ", " << expected.y << ", " << expected.z << ")";
    std::cout << ", Actual: (" << actual.x << ", " << actual.y << ", " << actual.z << ")";
    if (!message.empty()) {
        std::cout << " - " << message;
    }
    std::cout << std::endl;
    return false;
}

// Test robot movement basics
bool testRobotMovement() {
    // Create a trivial 3x3x3 map with just the center cell walkable
    for (int x = 0; x < 3; x++) {
        for (int y = 0; y < 3; y++) {
            for (int z = 0; z < 3; z++) {
                map[x][y][z] = false; // All walls initially
            }
        }
    }
    map[1][1][1] = true; // Center cell is walkable
    
    Robot robot(Vector3Int(1, 1, 1));
    if (!assertVector3Equals(Vector3Int(1, 1, 1), robot.position, "Initial position check")) return false;
    robot.setNextMoveDir(up);
    if (!assertVector3Equals(Vector3Int(1, 2, 1), robot.target, "Target position after setNextMoveDir")) return false;
    if (!assertTrue(robot.ever_moved, "ever_moved flag should be set after setNextMoveDir")) return false;
    robot.move();
    if (!assertVector3Equals(Vector3Int(1, 2, 1), robot.position, "Position after move")) return false;
    return true;
}

// Test generateRobotField correctly handles multiple robots at the same location
bool testGenerateRobotField_MultipleRobotsSameLocation() {
    // Create single walkable cell for this test
    for (int x = 0; x < 3; x++) {
        for (int y = 0; y < 3; y++) {
            for (int z = 0; z < 3; z++) {
                map[x][y][z] = false; // All walls initially
            }
        }
    }
    map[1][1][1] = true; // Only center cell is walkable
    
    // Add multiple robots at the same location (1,1,1)
    robots[0] = Robot(Vector3Int(1, 1, 1)); robots[0].active = false; // Inactive
    robots[1] = Robot(Vector3Int(1, 1, 1)); robots[1].active = true;  // Active
    robots[2] = Robot(Vector3Int(1, 1, 1)); robots[2].active = false; // Inactive
    robot_count = 3;

    generateRobotField(); // Should place only one robot in the field

    if (!assertTrue(robot_field[1][1][1] != nullptr, "robot_field[1][1][1] should not be null")) return false;
    // It should pick the first one it encounters in the loop
    if (!assertTrue(robot_field[1][1][1] == &robots[0], "robot_field should point to the first robot added at that location")) return false;
    
    return true;
}

// Test that simulate_step does not result in multiple *active* robots occupying the same *non-door* cell
bool testSimulateStep_NoActiveRobotCollision() {
    // Create a simple 3x3x3 map with specific walkable cells
    for (int x = 0; x < 3; x++) {
        for (int y = 0; y < 3; y++) {
            for (int z = 0; z < 3; z++) {
                map[x][y][z] = false; // All walls initially
            }
        }
    }
    
    start_pos = Vector3Int(0, 0, 0); // Set door position
    map[0][0][0] = true; // Door position is walkable
    map[1][1][1] = true; // Target cell is walkable
    map[1][0][1] = true; // Path for robot 0
    map[0][1][1] = true; // Path for robot 1

    // Add two robots targeting the same cell (1,1,1)
    robots[0] = Robot(Vector3Int(1, 0, 1)); // Start below target
    robots[0].active = true;
    robots[0].kulso_irany = up; // Move up
    robots[0].target = Vector3Int(1, 1, 1); // Explicitly set target

    robots[1] = Robot(Vector3Int(0, 1, 1)); // Start left of target
    robots[1].active = true;
    robots[1].kulso_irany = right; // Move right
    robots[1].target = Vector3Int(1, 1, 1); // Explicitly set target
    
    robot_count = 2;

    std::cout << "\nInitial setup:" << std::endl;
    std::cout << "Robot 0 position: (" << robots[0].position.x << "," << robots[0].position.y << "," << robots[0].position.z << ")" << std::endl;
    std::cout << "Robot 0 target: (" << robots[0].target.x << "," << robots[0].target.y << "," << robots[0].target.z << ")" << std::endl;
    std::cout << "Robot 1 position: (" << robots[1].position.x << "," << robots[1].position.y << "," << robots[1].position.z << ")" << std::endl;
    std::cout << "Robot 1 target: (" << robots[1].target.x << "," << robots[1].target.y << "," << robots[1].target.z << ")" << std::endl;

    generateRobotField();
    bfs(); // Calculate distances

    // Simulate one step
    simulate_step(); 

    std::cout << "After simulate_step:" << std::endl;
    std::cout << "Robot 0 position: (" << robots[0].position.x << "," << robots[0].position.y << "," << robots[0].position.z << ")" << std::endl;
    std::cout << "Robot 0 target: (" << robots[0].target.x << "," << robots[0].target.y << "," << robots[0].target.z << ")" << std::endl;
    std::cout << "Robot 0 active: " << robots[0].active << std::endl;
    std::cout << "Robot 1 position: (" << robots[1].position.x << "," << robots[1].position.y << "," << robots[1].position.z << ")" << std::endl;
    std::cout << "Robot 1 target: (" << robots[1].target.x << "," << robots[1].target.y << "," << robots[1].target.z << ")" << std::endl;
    std::cout << "Robot 1 active: " << robots[1].active << std::endl;

    // After the step, check the robot_field for collisions
    int activeRobotsAt_1_1_1 = 0;
    if (robot_field[1][1][1] != nullptr && robot_field[1][1][1]->active) {
        activeRobotsAt_1_1_1++;
    }
    // We need to check the actual positions in the robots array too, as generateRobotField might hide the issue
    int activeRobotsAt_1_1_1_InArray = 0;
    Vector3Int targetPos(1,1,1);
    for(int i=0; i<robot_count; ++i) {
        if(robots[i].position == targetPos && robots[i].active) {
            activeRobotsAt_1_1_1_InArray++;
            std::cout << "Robot " << i << " is at target position and active" << std::endl;
        }
    }

    std::cout << "Active robots at target position: " << activeRobotsAt_1_1_1_InArray << std::endl;

    // There should not be more than one active robot at the target position (1,1,1)
    if (!assertTrue(activeRobotsAt_1_1_1_InArray <= 1, "Should not have multiple active robots at the same non-door position after simulate_step")) return false;

    return true;
}

// Test get_cell returns correct types, especially for stacked robots
bool testGetCell_StackedRobots() {
    // Create simple map with only a few walkable cells
    for (int x = 0; x < 3; x++) {
        for (int y = 0; y < 3; y++) {
            for (int z = 0; z < 3; z++) {
                map[x][y][z] = false; // All walls initially
            }
        }
    }
    
    start_pos = Vector3Int(0, 0, 0);
    map[0][0][0] = true; // Door position walkable
    map[1][1][1] = true; // Test cell walkable

    // Add robots with different states at (1,1,1)
    robots[0] = Robot(Vector3Int(1, 1, 1)); 
    robots[0].active = false; 
    robots[0].settled_for = 10; // Wall state
    
    robots[1] = Robot(Vector3Int(1, 1, 1)); 
    robots[1].active = false; 
    robots[1].settled_for = 3;  // Settled state
    
    robots[2] = Robot(Vector3Int(1, 1, 1)); 
    robots[2].active = true;  
    robots[2].settled_for = 0;  // Active state
    
    robot_count = 3;

    generateRobotField(); // Only robot 0 should be in the field

    if (!assertTrue(robot_field[1][1][1] == &robots[0], "robot_field should contain the first robot (wall state)")) return false;

    // get_cell should report based on the robot in the field
    int cellType = get_cell(1, 1, 1);
    // Since robot 0 has settled_for > 5, it should appear as a WALL (1)
    if (!assertEquals(1, cellType, "get_cell should return WALL for robot with settled_for > 5")) return false;

    // Test door position override
    robots[3] = Robot(Vector3Int(0, 0, 0));
    robots[3].active = true;
    robot_count++;
    
    generateRobotField();
    cellType = get_cell(0, 0, 0);
    if (!assertEquals(4, cellType, "get_cell should return DOOR for start_pos, regardless of robot presence")) return false;

    return true;
}

// Test for simulation behavior with robots trying to move to the same position
bool testSimulateStep_RobotCollisionAvoidance() {
    // Create a simple 3x3x3 map with specific walkable cells
    for (int x = 0; x < 3; x++) {
        for (int y = 0; y < 3; y++) {
            for (int z = 0; z < 3; z++) {
                map[x][y][z] = false; // All walls initially
            }
        }
    }
    
    start_pos = Vector3Int(0, 0, 0); // Set door position
    map[0][0][0] = true; // Door position is walkable
    map[1][1][1] = true; // Target cell is walkable
    map[0][1][1] = true; // Path for robot 0
    map[1][0][1] = true; // Path for robot 1
    
    // Add two robots that will try to move to the same position (1,1,1)
    robots[0] = Robot(Vector3Int(0, 1, 1)); // Left of target
    robots[0].active = true;
    robots[0].kulso_irany = right; // Will try to move right to (1,1,1)
    
    robots[1] = Robot(Vector3Int(1, 0, 1)); // Below target
    robots[1].active = true;
    robots[1].kulso_irany = up; // Will try to move up to (1,1,1)
    
    robot_count = 2;
    
    // Update the robot field
    generateRobotField();
    
    // Calculate distances
    bfs();
    
    // Run the simulation step
    simulate_step();
    
    // Now check if both robots managed to move to (1,1,1) or if only one did
    int robotsAt_1_1_1 = 0;
    for (int i = 0; i < robot_count; i++) {
        if (robots[i].position.x == 1 && robots[i].position.y == 1 && robots[i].position.z == 1) {
            robotsAt_1_1_1++;
        }
    }
    
    // Check that at most one robot is at the target position
    if (!assertTrue(robotsAt_1_1_1 <= 1, "At most one robot should move to position (1,1,1)")) return false;
    
    // Check the robot_field is correctly updated
    if (robotsAt_1_1_1 == 1) {
        if (!assertTrue(robot_field[1][1][1] != nullptr, "robot_field should have a robot at target position")) return false;
    } else {
        if (!assertTrue(robot_field[1][1][1] == nullptr, "robot_field should be null at target if no robot moved there")) return false;
    }

    // Analyze which robots moved where
    std::cout << "\nRobot positions after simulate_step:\n";
    for (int i = 0; i < robot_count; i++) {
        std::cout << "Robot " << i << " at (" << robots[i].position.x << "," << robots[i].position.y << "," << robots[i].position.z << ")"
                 << (robots[i].active ? " - active" : " - inactive") << std::endl;
    }
    
    return true;
}

// Test for robot priority when moving to the same cell
bool testRobotMovePriority() {
    // Create a simple 3x3x3 map with specific walkable cells
    for (int x = 0; x < 5; x++) {
        for (int y = 0; y < 5; y++) {
            for (int z = 0; z < 5; z++) {
                map[x][y][z] = false; // All walls initially
            }
        }
    }
    
    // Set start position and make some cells walkable
    start_pos = Vector3Int(0, 0, 0);
    map[0][0][0] = true; // Door position is walkable
    map[1][1][1] = true; // Robot 0 start position
    map[2][2][2] = true; // Target position
    map[3][3][3] = true; // Robot 1 start position
    
    // We want to test a scenario where multiple robots try to move to the same position
    // This tests if there's priority given to robots added first
    robots[0] = Robot(Vector3Int(1, 1, 1));
    robots[0].active = true;
    robots[0].target = Vector3Int(2, 2, 2); // Moving to target
    
    robots[1] = Robot(Vector3Int(3, 3, 3));
    robots[1].active = true;
    robots[1].target = Vector3Int(2, 2, 2); // Moving to same target
    
    robot_count = 2;

    // Update robot field before move
    generateRobotField();
    
    // Move robots - this should cause a "race condition" where both try to move to (2,2,2)
    for (int i = 0; i < robot_count; i++) {
        if (robots[i].active) {
            robots[i].move();
        }
    }

    // Update robot field after move
    generateRobotField();
    
    // Check if exactly one robot is in the robot_field at the target position
    if (!assertTrue(robot_field[2][2][2] != nullptr, "One robot should be at the target position")) return false;
    
    // The first robot should win the race and be placed in the field
    if (!assertTrue(robot_field[2][2][2] == &robots[0], "First robot added should take precedence")) return false;
    
    // Log the positions
    std::cout << "\nRobot positions after movement conflict:\n";
    for (int i = 0; i < robot_count; i++) {
        std::cout << "Robot " << i << " at (" << robots[i].position.x << "," << robots[i].position.y << "," << robots[i].position.z << ")"
                 << " - in field: " << (robot_field[robots[i].position.x][robots[i].position.y][robots[i].position.z] == &robots[i])
                 << std::endl;
    }
    
    return true;
}

// Main function to run the tests
int main() {
    TestFramework framework;

    // Add a trivial test case
    framework.addTest("Trivial Test - 1 equals 1", []() {
        return assertEquals(1, 1, "Basic equality check");
    });
    
    // Add robot movement test
    framework.addTest("Robot Movement", testRobotMovement);
    
    // Test generateRobotField's handling of stacked robots
    framework.addTest("generateRobotField Stacking", testGenerateRobotField_MultipleRobotsSameLocation);

    // Test simulate_step doesn't cause active collisions
    framework.addTest("SimulateStep No Active Collision", testSimulateStep_NoActiveRobotCollision);

    // Test get_cell's behavior with stacked robots
    framework.addTest("GetCell Stacked Robots", testGetCell_StackedRobots);
    
    // Add the new collision avoidance test
    framework.addTest("SimulateStep Robot Collision Avoidance", testSimulateStep_RobotCollisionAvoidance);
    
    // Add the robot move priority test
    framework.addTest("Robot Move Priority", testRobotMovePriority);

    // Run all the tests
    framework.runTests();

    // Return non-zero if any tests failed (for CI integration)
    return framework.allPassed() ? 0 : 1;
}