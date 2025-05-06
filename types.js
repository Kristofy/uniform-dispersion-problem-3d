// Shared types and enums for the 3D grid app
import * as THREE from 'three';
export var CellType;
(function (CellType) {
    CellType[CellType["EMPTY"] = 0] = "EMPTY";
    CellType[CellType["WALL"] = 1] = "WALL";
    CellType[CellType["ROBOT"] = 2] = "ROBOT";
    CellType[CellType["SETTLED_ROBOT"] = 3] = "SETTLED_ROBOT";
    CellType[CellType["DOOR"] = 4] = "DOOR";
    CellType[CellType["SLEEPING_ROBOT"] = 5] = "SLEEPING_ROBOT";
})(CellType || (CellType = {}));
export var RobotDiff;
(function (RobotDiff) {
    RobotDiff[RobotDiff["NoChange"] = 0] = "NoChange";
    RobotDiff[RobotDiff["Moving"] = 1] = "Moving";
    RobotDiff[RobotDiff["Stopped"] = 2] = "Stopped";
    RobotDiff[RobotDiff["Settled"] = 3] = "Settled";
    RobotDiff[RobotDiff["Sleeping"] = 4] = "Sleeping";
    RobotDiff[RobotDiff["Invalid"] = 5] = "Invalid";
})(RobotDiff || (RobotDiff = {}));
export var Direction;
(function (Direction) {
    Direction[Direction["Up"] = 0] = "Up";
    Direction[Direction["Forward"] = 1] = "Forward";
    Direction[Direction["Left"] = 2] = "Left";
    Direction[Direction["Down"] = 3] = "Down";
    Direction[Direction["Back"] = 4] = "Back";
    Direction[Direction["Right"] = 5] = "Right";
})(Direction || (Direction = {}));
export const DirectionVectors = {
    [Direction.Up]: new THREE.Vector3(0, 1, 0),
    [Direction.Forward]: new THREE.Vector3(0, 0, 1),
    [Direction.Left]: new THREE.Vector3(-1, 0, 0),
    [Direction.Down]: new THREE.Vector3(0, -1, 0),
    [Direction.Back]: new THREE.Vector3(0, 0, -1),
    [Direction.Right]: new THREE.Vector3(1, 0, 0)
};
//# sourceMappingURL=types.js.map