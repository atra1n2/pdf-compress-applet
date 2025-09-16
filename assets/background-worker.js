/**
 * PDF Compression Web Worker
 *
 * This script runs Ghostscript in a background thread to compress a PDF
 * without freezing the user interface.
 *
 * License: AGPL v3
 * 
 *
 * This implementation is based on the work of:
 * - Ghostscript WASM Compiler: @ochachacha (https://github.com/ochachacha/ps-wasm)
 * - Web Worker Example: @laurentmmeyer (https://github.com/laurentmmeyer/ghostscript-pdf-compress.wasm)
 */

// This function dynamically imports the main Ghostscript worker script.
function loadGhostscriptModule() {
    import("./gs-worker.js");
}

// This is the main function that handles the compression process.
function runGhostscript(data, onCompleteCallback) {
    // Step 1: Fetch the PDF data that was passed from the main thread.
    const request = new XMLHttpRequest();
    request.open("GET", data.psDataURL);
    request.responseType = "arraybuffer";

    request.onload = function () {
        // Clean up the temporary URL.
        self.URL.revokeObjectURL(data.psDataURL);

        // Get the user-selected quality preset.
        const pdfSetting = data.pdfSetting;

        // Step 2: Configure the Emscripten Module for Ghostscript.
        const emscriptenModule = {
            // Before running, write the fetched PDF data into the virtual file system.
            preRun: [
                function () {
                    self.Module.FS.writeFile("input.pdf", new Uint8Array(request.response));
                },
            ],
            // After running, read the compressed output file and send it back.
            postRun: [
                function () {
                    const resultBytes = self.Module.FS.readFile("output.pdf", { encoding: "binary" });
                    const resultBlob = new Blob([resultBytes], { type: "application/octet-stream" });
                    const resultUrl = self.URL.createObjectURL(resultBlob);
                    // Call the callback function with the URL of the compressed PDF.
                    onCompleteCallback(resultUrl);
                },
            ],
            // Step 3: Define the command-line arguments for Ghostscript.
            // This is where the user's selected preset is used.
            arguments: [
                "-sDEVICE=pdfwrite",
                "-dCompatibilityLevel=1.4",
                "-dPDFSETTINGS=" + pdfSetting, // <-- Your dynamic setting is used here!
                "-DNOPAUSE",
                "-dQUIET",
                "-dBATCH",
                "-sOutputFile=output.pdf",
                "input.pdf",
            ],
            // Suppress default print/error logs in the console.
            print: function (text) {},
            printErr: function (text) {},
        };

        // Step 4: Load and run the Ghostscript module.
        if (!self.Module) {
            self.Module = emscriptenModule;
            loadGhostscriptModule();
        } else {
            // If already loaded, just re-run with new arguments.
            self.Module["calledRun"] = false;
            self.Module["postRun"] = emscriptenModule.postRun;
            self.Module["preRun"] = emscriptenModule.preRun;
            self.Module.callMain(emscriptenModule.arguments); // Re-running requires passing arguments here.
        }
    };

    request.send();
}

// Listen for messages from the main application thread (your app.js).
self.addEventListener('message', function ({ data: eventData }) {
    if (eventData.target === 'wasm') {
        // When a message is received, run the Ghostscript process.
        runGhostscript(eventData.data, (resultUrl) => {
            // When complete, send the resulting file URL back to the main thread.
            self.postMessage(resultUrl);
        });
    }
});

console.log("Compression worker is ready.");