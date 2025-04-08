using System.Collections.Generic;
using System.IO;
using UnityEngine;
using System.Text.Json;
using UnityEngine.Assertions;
using System;

public enum CellState
{
    WALL,
    OCCUPIED,
    FREE
}

public class Robot
{
    public Vector3Int position;
    public Vector3Int target;
    private Vector3Int kulso_irany = Vector3Int.up;
    private Vector3Int? primary_dir = null;
    private Vector3Int? secondary_dir = null;
    bool ever_moved = false;
    private Vector3Int last_move = Vector3Int.zero;
    private int active_for = 0;

    private Vector3Int[] all_directions()
    {
        return new Vector3Int[] {
            new Vector3Int(0, 1, 0),
            new Vector3Int(0, 0, 1),
            new Vector3Int(-1, 0, 0),
            new Vector3Int(0, -1, 0),
            new Vector3Int(0, 0, -1),
            new Vector3Int(1, 0, 0)
        };
    }

    private Vector3Int sucDir(Vector3Int dir)
    {
        if (dir.x == 1 && dir.y == 0 && dir.z == 0) return new Vector3Int(0, 1, 0);
        if (dir.x == 0 && dir.y == 1 && dir.z == 0) return new Vector3Int(0, 0, 1);
        if (dir.x == 0 && dir.y == 0 && dir.z == 1) return new Vector3Int(-1, 0, 0);
        if (dir.x == -1 && dir.y == 0 && dir.z == 0) return new Vector3Int(0, -1, 0);
        if (dir.x == 0 && dir.y == -1 && dir.z == 0) return new Vector3Int(0, 0, -1);
        if (dir.x == 0 && dir.y == 0 && dir.z == -1) return new Vector3Int(1, 0, 0);
        return new Vector3Int(0, 0, 0);
    }


    public Robot(Vector3Int position)
    {
        this.position = position;
        target = position;
    }

    List<List<List<CellState>>> neighbours_tmp;

    private CellState getRelative(Vector3Int rel_coords)
    {
        return neighbours_tmp[rel_coords.x + 1][rel_coords.y + 1][rel_coords.z + 1];
    }

    private void setNextMoveDir(Vector3Int rel_coords)
    {
        ever_moved = true;
        target = position + rel_coords;
        last_move = rel_coords;
    }

    public List<Vector3Int> GetCompatibleDirs(Vector3Int dir) {
        List<Vector3Int> resi = new List<Vector3Int>
        {
            sucDir(dir),
            sucDir(sucDir(dir)),
            sucDir(sucDir(sucDir(sucDir(dir)))),
            sucDir(sucDir(sucDir(sucDir(sucDir(dir)))))
        };
        return resi;
    }

