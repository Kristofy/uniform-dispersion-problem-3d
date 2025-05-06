#include <iostream>
#include <vector>
#include <string>
#include <algorithm>
#include <numeric>
#include "main.cpp" // Include the WASM source code

void printHelp() {
    std::cout << "Usage: wasm_cli [options]\n";
    std::cout << "Options:\n";
    std::cout << "  -h, --help           Show this help message\n";
    std::cout << "  -p <value>           Set active probability (0-100)\n";
    std::cout << "  -m <index>           Set map index to load\n";
    std::cout << "  -n <simulations>     Set number of simulations to run\n";
}


struct SimulationMetrics {
    int makespan;
    int e_total;
    int e_max;
    int t_total;
    int t_max;
    int available_cells;
};

void logMetrics(const std::vector<SimulationMetrics>& metrics) {
    auto calculateStats = [](const std::vector<int>& values) {
        int min = *std::min_element(values.begin(), values.end());
        int max = *std::max_element(values.begin(), values.end());
        double avg = std::accumulate(values.begin(), values.end(), 0.0) / values.size();
        return std::make_tuple(min, max, avg);
    };

    std::vector<int> makespans, e_totals, e_maxs, t_totals, t_maxs, available_cells;
    for (const auto& metric : metrics) {
        makespans.push_back(metric.makespan);
        e_totals.push_back(metric.e_total);
        e_maxs.push_back(metric.e_max);
        t_totals.push_back(metric.t_total);
        t_maxs.push_back(metric.t_max);
        available_cells.push_back(metric.available_cells);
    }

    auto [minMakespan, maxMakespan, avgMakespan] = calculateStats(makespans);
    auto [minETotal, maxETotal, avgETotal] = calculateStats(e_totals);
    auto [minEMax, maxEMax, avgEMax] = calculateStats(e_maxs);
    auto [minTTotal, maxTTotal, avgTTotal] = calculateStats(t_totals);
    auto [minTMax, maxTMax, avgTMax] = calculateStats(t_maxs);
    auto [minCells, maxCells, avgCells] = calculateStats(available_cells);

    std::cout << "Simulation Metrics:\n";
    std::cout << "  Available Cells: Min=" << minCells << " Max=" << maxCells << " Avg=" << avgCells << "\n";
    std::cout << "  Makespan:        Min=" << minMakespan << " Max=" << maxMakespan << " Avg=" << avgMakespan << "\n";
    std::cout << "  E_Total:         Min=" << minETotal << " Max=" << maxETotal << " Avg=" << avgETotal << "\n";
    std::cout << "  E_Max:           Min=" << minEMax << " Max=" << maxEMax << " Avg=" << avgEMax << "\n";
    std::cout << "  T_Total:         Min=" << minTTotal << " Max=" << maxTTotal << " Avg=" << avgTTotal << "\n";
    std::cout << "  T_Max:           Min=" << minTMax << " Max=" << maxTMax << " Avg=" << avgTMax << "\n";
}

int main(int argc, char* argv[]) {
    int pValue = 50;
    int mapIndex = 0;
    int numSimulations = 1;

    for (int i = 1; i < argc; ++i) {
        std::string arg = argv[i];
        if (arg == "-h" || arg == "--help") {
            printHelp();
            return 0;
        } else if (arg == "-p" && i + 1 < argc) {
            pValue = std::stoi(argv[++i]);
        } else if (arg == "-m" && i + 1 < argc) {
            mapIndex = std::stoi(argv[++i]);
        } else if (arg == "-n" && i + 1 < argc) {
            numSimulations = std::stoi(argv[++i]);
        } else {
            std::cerr << "Unknown option: " << arg << "\n";
            printHelp();
            return 1;
        }
    }

    std::vector<SimulationMetrics> metrics;


    for (int i = 0; i < numSimulations; ++i) {
        load_map(mapIndex);
        set_active_probability(pValue);

        while (!is_simulation_complete()) {
            simulate_step();
        }

        metrics.push_back({
            get_makespan(),
            get_e_total(),
            get_e_max(),
            get_t_total(),
            get_t_max(),
            get_available_cells()
        });

        reset_simulation();
    }

    logMetrics(metrics);

    return 0;
}