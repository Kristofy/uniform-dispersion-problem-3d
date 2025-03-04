# WASM

The project is split into two pieces, an engine in cpp and a web UI.

## Engine

The engine in cpp is also standalone, for a command line interface, and also used in the web version through WebAssembly

## Communication

The communication between wasm and the web memory and to VRAM for WEBGL to render

The wasm memory and web memory are shared (but changed in endianness), but the potential geometry will need to be transrfered to VRAM

https://threejs.org/docs/#examples/en/controls/OrbitControls
