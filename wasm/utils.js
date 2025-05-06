// WASM utility functions
export function memset(ptr, value, size, memory) {
    if (!memory) {
        console.error("Wasm memory not provided for memset");
        return ptr;
    }
    const buffer = new Uint8Array(memory.buffer);
    buffer.fill(value, ptr, ptr + size);
    return ptr;
}
export function memcpy(dest, src, len, memory) {
    if (!memory) {
        console.error("Wasm memory not provided for memcpy");
        return dest;
    }
    const buffer = new Uint8Array(memory.buffer);
    const srcArray = buffer.subarray(src, src + len);
    buffer.set(srcArray, dest);
    return dest;
}
export async function wasmLoad(fileName, imports) {
    const response = await fetch(fileName);
    if (!response.ok) {
        throw new Error(`Failed to load WebAssembly module: ${response.statusText}`);
    }
    const wasmBuffer = await response.arrayBuffer();
    const wasmModule = await WebAssembly.compile(wasmBuffer);
    const instance = await WebAssembly.instantiate(wasmModule, imports);
    return instance.exports;
}
//# sourceMappingURL=utils.js.map