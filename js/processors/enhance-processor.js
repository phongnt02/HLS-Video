class EnhanceProcessor {
    constructor() {
        this.session = null;
        this.initialized = false;
        this.modelPath = './model/realesrgan_web.onnx';
        
        // Settings phải match với model requirements
        this.tileSize = 256;  // Model input size
        this.tileOverlap = 8;
        this.scale = 4;       // Scale factor
        this.maxSize = 2048 * 2048;
    }

    async waitForOrt() {
        let attempts = 0;
        const maxAttempts = 100;
        while (attempts < maxAttempts) {
            if (window.ort) return true;
            await new Promise(resolve => setTimeout(resolve, 100));
            attempts++;
        }
        throw new Error('ONNX Runtime failed to load after 10 seconds');
    }

    async initialize() {
        if (this.initialized) return;
    
        try {
            await this.waitForOrt();
            
            // Default to WASM
            const options = {
                executionProviders: ['wasm'],
                graphOptimizationLevel: 'all',
                executionMode: 'sequential',
                extra: {
                    session: {
                        intra_op_num_threads: navigator.hardwareConcurrency || 4,
                        inter_op_num_threads: navigator.hardwareConcurrency || 4,
                        optimization_level: 3
                    }
                }
            };
    
            console.log('[EnhanceProcessor] Loading model...');
            this.session = await ort.InferenceSession.create(this.modelPath, options);
            
            console.log('[EnhanceProcessor] Model loaded successfully');
            this.initialized = true;
        } catch (error) {
            console.error('[EnhanceProcessor] Initialization failed:', error);
            throw error;
        }
    }

    async preprocessFrame(frame) {
        const { width, height } = frame.data;
        const tiles = [];
    
        console.log(`[EnhanceProcessor] Processing frame: ${width}x${height}`);
        if (width * height > this.maxSize) {
            throw new Error(`Frame size ${width}x${height} exceeds maximum allowed size`);
        }
    
        // Create canvas for the frame
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d', { alpha: false });
        ctx.putImageData(frame.data, 0, 0);
    
        // Process tiles
        for (let y = 0; y < height; y += this.tileSize - this.tileOverlap) {
            for (let x = 0; x < width; x += this.tileSize - this.tileOverlap) {
                const tileWidth = Math.min(this.tileSize, width - x);
                const tileHeight = Math.min(this.tileSize, height - y);
    
                const tileCanvas = document.createElement('canvas');
                tileCanvas.width = this.tileSize;
                tileCanvas.height = this.tileSize;
                const tileCtx = tileCanvas.getContext('2d', { alpha: false });
    
                // Draw and get tile data
                tileCtx.drawImage(canvas, 
                    x, y, tileWidth, tileHeight,
                    0, 0, tileWidth, tileHeight
                );
    
                // Convert to tensor format
                const tensor = new Float32Array(3 * this.tileSize * this.tileSize);
                const imageData = tileCtx.getImageData(0, 0, tileWidth, tileHeight);
    
                // Fill tensor data
                for (let i = 0; i < imageData.data.length / 4; i++) {
                    const h = Math.floor(i / tileWidth);
                    const w = i % tileWidth;
                    
                    for (let c = 0; c < 3; c++) {
                        const tensorIdx = c * this.tileSize * this.tileSize + h * this.tileSize + w;
                        tensor[tensorIdx] = imageData.data[i * 4 + c] / 255.0;
                    }
                }
    
                // Handle padding
                this.padTensor(tensor, tileWidth, tileHeight);
    
                tiles.push({
                    tensor,
                    x,
                    y,
                    width: tileWidth,
                    height: tileHeight
                });
            }
        }
    
        return { tiles, originalSize: { width, height } };
    }

    padTensor(tensor, actualWidth, actualHeight) {
        for (let c = 0; c < 3; c++) {
            // Pad width
            for (let h = 0; h < actualHeight; h++) {
                for (let w = actualWidth; w < this.tileSize; w++) {
                    const edgeIdx = c * this.tileSize * this.tileSize + h * this.tileSize + (actualWidth - 1);
                    const padIdx = c * this.tileSize * this.tileSize + h * this.tileSize + w;
                    tensor[padIdx] = tensor[edgeIdx];
                }
            }
            // Pad height
            for (let h = actualHeight; h < this.tileSize; h++) {
                for (let w = 0; w < this.tileSize; w++) {
                    const edgeIdx = c * this.tileSize * this.tileSize + (actualHeight - 1) * this.tileSize + w;
                    const padIdx = c * this.tileSize * this.tileSize + h * this.tileSize + w;
                    tensor[padIdx] = tensor[edgeIdx];
                }
            }
        }
    }

    async enhanceFrame(frame) {
        try {
            const startTime = performance.now();
            console.log(`[EnhanceProcessor] Starting frame enhancement`);
            
            // Preprocess frame into tiles
            const { tiles, originalSize } = await this.preprocessFrame(frame);
            const processedTiles = [];
            
            // Process each tile
            for (let i = 0; i < tiles.length; i++) {
                const tile = tiles[i];
                const feeds = {
                    input: new ort.Tensor(
                        'float32',
                        tile.tensor,
                        [1, 3, this.tileSize, this.tileSize]  
                    )
                };
    
                const output = await this.session.run(feeds);
                processedTiles.push({
                    tensor: output.output.data,
                    x: tile.x,
                    y: tile.y,
                    width: tile.width, 
                    height: tile.height
                });
    
                // Add small delay between tiles
                if ((i + 1) % 4 === 0) {
                    await new Promise(resolve => setTimeout(resolve, 1));
                }
            }
    
            // Merge enhanced tiles
            const enhancedFrame = await this.mergeTiles(processedTiles, originalSize);
            
            const processTime = performance.now() - startTime;
            console.log(`[EnhanceProcessor] Frame enhanced in ${processTime.toFixed(2)}ms`);
            
            return {
                data: enhancedFrame,
                timestamp: frame.timestamp
            };
    
        } catch (error) {
            console.error(`[EnhanceProcessor] Frame enhancement failed:`, error);
            throw error;
        }
    }

    async mergeTiles(processedTiles, originalSize) {
        const canvas = document.createElement('canvas');
        canvas.width = originalSize.width * this.scale;
        canvas.height = originalSize.height * this.scale;
        const ctx = canvas.getContext('2d', { alpha: false });
    
        for (const tile of processedTiles) {
            const scaledTileCanvas = document.createElement('canvas');
            scaledTileCanvas.width = tile.width * this.scale;
            scaledTileCanvas.height = tile.height * this.scale;
            const tileCtx = scaledTileCanvas.getContext('2d', { alpha: false });
    
            const imageData = tileCtx.createImageData(
                tile.width * this.scale,
                tile.height * this.scale
            );
    
            // Convert enhanced tensor back to image
            const scaledSize = this.tileSize * this.scale;
            for (let y = 0; y < tile.height * this.scale; y++) {
                for (let x = 0; x < tile.width * this.scale; x++) {
                    const pixelIdx = (y * tile.width * this.scale + x) * 4;
                    
                    for (let c = 0; c < 3; c++) {
                        const tensorIdx = c * scaledSize * scaledSize + 
                                        y * scaledSize + x;
                        const value = Math.max(0, Math.min(255, 
                            Math.round(tile.tensor[tensorIdx] * 255)
                        ));
                        imageData.data[pixelIdx + c] = value;
                    }
                    imageData.data[pixelIdx + 3] = 255; // Alpha
                }
            }
    
            tileCtx.putImageData(imageData, 0, 0);
            ctx.drawImage(scaledTileCanvas, 
                tile.x * this.scale, 
                tile.y * this.scale,
                tile.width * this.scale,
                tile.height * this.scale
            );
        }
    
        return ctx.getImageData(0, 0, canvas.width, canvas.height);
    }
    

    async enhanceFrames(frames, progressCallback) {
        if (!this.initialized) {
            await this.initialize();
        }

        const totalFrames = frames.length;
        console.log(`[EnhanceProcessor] Starting enhancement of ${totalFrames} frames`);
        const enhancedFrames = [];

        try {
            for (let i = 0; i < frames.length; i++) {
                const frame = frames[i];
                const enhancedFrame = await this.enhanceFrame(frame);
                enhancedFrames.push(enhancedFrame);

                if (progressCallback) {
                    const progress = ((i + 1) / totalFrames) * 100;
                    progressCallback(progress);
                }
            }

            return enhancedFrames;

        } catch (error) {
            console.error('[EnhanceProcessor] Error enhancing frames:', error);
            throw error;
        }
    }

    async enhanceSegment(segment) {
        try {
            if (!this.initialized) {
                await this.initialize();
            }
    
            const startTime = performance.now();
            
            // Extract frames from segment (nhiều frames)
            const frames = await this.extractFramesFromSegment(segment.data);
            console.log(`[EnhanceProcessor] Extracted ${frames.length} frames from segment`);
    
            // Enhance từng frame
            const enhancedFrames = [];
            for (let i = 0; i < frames.length; i++) {
                console.log(`[EnhanceProcessor] Enhancing frame ${i + 1}/${frames.length}`);
                const frame = frames[i];
                
                // Preprocess extracted frame 
                const { tiles, originalSize } = await this.preprocessFrame(frame);
                
                // Process tiles
                const processedTiles = [];
                for (const tile of tiles) {
                    const inputShape = [1, 3, this.tileSize, this.tileSize];
                    const feeds = {
                        input: new ort.Tensor('float32', tile.tensor, inputShape)
                    };
    
                    // Run inference
                    const outputs = await this.session.run(feeds);
                    processedTiles.push({
                        tensor: outputs.output.data,
                        x: tile.x,
                        y: tile.y,
                        width: tile.width,
                        height: tile.height
                    });
                }
    
                // Merge tiles back to frame
                const enhancedFrame = await this.mergeTiles(processedTiles, originalSize);
                enhancedFrames.push(enhancedFrame);
            }
    
            // Merge enhanced frames back to video segment
            const enhancedSegment = await this.mergeFramesToSegment(enhancedFrames, segment);
                
            const totalTime = performance.now() - startTime;
            console.log(`[EnhanceProcessor] Segment processed in ${totalTime.toFixed(2)}ms`);
            
            return {
                ...segment,
                data: enhancedSegment.data
            };
    
        } catch (error) {
            console.error('[EnhanceProcessor] Segment enhancement failed:', error);
            throw error;
        }
    }
    
    async extractFramesFromSegment(segmentData) {
        const videoElement = document.createElement('video');
        videoElement.muted = true;
        
        try {
            const blob = new Blob([segmentData], { type: 'video/mp4' });
            videoElement.src = URL.createObjectURL(blob);
    
            await new Promise((resolve, reject) => {
                videoElement.onloadedmetadata = resolve;
                videoElement.onerror = reject;
            });
    
            const canvas = document.createElement('canvas');
            canvas.width = videoElement.videoWidth;
            canvas.height = videoElement.videoHeight;
            const ctx = canvas.getContext('2d', { alpha: false });
    
            const fps = 30; // Target FPS
            const duration = videoElement.duration;
            const totalFrames = Math.ceil(duration * fps);
            const frames = [];
    
            console.log(`[EnhanceProcessor] Extracting ${totalFrames} frames from segment`);
    
            for (let i = 0; i < totalFrames; i++) {
                // Seek to frame time
                const frameTime = (i / fps);
                videoElement.currentTime = frameTime;
                
                // Wait for seek to complete
                await new Promise(resolve => {
                    videoElement.onseeked = resolve;
                });
    
                // Draw and capture frame
                ctx.drawImage(videoElement, 0, 0);
                const frame = ctx.getImageData(0, 0, canvas.width, canvas.height);
                frames.push({
                    data: frame,
                    timestamp: frameTime
                });
            }
    
            // Cleanup
            URL.revokeObjectURL(videoElement.src);
            videoElement.remove();
    
            return frames;
    
        } catch (error) {
            console.error('[EnhanceProcessor] Frame extraction error:', error);
            if (videoElement.src) {
                URL.revokeObjectURL(videoElement.src);
            }
            videoElement.remove();
            throw error;
        }
    }

    async mergeFramesToSegment(enhancedFrames, originalSegment) {
        const canvas = document.createElement('canvas');
        const firstFrame = enhancedFrames[0];
        canvas.width = firstFrame.width;
        canvas.height = firstFrame.height;
        const ctx = canvas.getContext('2d', { alpha: false });
    
        const duration = originalSegment.duration;
        const fps = enhancedFrames.length / duration;
    
        // Create video stream
        const stream = canvas.captureStream();
        const recorder = new MediaRecorder(stream, {
            mimeType: 'video/webm;codecs=vp8',
            videoBitsPerSecond: 8000000 // High bitrate for quality
        });
    
        const chunks = [];
        recorder.ondataavailable = e => chunks.push(e.data);
    
        return new Promise((resolve, reject) => {
            recorder.start();
    
            let frameIndex = 0;
            const frameInterval = 1000 / fps;
            const startTime = performance.now();
    
            function drawNextFrame() {
                if (frameIndex < enhancedFrames.length) {
                    ctx.putImageData(enhancedFrames[frameIndex], 0, 0);
                    frameIndex++;
                    setTimeout(drawNextFrame, frameInterval);
                } else {
                    setTimeout(() => recorder.stop(), frameInterval);
                }
            }
    
            recorder.onstop = async () => {
                try {
                    const blob = new Blob(chunks, { type: 'video/webm' });
                    const arrayBuffer = await blob.arrayBuffer();
                    resolve({
                        ...originalSegment,
                        data: arrayBuffer
                    });
                } catch (error) {
                    reject(error);
                }
            };
    
            drawNextFrame();
        });
    }
}

// Export default instance
export default new EnhanceProcessor();