    private bool reachable(Vector3Int from, Vector3Int to, List<List<List<CellState>>> neigh)
    {
        if (neigh[from.x][from.y][from.z] == CellState.WALL || neigh[to.x][to.y][to.z] == CellState.WALL) return false;
        bool[,,] reach = new bool[neigh.Count, neigh[0].Count, neigh[0][0].Count];
        reach[from.x, from.y, from.z] = true;
        bool change = false;
        do
        {
            change = false;
            for(int i = 0; i < reach.GetLength(0); i++)
            {
                for (int j = 0; j < reach.GetLength(1); j++)
                {
                    for (int k = 0; k < reach.GetLength(2); k++)
                    {
                        for (int i2 = 0; i2 < reach.GetLength(0); i2++)
                        {
                            for (int j2 = 0; j2 < reach.GetLength(1); j2++)
                            {
                                for (int k2 = 0; k2 < reach.GetLength(2); k2++)
                                {
                                    if (Mathf.Abs(i - i2) <= 1 && Mathf.Abs(j - j2) <= 1 && Mathf.Abs(k - k2) <= 1 &&
                                        Mathf.Abs(i - i2)+ Mathf.Abs(j - j2)+ Mathf.Abs(k - k2) == 1)
                                    {
                                        if (reach[i,j,k] && !reach[i2,j2,k2] && neigh[i2][j2][k2] != CellState.WALL)
                                        {
                                            reach[i2, j2, k2] = true;
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
        return reach[to.x, to.y, to.z];
    }

    private int dot(Vector3Int v1, Vector3Int v2)
    {
        return v1.x * v2.x + v1.y * v2.y + v1.z * v2.z;
    }

    private void initPrimary()
    {
        primary_dir = null;
        secondary_dir = null;
        foreach (var dir in all_directions())
        {
            if (dot(dir, kulso_irany) == 0 && dir != -last_move)
            {
                if (getRelative(dir) == CellState.FREE)
                {
                    primary_dir = dir;
                    secondary_dir = sucDir((Vector3Int)primary_dir);
                    while (dot((Vector3Int)secondary_dir, kulso_irany) != 0)
                    {
                        secondary_dir = sucDir((Vector3Int)secondary_dir);
                    }
                }
            }
        }
    }

    public void LookCompute(List<List<List<CellState>>> neighbours, List<List<List<CellState>>> neighbours2, int tav)
    {
        neighbours_tmp = neighbours;
        active_for++;
        if (kulso_irany * -1 != last_move && getRelative(kulso_irany) != CellState.WALL)
        {
            primary_dir = null;
            secondary_dir = null;
            setNextMoveDir(kulso_irany);
            return;
        }
        neighbours_tmp = neighbours;
        bool block_all = true;
        foreach (var dir in all_directions())
        {
            if (getRelative(dir) != CellState.WALL)
            {
                block_all = false;
            }
        }
        if (block_all)
        {
            active = false;
            return;
        }
        if (primary_dir == null)
        {
            initPrimary();
            if(primary_dir != null)
            {
                setNextMoveDir((Vector3Int)primary_dir);
                return;
            }
        }
        if (primary_dir != null)
        {
            if (getRelative((Vector3Int)primary_dir) == CellState.FREE)
            {
                setNextMoveDir((Vector3Int)primary_dir);
                return;
            }
            if (getRelative((Vector3Int)secondary_dir) == CellState.FREE)
            {
                setNextMoveDir((Vector3Int)secondary_dir);
                return;
            }
        }
        bool can_settle = ever_moved;
        for (int i = 0; i <= 2; i++)
        {
            for (int j = 0; j <= 2; j++)
            {
                neighbours2[i][0][j] = CellState.WALL;
                neighbours2[i][2][j] = CellState.WALL;
            }
        }
        //Trying to settle
        for (int i = 0; i <= 2; i++)
        {
            for (int j = 0; j <= 2; j++)
            {
                for (int k = 0; k <= 2; k++)
                {
                    for (int i2 = 0; i2 <= 2; i2++)
                    {
                        for (int j2 = 0; j2 <= 2; j2++)
                        {
                            for (int k2 = 0; k2 <= 2; k2++)
                            {
                                if (i == 1 && j == 1 && k == 1) continue;
                                if (i2 == 1 && j2 == 1 && k2 == 1) continue;
                                bool can_traverse_now = reachable(new Vector3Int(i, j, k), new Vector3Int(i2, j2, k2), neighbours);
                                neighbours[1][1][1] = CellState.WALL;
                                bool can_traverse_later = reachable(new Vector3Int(i, j, k), new Vector3Int(i2, j2, k2), neighbours);
                                neighbours[1][1][1] = CellState.OCCUPIED;
                                if (can_traverse_now && !can_traverse_later)
                                {
                                    can_settle = false;
                                }
                                can_traverse_now = reachable(new Vector3Int(i, j, k), new Vector3Int(i2, j2, k2), neighbours2);
                                neighbours2[1][1][1] = CellState.WALL;
                                can_traverse_later = reachable(new Vector3Int(i, j, k), new Vector3Int(i2, j2, k2), neighbours2);
                                neighbours2[1][1][1] = CellState.OCCUPIED;
                                if (can_traverse_now && !can_traverse_later)
                                {
                                    can_settle = false;
                                }
                            }
                        }
                    }
                }
            }
        }

        if (can_settle)
        {
            if(active_for != tav+1)
                Debug.LogError($"Settling at: {position} after {active_for} ticks of being active. The cell is {tav} blocks from the start.");
            active = false;
            return;
        } else
        {
            initPrimary();
            if (primary_dir != null)
            {
                setNextMoveDir((Vector3Int)primary_dir);
                return;
            }
            if (getRelative(-kulso_irany) == CellState.FREE && kulso_irany != last_move)
            {
                setNextMoveDir(-kulso_irany);
                return;
            }
        }
            Debug.LogError($"Could not decide on a correct new direction Last move: {last_move} Compatbile dirs {string.Join(",", GetCompatibleDirs(last_move))}");
        Assert.IsTrue(false);
    }

    public void Move()
    {
        position = target;
    }

    public int settled_for = 0;

    public bool active = true;
}

public class Algo : MonoBehaviour
{
    private CellState GetCellState(int x, int y, int z)
    {
        if (x < 0 || y < 0 || z < 0 || x >= height || y >= width || z >= depth)
        {
            return CellState.WALL;
        }
        if (!map[x,y,z] || (current_robot_field[x, y, z] != null && !current_robot_field[x, y, z].active))
        {
            return CellState.WALL;
        }
        if (current_robot_field[x, y, z] != null)
        {
            return CellState.OCCUPIED;
        }
        return CellState.FREE;
    }
    private List<List<List<CellState>>> generateNeighbours(int x, int y, int z)
    {
        List<List<List<CellState>>> resi = new List<List<List<CellState>>>();
        for (int i = x - 1; i <= x + 1; i++)
        {
            List<List<CellState>> resi2 = new List<List<CellState>>();
            for (int j = y - 1; j <= y + 1; j++)
            {
                List<CellState> resi3 = new List<CellState>();
                for (int k = z - 1; k <= z + 1; k++)
                {
                    resi3.Add(GetCellState(i, j, k));
                }
                resi2.Add(resi3);
            }
            resi.Add(resi2);
        }
        return resi;
    }

    List<Robot> r;

    Robot[,,] current_robot_field;

    void GenerateRobotField()
    {
        current_robot_field = new Robot[height, width, depth];
        foreach (Robot robot in r)
        {
            if (current_robot_field[robot.position.x, robot.position.y, robot.position.z] == null)
            {
                if (map[robot.position.x, robot.position.y, robot.position.z])
                {
                    current_robot_field[robot.position.x, robot.position.y, robot.position.z] = robot;
                }
                else
                {
                    Debug.LogError("Robot went out of field");
                }
            }
            else
            {
                Debug.LogError("Robots collided");
            }
        }
    }

    public GameObject cube;
    public Material transparent;
    public Material moving;
    public Material settled;
    public Material start;
    int width = 5;
    int height = 5;
    int depth = 5;
    GameObject[,,] gameObjects;
    public string json_file_path;

    private bool[,,] map;
    private int[,,] tav;

    int counter_dfs = 0;
    public int ticks_per_update = 50;

    int time = 0;
    int ticks_since_last_update = 0;

    private Vector3Int start_pos;
    JsonElement re;

    void bfs()
    {
        tav = new int[height, width, depth];
        for (int i = 0; i < height; i++)
        {
            for (int j = 0; j < width; j++)
            {
                for (int k = 0; k < depth; k++)
                {
                    tav[i, j, k] = int.MaxValue;
                }
            }
        }
        Queue<Vector3Int> q = new Queue<Vector3Int>();
        tav[start_pos.x, start_pos.y, start_pos.z] = 0;
        q.Enqueue(start_pos);
        while(q.Count > 0)
        {
            Vector3Int v = q.Dequeue();
            foreach(Vector3Int vv in new Vector3Int[]{ Vector3Int.up, Vector3Int.down, Vector3Int.back, Vector3Int.forward, Vector3Int.left, Vector3Int.right } ){
                Vector3Int vvv = v + vv;
                if (vvv.x < 0 || vvv.x >= height) continue;
                if (vvv.y < 0 || vvv.y >= width) continue;
                if (vvv.z < 0 || vvv.z >= depth) continue;
                if (tav[vvv.x, vvv.y, vvv.z] != int.MaxValue) continue;
                if (!map[vvv.x, vvv.y, vvv.z]) continue;
                tav[vvv.x, vvv.y, vvv.z] = tav[v.x, v.y, v.z] + 1;
                q.Enqueue(vvv);
            }
        }
    }

    void DropdownValueChanged(TMPro.TMP_Dropdown dropdown)
    {
        for (int x = 0; x < height; ++x)
        {
            for (int y = 0; y < width; ++y)
            {
                for (int z = 0; z < depth; ++z)
                {
                    if (map[x, y, z])
                    {
                        Destroy(gameObjects[x, y, z]);
                    }
                }
            }
        }
        string json = "";
        switch (dropdown.value)
        {
            case 0:
                json = PreppedMaps.mapOne();
                break;
            case 1:
                using (StreamReader r = new StreamReader(json_file_path))
                {
                    json = r.ReadToEnd();
                }
                break;
            case 2:
                json = PreppedMaps.mapTwo();
                break;
        }
        loadJson(json);
    }

    void loadJson(string json)
    {
        JsonDocument jd = JsonDocument.Parse(json);
        re = jd.RootElement;
        height = re.GetProperty("map").GetArrayLength();
        width = re.GetProperty("map")[0].GetArrayLength();
        depth = re.GetProperty("map")[0][0].GetArrayLength();
        gameObjects = new GameObject[height, width, depth];
        map = new bool[height, width, depth];

        int minx = int.MaxValue;
        int maxx = int.MinValue;
        int miny = int.MaxValue;
        int maxy = int.MinValue;
        int minz = int.MaxValue;
        int maxz = int.MinValue;
        for (int x = 0; x < height; ++x)
        {
            for (int y = 0; y < width; ++y)
            {
                for (int z = 0; z < depth; ++z)
                {
                    if (re.GetProperty("map")[x][y][z].GetBoolean())
                    {
                        minx = Math.Min(minx, x);
                        maxx = Math.Max(maxx, x);
                        miny = Math.Min(miny, y);
                        maxy = Math.Max(maxy, y);
                        minz = Math.Min(minz, z);
                        maxz = Math.Max(maxz, z);
                        map[x, y, z] = true;
                        gameObjects[x, y, z] = Instantiate(cube);
                        gameObjects[x, y, z].transform.parent = transform;
                        gameObjects[x, y, z].transform.SetLocalPositionAndRotation(new Vector3(x, y, z), Quaternion.identity);
                    }
                }
            }
        }
        Vector3Int egyik = new Vector3Int(minx, miny, minz);
        Vector3Int masik = new Vector3Int(maxx, maxy, maxz);
        transform.SetLocalPositionAndRotation(-egyik - masik / 2 + egyik / 2, Quaternion.identity);
        start_pos = new Vector3Int(re.GetProperty("start").GetProperty("x").GetInt32(), re.GetProperty("start").GetProperty("y").GetInt32(), re.GetProperty("start").GetProperty("z").GetInt32());
        bfs();
        r = new List<Robot>();
        GenerateRobotField();
    }


    // Start is called once before the first execution of Update after the MonoBehaviour is created
    void Start()
    {
        
        GameObject dropdown = GameObject.Find("MapSelection");
        Debug.Log(dropdown);

        TMPro.TMP_Dropdown dropdown2 = dropdown.GetComponent<TMPro.TMP_Dropdown>();
        
        Debug.Log(dropdown2);
        dropdown2.onValueChanged.AddListener(delegate {
            DropdownValueChanged(dropdown2);
        });

        try
        {
            string json;
            using (StreamReader r = new StreamReader(json_file_path))
            {
                json = r.ReadToEnd();
            }
            loadJson(json);
        } catch(Exception)
        {
            height = 0;
            width = 0;
            depth = 0;
            r = new List<Robot>();
            gameObjects = new GameObject[height, width, depth];
            map = new bool[height, width, depth];
        }
    }

    // Update is called once per frame
    void Update()
    {

    }
    void FixedUpdate()
    {
        if (ticks_since_last_update >= GameObject.Find("Speed slider").GetComponent<UnityEngine.UI.Slider>().value)
        {
            foreach (Robot robot in r)
            {
                if(robot.active)
                    robot.LookCompute(generateNeighbours(robot.position.x, robot.position.y, robot.position.z), generateNeighbours(robot.position.x, robot.position.y, robot.position.z), tav[robot.position.x, robot.position.y, robot.position.z]);
            }

            if (current_robot_field[start_pos.x, start_pos.y, start_pos.z] == null)
            {
                r.Add(new Robot(start_pos));
            }

            foreach (Robot robot in r)
            {
                if (robot.active)
                {
                    robot.Move();
                } else
                {
                    ++robot.settled_for;
                }
            }

            GenerateRobotField();

            ticks_since_last_update = 0;
            ++time;

            for (int x = 0; x < height; ++x)
            {
                for (int y = 0; y < width; ++y)
                {
                    for (int z = 0; z < depth; ++z)
                    {
                        if (map[x, y, z])
                        {
                            if (current_robot_field[x, y, z] == null)
                            {
                                if (x == start_pos.x && y == start_pos.y && z == start_pos.z)
                                {
                                    gameObjects[x, y, z].GetComponent<MeshRenderer>().material = start;
                                }
                                else
                                {
                                    gameObjects[x, y, z].GetComponent<MeshRenderer>().material = transparent;
                                }
                            }
                            else
                            {
                                if (current_robot_field[x, y, z].active)
                                {
                                    gameObjects[x, y, z].GetComponent<MeshRenderer>().material = moving;
                                }
                                else
                                {
                                    if (current_robot_field[x, y, z].settled_for <= 5)
                                    {
                                        gameObjects[x, y, z].GetComponent<MeshRenderer>().material = settled;
                                    }
                                    else
                                    {
                                        gameObjects[x, y, z].SetActive(false);
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
        else
        {
            ++ticks_since_last_update;
        }
    }
}