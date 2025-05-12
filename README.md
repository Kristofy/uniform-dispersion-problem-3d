# Project description
This project is created for our masters course "Hálózati Algoritmusok" at ELTE, this is a Student Project, that is an extention of the following paper: [Time, Travel, and Energy in the Uniform Dispersion Problem by Michael Amir, Alfred M. Bruckstein](https://arxiv.org/pdf/2404.19564), where we will show a way to keep the stated energy effcient behavour in a certain 3d topology, jut like how they showed an optimal algorithm in 2d simply connected topologies.

# Uniform Dispersion Problem

This project simulates the uniform dispersion of robots in a 3d grid field. The robots navigate through the field, avoiding obstacles and ensuring even distribution.

## Table of Contents

- [Uniform Dispersion Problem](#uniform-dispersion-problem)
  - [Table of Contents](#table-of-contents)
  - [Introduction](#introduction)
  - [Installation](#installation)
    - [Or run the project locally:](#or-run-the-project-locally)
  - [Usage](#usage)

## Introduction

The Uniform Dispersion Problem involves distributing robots uniformly across a field while avoiding obstacles. This project provides a visual simulation of this problem, allowing users to load different field configurations and observe the robots' behavior.

> [!NOTE]
> This algorithm only works on environments where we can built the 3d space up from vertical columns (full length), and connect these columns based on side adjacency, when the given graph is a tree, the algoritm is garanteed to work.
> We can show that this topologies include every 2D simply connected topology as well.

## Installation

Check out the hosted version of the project [here](https://kristofy.github.io/uniform-dispersion-problem-3d/).

Or check out some aggregate data from multiple parallel simulations [here](https://kristofy.github.io/uniform-dispersion-problem-3d/multi-simulation.html).


### Or run the project locally:

1. Clone the repository:

   ```sh
   $ git clone https://github.com/Kristofy/uniform-dispersion-problem-3d.git
   $ cd uniform-dispersion-problem
   ```

2. Install the dependencies

   ```sh
   $ npm install
   ```

  
3. Compile and start

   ```sh
   $ make run
   ```

3. Open the hosted version in a browser.

## Usage

You can interract with the online GUI-s, that are using WEBGL and WASM to display and execute the login respecticely, but you may also compila a native executable, that you can run on the cli.

```sh
$ make cli
$ ./dist/wasm_cli --help
$ ./dist/wasm_cli -p 70 -m 1 -n 10
```

You can set the number of simulations, the id of the map you want and the p value, for the async simulation.

### Maps

The maps are baked in to the executable, but it is possible to provide a JSON map that then gets changed to the correct format, with

```sh
python scripts/convert.py -i reference/map_1.json reference/map_2.json -o src/wasm/maps.h
```

With this approach, we do not have a runtime dependency on python, just a compile time one, when the maps are changeing.




