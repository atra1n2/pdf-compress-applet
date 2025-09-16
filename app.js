document.addEventListener('DOMContentLoaded', () => {
	const { PDFDocument } = PDFLib;
	
	const dropZone = document.getElementById('compress-drop-zone');
	const fileDisplay = document.getElementById('compress-file-display');
	const fileNameEl = document.getElementById('compress-filename');
	const clearBtn = document.getElementById('clear-compress-btn');
	const fileInput = document.getElementById('compress-file');
	const qualitySelect = document.getElementById('compress-quality');
	const compressBtn = document.getElementById('compress-btn');
	const progressContainer = document.getElementById('compress-progress-container');
	const errorContainer = document.getElementById('compress-error-container');
	const timerElement = document.getElementById('compress-timer');
	const progressText = document.getElementById('compress-progress-text');
	const progressBar = document.getElementById('compress-progress-bar');
	const etrElement = document.getElementById('compress-etr');
	const qualityLabel = document.getElementById('compress-quality-label');
	const errorText = document.getElementById('compress-error-text');
	
	let compressFileSource = null;
	
	dropZone.addEventListener('click', () => fileInput.click());
	dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('drag-over'); });
	dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
	dropZone.addEventListener('drop', (e) => {
	    e.preventDefault();
	    dropZone.classList.remove('drag-over');
	    handleCompressFile(e.dataTransfer.files);
	});
	fileInput.addEventListener('change', (e) => handleCompressFile(e.target.files));
	compressBtn.addEventListener('click', compressPDF);
	clearBtn.addEventListener('click', clearCompress);
	
	function handleCompressFile(files) {
	    if (files.length > 0) {
	        compressFileSource = files[0];
	        fileNameEl.textContent = files[0].name;
	        dropZone.classList.add('hidden');
	        fileDisplay.classList.remove('hidden');
	        compressBtn.disabled = false;
	    }
	}
	
	function clearCompress() {
	    compressFileSource = null;
	    fileInput.value = '';
	    dropZone.classList.remove('hidden');
	    fileDisplay.classList.add('hidden');
	    compressBtn.disabled = true;
	    progressContainer.classList.add('hidden');
	    errorContainer.classList.add('hidden');
	}
	
	function showDownloadModal(blob, defaultName = 'document.pdf') {
	    pendingDownload = blob;
	    document.getElementById('download-filename').value = defaultName;
	    document.getElementById('download-modal').classList.remove('hidden');
	}
	
	window.confirmDownload = function() {
	    if (!pendingDownload) return;
	    const filename = document.getElementById('download-filename').value || 'document.pdf';
	    const url = URL.createObjectURL(pendingDownload);
	    const a = document.createElement('a');
	    a.href = url;
	    a.download = filename;
	    document.body.appendChild(a);
	    a.click();
	    document.body.removeChild(a);
	    URL.revokeObjectURL(url);
	    cancelDownload();
	}
	
	window.cancelDownload = function() {
	    document.getElementById('download-modal').classList.add('hidden');
	    pendingDownload = null;
	}
	
	function formatBytes(bytes) {
	    if (bytes === 0) return '0 Bytes';
	    const k = 1024;
	    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
	    const i = Math.floor(Math.log(bytes) / Math.log(k));
	    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
	}
	
	function formatRemainingTime(ms) {
	    if (ms <= 0) return '0s';
	    const totalSeconds = Math.round(ms / 1000);
	    const minutes = Math.floor(totalSeconds / 60);
	    const seconds = totalSeconds % 60;
	    return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
	}
	
	function processChunkInWorker(chunkBytes, quality) {
	    return new Promise((resolve, reject) => {
	        const worker = new Worker('./assets/background-worker.js', { type: 'module' });
	        const blob = new Blob([chunkBytes], { type: 'application/pdf' });
	        const blobUrl = URL.createObjectURL(blob);
	        worker.postMessage({ target: 'wasm', data: { psDataURL: blobUrl, pdfSetting: quality } });
	        setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
	        const timeout = setTimeout(() => {
	            worker.terminate();
	            reject(new Error('Compression chunk timed out.'));
	        }, 300000);
	        worker.onmessage = async (event) => {
	            clearTimeout(timeout);
	            try {
	                const response = await fetch(event.data);
	                const resultBytes = await (await response.blob()).arrayBuffer();
	                URL.revokeObjectURL(event.data);
	                worker.terminate();
	                resolve(resultBytes);
	            } catch (e) {
	                worker.terminate();
	                reject(e);
	            }
	        };
	        worker.onerror = (error) => {
	            clearTimeout(timeout);
	            worker.terminate();
	            reject(new Error(error.message || 'An unknown worker error occurred.'));
	        };
	    });
	}
	
	async function compressPDF() {
	    if (!compressFileSource) return;
	
	    const file = compressFileSource;
	    const originalSize = file.size;
	    const quality = qualitySelect.value;
	    const qualityLabels = {
	        '/ebook': 'Medium (150 dpi)', '/screen': 'Maximum (72 dpi)',
	        '/printer': 'High (300 dpi)', '/prepress': 'Minimum (300 dpi, color preserving)'
	    };
	
	    progressContainer.classList.remove('hidden');
	    errorContainer.classList.add('hidden');
	    compressBtn.disabled = true;
	    progressBar.style.width = '0%';
	    progressText.textContent = 'Preparing compression...';
	    etrElement.classList.add('hidden');
	    qualityLabel.textContent = qualityLabels[quality];
	
	    let startTime = Date.now();
	    let etrInterval = null;
	    const timerInterval = setInterval(() => {
	        const elapsed = Math.floor((Date.now() - startTime) / 1000);
	        timerElement.textContent = `Elapsed: ${elapsed}s`;
	    }, 1000);
	
	    try {
	        const CHUNK_THRESHOLD = 6 * 1024 * 1024;
	        const arrayBuffer = await file.arrayBuffer();
	        let finalPdfBytes;
	
	        if (originalSize <= CHUNK_THRESHOLD) {
	            progressText.textContent = 'Compressing PDF...';
	            finalPdfBytes = await processChunkInWorker(arrayBuffer, quality);
	            progressBar.style.width = '100%';
	        } else {
	            progressText.textContent = 'Analyzing large PDF...';
	            const pdfDoc = await PDFDocument.load(arrayBuffer);
	            const totalPages = pdfDoc.getPageCount();
	
	            const TARGET_CHUNK_SIZE = 4 * 1024 * 1024;
	            const avgPageSize = originalSize / totalPages;
	            let pagesPerChunk = Math.max(1, Math.floor(TARGET_CHUNK_SIZE / avgPageSize));
	            const numChunks = Math.ceil(totalPages / pagesPerChunk);
	            const chunkDurations = [];
	            const compressedChunks = [];
	
	            for (let i = 0; i < numChunks; i++) {
	                progressText.textContent = `Compressing chunk ${i + 1} of ${numChunks}...`;
	                const chunkStartTime = Date.now();
	                
	                const newPdf = await PDFDocument.create();
	                const startIndex = i * pagesPerChunk;
	                const endIndex = Math.min(startIndex + pagesPerChunk, totalPages);
	                const pageIndices = Array.from({ length: endIndex - startIndex }, (_, k) => startIndex + k);
	                
	                const copiedPages = await newPdf.copyPages(pdfDoc, pageIndices);
	                copiedPages.forEach(page => newPdf.addPage(page));
	                const chunkBytes = await newPdf.save();
	
	                const compressedChunkBytes = await processChunkInWorker(chunkBytes, quality);
	                
	                const chunkDuration = Date.now() - chunkStartTime;
	                chunkDurations.push(chunkDuration);
	                const avgDuration = chunkDurations.reduce((a, b) => a + b, 0) / chunkDurations.length;
	                const remainingChunks = numChunks - (i + 1);
	                
	                if (etrInterval) clearInterval(etrInterval);
	
	                if (remainingChunks > 0) {
	                    let remainingMs = avgDuration * remainingChunks;
	                    etrElement.classList.remove('hidden');
	                    etrElement.textContent = `~${formatRemainingTime(remainingMs)} remaining`;
	                    etrInterval = setInterval(() => {
	                        remainingMs -= 1000;
	                        etrElement.textContent = `~${formatRemainingTime(Math.max(0, remainingMs))}`;
	                        if (remainingMs <= 0) clearInterval(etrInterval);
	                    }, 1000);
	                }
	                compressedChunks.push(compressedChunkBytes); 
	                progressBar.style.width = `${((i + 1) / numChunks) * 100}%`;
	            }
	
	            progressText.textContent = 'Merging compressed chunks...';
	            const mergedPdf = await PDFDocument.create();
	            for (const chunkBytes of compressedChunks) { 
	                const chunkPdf = await PDFDocument.load(chunkBytes);
	                const pages = await mergedPdf.copyPages(chunkPdf, chunkPdf.getPageIndices());
	                pages.forEach(page => mergedPdf.addPage(page));
	            }
	            finalPdfBytes = await mergedPdf.save();
	        }
	
	        const blob = new Blob([finalPdfBytes], { type: 'application/pdf' });
	        const compressedSize = blob.size;
	        const reduction = Math.max(0, ((1 - compressedSize / originalSize) * 100)).toFixed(1);
	        
	        showDownloadModal(blob, file.name.replace('.pdf', '-compressed.pdf'));
	        clearCompress();
	
	    } catch (error) {
	        errorContainer.classList.remove('hidden');
	        errorText.textContent = error.message;
	        console.error('Compression error:', error);
	    } finally {
	        clearInterval(timerInterval);
	        if (etrInterval) clearInterval(etrInterval);
	        compressBtn.disabled = false;
	    }
	}
	});