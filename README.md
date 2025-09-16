# pdf-compress-applet
This is a self-contained, client-side web application for compressing PDF files. It uses a WebAssembly port of Ghostscript to perform powerful, high-quality compression directly in the user's browser. All processing happens locally.

## Features

* **User-Selectable Quality:** Choose from multiple compression presets (Screen, eBook, Printer, Prepress) to balance file size and quality.
* **Large File Support:** Utilizes file chunking to reliably compress large PDFs without crashing the browser tab.
* **Progress Tracking:** Displays elapsed time and an Estimated Time Remaining (ETR) for large, multi-chunk files.
* **Background Processing:** Runs the heavy Ghostscript process in a Web Worker to keep the user interface fully responsive during compression.

## How to Use

## License

This project is licensed under the **GNU Affero General Public License v3.0 (AGPLv3)**. A copy of the license is included in the `LICENSE` file.

In simple terms, this license's main condition is that if you use this code as part of a service that users interact with over a network, you must also make the complete and corresponding source code of your modified version available to those users.

## Acknowledgements

* **Ghostscript:** The PDF/PostScript interpreter maintained by [Artifex Software, Inc.](https://artifex.com/).
* **Ghostscript WASM Compilation:** The core WebAssembly module was compiled by **[@ochachacha](https://github.com/ochachacha)** in the [ps-wasm](https://github.com/ochachacha/ps-wasm) project.
* **Web Worker Implementation:** The web worker approach was referenced from the demo created by **[@laurentmmeyer](https://github.com/laurentmmeyer)** in the [ghostscript-pdf-compress.wasm](https://github.com/laurentmmeyer/ghostscript-pdf-compress.wasm) repository.
