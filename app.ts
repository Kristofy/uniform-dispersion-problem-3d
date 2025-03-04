document.addEventListener("DOMContentLoaded", main, false);

/**
 * Loads a WebAssembly module and returns its exports.
 */
async function wasmLoad<T extends object>(fileName: string, imports: WebAssembly.Imports): Promise<T> {
    return await new Promise<T>((resolve, reject) => {
        const request = new XMLHttpRequest();
        request.open("GET", fileName);
        request.responseType = "arraybuffer";
        request.send();

        request.onload = () => {
            const wasmSource = request.response;
            const wasmModule = new WebAssembly.Module(wasmSource);
            const exports = new WebAssembly.Instance(wasmModule, imports).exports;
            resolve(exports as T);
        }; // XMLHttpRequest.onload()

        request.onerror = () => {
            reject(new Error("Failed to load WebAssembly module."));
        };
    }); // Promise
} // loadWasm()

//===============================================================
async function main() {
    const memory = new WebAssembly.Memory({ initial: 100, maximum: 1000 });
    const imports = {
        env: {
            console_log: (arg: unknown) => {
                console.log(arg);
            },
            memory: memory,
        },
    };

    const wasm = await wasmLoad<{
        addone: (arg: number) => number;
    }>("main.wasm", imports);

    console.log(wasm);
    console.log(wasm.addone(2));
}
