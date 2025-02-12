import enhanceProcessor from '../processors/enhance-processor.js';
import frameProcessor from '../processors/frame-processor.js';
import { updateStatus } from '../player/ui.js';

class VideoEnhancement {
    constructor() {
        this.isEnhancing = false;
        this.enhanceEnabled = false;
        this.currentSegment = null;
        this.enhanceButton = null;
        this.callback = null;
        this.enhancementQueue = new Map(); // Store enhanced segments
        this.enhancementStatus = null;
        this.enhancementMessage = null;
    }

    initialize() {
        // Get pre-defined elements
        this.enhanceButton = document.getElementById('enhance-button');
        this.enhancementStatus = document.querySelector('.enhancement-status');
        this.enhancementMessage = document.querySelector('.enhancement-message');

        if (this.enhanceButton) {
            this.enhanceButton.addEventListener('click', async () => {
                if (this.callback && !this.isEnhancing) {
                    console.log('[VideoEnhancement] Enhance button clicked');
                    this.enhanceButton.classList.add('enhancing');
                    this.showEnhancementStatus('Starting enhancement...');
                    
                    try {
                        await this.callback();
                    } catch (error) {
                        console.error('[VideoEnhancement] Enhancement failed:', error);
                        this.showEnhancementStatus('Enhancement failed: ' + error.message);
                    } finally {
                        this.enhanceButton.classList.remove('enhancing');
                        setTimeout(() => this.hideEnhancementStatus(), 2000);
                    }
                }
            });
        }
    }

    async enhanceSegment(segment) {
        if (!this.initialized) {
            await this.initialize();
        }
    
        try {
            console.log('[EnhanceProcessor] Starting segment enhancement');
            const startTime = performance.now();
    
            // Extract frame from segment
            const frame = await this.extractFrameFromSegment(segment.data);
            console.log('[EnhanceProcessor] Frame extracted:', {
                width: frame.width,
                height: frame.height
            });
    
            // Enhance frame
            const enhancedFrame = await this.enhanceFrame({
                data: frame,
                timestamp: segment.start
            });
    
            // Convert enhanced frame back to video segment
            const enhancedSegment = await this.frameToSegment(enhancedFrame, segment);
            
            const processTime = performance.now() - startTime;
            console.log(`[EnhanceProcessor] Segment enhanced in ${processTime.toFixed(2)}ms`);
            
            return enhancedSegment;
    
        } catch (error) {
            console.error('[EnhanceProcessor] Segment enhancement failed:', error);
            throw error;
        }
    }

    async frameToSegment(enhancedFrame, originalSegment) {
        const canvas = document.createElement('canvas');
        canvas.width = enhancedFrame.data.width;
        canvas.height = enhancedFrame.data.height;
        
        const ctx = canvas.getContext('2d', { alpha: false });
        ctx.putImageData(enhancedFrame.data, 0, 0);
    
        return new Promise((resolve, reject) => {
            const stream = canvas.captureStream();
            const recorder = new MediaRecorder(stream, {
                mimeType: 'video/webm;codecs=vp8',
                videoBitsPerSecond: 8000000
            });
    
            const chunks = [];
            recorder.ondataavailable = e => chunks.push(e.data);
    
            recorder.onstop = async () => {
                try {
                    const blob = new Blob(chunks, { type: 'video/webm' });
                    const arrayBuffer = await blob.arrayBuffer();
    
                    const enhancedSegment = {
                        ...originalSegment,
                        data: arrayBuffer,
                        scale: this.scale
                    };
    
                    resolve(enhancedSegment);
                } catch (error) {
                    reject(error);
                }
            };
    
            recorder.start();
            // Record for segment duration
            setTimeout(() => recorder.stop(), 
                Math.max(originalSegment.duration * 1000, 100)
            );
        });
    }
    
    async extractFrameFromSegment(segmentData) {
        const videoElement = document.createElement('video');
        
        try {
            // Create blob URL from segment data
            const blob = new Blob([segmentData], { type: 'video/mp4' });
            videoElement.src = URL.createObjectURL(blob);
    
            // Wait for metadata to load
            await new Promise((resolve, reject) => {
                videoElement.onloadedmetadata = resolve;
                videoElement.onerror = reject;
            });
    
            // Create canvas
            const canvas = document.createElement('canvas');
            canvas.width = videoElement.videoWidth;
            canvas.height = videoElement.videoHeight;
            const ctx = canvas.getContext('2d', { alpha: false });
    
            // Seek to middle of segment
            videoElement.currentTime = videoElement.duration / 2;
            
            // Wait for seek to complete
            await new Promise((resolve) => {
                videoElement.onseeked = resolve;
            });
    
            // Draw frame to canvas
            ctx.drawImage(videoElement, 0, 0);
            const frame = ctx.getImageData(0, 0, canvas.width, canvas.height);
    
            // Cleanup
            URL.revokeObjectURL(videoElement.src);
            videoElement.remove();
    
            return frame;
    
        } catch (error) {
            console.error('[EnhanceProcessor] Frame extraction failed:', error);
            if (videoElement.src) {
                URL.revokeObjectURL(videoElement.src);
            }
            videoElement.remove();
            throw error;
        }
    }    

