document.addEventListener("DOMContentLoaded", main, false);

/**
 * Loads a WebAssembly module and returns its exports.
 *
 * @param {string} fileName - The path to the WebAssembly file.
 * @param {Object} [imports] - The imports to use when instantiating the
 * @returns {Promise<E>} A promise resolving to the module's exports.
 */
async function wasmLoad(fileName, imports) {
    return await new Promise((resolve, reject) => {
        const request = new XMLHttpRequest();
        request.open("GET", fileName);
        request.responseType = "arraybuffer";
        request.send();

        request.onload = () => {
            const wasmSource = request.response;
            const wasmModule = new WebAssembly.Module(wasmSource);
            const wasmInstance = new WebAssembly.Instance(wasmModule, imports);
            resolve(wasmInstance.exports);
        }; // XMLHttpRequest.onload()

        request.onerror = () => {
            reject(new Error("Failed to load WebAssembly module."));
        };
    }); // Promise
} // loadWasm()

//===============================================================
async function main() {
    const memory = new WebAssembly.Memory({ initial: 100, maximum: 1000 });
    heap = new Uint8Array(memory.buffer);
    const imports = {
        env: {
            console_log: (arg) => {
                console.log(arg);
            },
            memory: memory,
        },
    };

    const wasm = await wasmLoad("main.wasm", imports);

    console.log(wasm);
    console.log(wasm.addone(2));
}