    showEnhanceButton(show) {
        if (this.enhanceButton) {
            if (show) {
                console.log('[VideoEnhancement] Showing enhance button');
                this.enhanceButton.classList.remove('hidden');
                // Add active state styling if needed
                if (this.isEnhancing) {
                    this.enhanceButton.classList.add('active');
                }
            } else {
                console.log('[VideoEnhancement] Hiding enhance button');
                this.enhanceButton.classList.add('hidden');
                this.enhanceButton.classList.remove('active');
            }
        }
    }

    toggleEnhancement() {
        if (this.enhanceButton) {
            const isActive = this.enhanceButton.classList.contains('active');
            if (isActive) {
                this.enhanceButton.classList.remove('active');
                // Call disableEnhancement from events
                if (this.enhancementController) {
                    this.enhancementController.disableEnhancement();
                }
            } else {
                this.enhanceButton.classList.add('active');
                // Trigger enhancement if segment is ready
                if (this.callback) {
                    this.callback();
                }
            }
        }
    }

    showEnhancementStatus(message) {
        if (this.enhancementStatus && this.enhancementMessage) {
            this.enhancementMessage.textContent = message;
            this.enhancementStatus.classList.add('visible');
            updateStatus(message);
        }
    }

    hideEnhancementStatus() {
        if (this.enhancementStatus) {
            this.enhancementStatus.classList.remove('visible');
            updateStatus('Ready');
        }
    }

    setEnhanceCallback(callback) {
        this.callback = callback;
    }

    async enhanceSegment(segment) {
        if (!segment || this.isEnhancing) {
            console.log('[VideoEnhancement] Enhancement blocked:', {
                hasSegment: !!segment,
                isEnhancing: this.isEnhancing
            });
            return null;
        }

        // Check cache first
        if (this.enhancementQueue.has(segment.sn)) {
            console.log('[VideoEnhancement] Found cached segment:', segment.sn);
            return this.enhancementQueue.get(segment.sn);
        }
        
        this.isEnhancing = true;
        this.currentSegment = segment;
        
        try {
            console.log('[VideoEnhancement] Starting enhancement for segment:', segment.sn);
            
            // Extract frame from segment
            console.log('[VideoEnhancement] Processing segment:', {
                number: segment.sn,
                duration: segment.duration,
                hasData: !!segment.data,
                dataSize: segment.data ? segment.data.byteLength : 0
            });
            
            // Extract frame from segment data (not whole segment object)
            const frameInfo = await frameProcessor.extractKeyFrame(segment);
            
            // Enhance the frame
            this.showEnhancementStatus('Enhancing segment...');
            const enhancedSegment = await enhanceProcessor.enhanceSegment(segment);
            
            // Store in cache
            this.enhancementQueue.set(segment.sn, enhancedSegment);
            
            // Clean up old segments (keep last 5)
            const keys = Array.from(this.enhancementQueue.keys());
            if (keys.length > 5) {
                this.enhancementQueue.delete(keys[0]);
            }
            
            console.log('[VideoEnhancement] Enhancement complete for segment:', segment.sn);
            this.showEnhancementStatus('Enhancement complete');
            
            this.isEnhancing = false;
            this.currentSegment = null;
            return enhancedSegment;

        } catch (error) {
            console.error('[VideoEnhancement] Enhancement failed:', error);
            this.showEnhancementStatus('Enhancement failed');
            this.isEnhancing = false;
            this.currentSegment = null;
            throw error;
        }
    }

    getEnhancedSegment(segmentNumber) {
        return this.enhancementQueue.get(segmentNumber);
    }

    hasEnhancedSegment(segmentNumber) {
        return this.enhancementQueue.has(segmentNumber);
    }

    isCurrentlyEnhancing() {
        return this.isEnhancing;
    }

    enableEnhancement(enable) {
        this.enhanceEnabled = enable;
        this.showEnhanceButton(enable);
    }

    reset() {
        this.isEnhancing = false;
        this.enhanceEnabled = false;
        this.currentSegment = null;
        this.enhancementQueue.clear();
        this.showEnhanceButton(false);
        this.hideEnhancementStatus();
    }
}

export default new VideoEnhancement();