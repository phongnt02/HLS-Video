export class FrameProcessor {
    constructor() {
        this.canvas = document.createElement('canvas');
        this.ctx = this.canvas.getContext('2d', {
            willReadFrequently: true,
            alpha: false
        });
    }

    async extractKeyFrame(segment) {
        console.log('[FrameProcessor] Extracting key frame from segment', {
            segmentNumber: segment.sn,
            duration: segment.duration,
            hasData: !!segment.data,
            dataType: segment.data ? typeof segment.data : 'none'
        });
    
        // Get segment data as ArrayBuffer
        let segmentData;
        if (segment.data instanceof ArrayBuffer) {
            segmentData = segment.data;
        } else if (segment.data instanceof Uint8Array) {
            segmentData = segment.data.buffer;
        } else {
            console.error('[FrameProcessor] Invalid segment data:', segment);
            throw new Error('Invalid segment data format');
        }
        
        return new Promise((resolve, reject) => {
            const video = document.createElement('video');
            video.autoplay = false;
            video.muted = true;

            video.onloadedmetadata = () => {
                console.log('[FrameProcessor] Video metadata loaded:', {
                    width: video.videoWidth,
                    height: video.videoHeight,
                    duration: video.duration
                });

                this.canvas.width = video.videoWidth;
                this.canvas.height = video.videoHeight;
                
                video.onseeked = () => {
                    try {
                        this.ctx.drawImage(video, 0, 0);
                        const imageData = this.ctx.getImageData(
                            0, 0, 
                            this.canvas.width, 
                            this.canvas.height
                        );
                        
                        const frameInfo = {
                            data: imageData,
                            width: video.videoWidth,
                            height: video.videoHeight,
                            timestamp: video.currentTime,
                            duration: video.duration
                        };

                        // Cleanup
                        URL.revokeObjectURL(video.src);
                        video.remove();
                        
                        console.log('[FrameProcessor] Frame extracted successfully');
                        resolve(frameInfo);
                    } catch (error) {
                        console.error('[FrameProcessor] Frame extraction error:', error);
                        reject(error);
                    }
                };

                const seekTime = video.duration / 2;
                console.log(`[FrameProcessor] Seeking to time: ${seekTime}s`);
                video.currentTime = seekTime;
            };

            video.onerror = (error) => {
                console.error('[FrameProcessor] Video loading error:', error);
                URL.revokeObjectURL(video.src);
                video.remove();
                reject(new Error('Failed to load video segment: ' + (error.message || 'Unknown error')));
            };

            // Get segment data as ArrayBuffer
            let segmentData;
            if (segment.data instanceof ArrayBuffer) {
                segmentData = segment.data;
            } else if (segment.data instanceof Uint8Array) {
                segmentData = segment.data.buffer;
            } else {
                reject(new Error('Invalid segment data format'));
                return;
            }

            try {
                const blob = new Blob([segmentData], { type: 'video/mp4; codecs="avc1.42E01E"' });
                video.src = URL.createObjectURL(blob);
            } catch (error) {
                console.error('[FrameProcessor] Failed to create video blob:', error);
                reject(error);
            }
        });
    }

    async frameToSegment(frameInfo, originalSegment) {
        console.log('[FrameProcessor] Converting frame to segment');
        
        // Ensure canvas matches frame dimensions
        this.canvas.width = frameInfo.width;
        this.canvas.height = frameInfo.height;
        
        // Draw frame to canvas
        this.ctx.putImageData(frameInfo.data, 0, 0);

        return new Promise((resolve, reject) => {
            try {
                const stream = this.canvas.captureStream();
                const recorder = new MediaRecorder(stream, {
                    mimeType: 'video/webm;codecs=vp8',
                    videoBitsPerSecond: 8000000 // High bitrate for quality
                });

                const chunks = [];
                recorder.ondataavailable = e => chunks.push(e.data);
                
                recorder.onstop = async () => {
                    try {
                        const blob = new Blob(chunks, { type: 'video/webm' });
                        const arrayBuffer = await blob.arrayBuffer();

                        // Create enhanced segment with original metadata
                        const enhancedSegment = {
                            ...originalSegment,
                            data: arrayBuffer,
                            duration: originalSegment.duration,
                            startTime: originalSegment.startTime
                        };

                        console.log('[FrameProcessor] Segment created successfully');
                        resolve(enhancedSegment);
                    } catch (error) {
                        console.error('[FrameProcessor] Failed to create segment:', error);
                        reject(error);
                    }
                };

                recorder.onerror = (error) => {
                    console.error('[FrameProcessor] Recording error:', error);
                    reject(error);
                };

                // Start recording
                recorder.start();
                
                // Record for duration of original segment
                const recordingDuration = Math.max(
                    originalSegment.duration * 1000, // Convert to ms
                    100 // Minimum duration
                );
                
                console.log(`[FrameProcessor] Recording for ${recordingDuration}ms`);
                setTimeout(() => recorder.stop(), recordingDuration);

            } catch (error) {
                console.error('[FrameProcessor] Stream creation failed:', error);
                reject(error);
            }
        });
    }

    calculateSegmentBitrate(segment) {
        // Calculate bitrate in bits per second
        const bitsPerSecond = (segment.data.byteLength * 8) / segment.duration;
        return Math.round(bitsPerSecond);
    }

    async verifySegment(segment) {
        return new Promise((resolve, reject) => {
            const video = document.createElement('video');
            video.autoplay = false;
            video.muted = true;

            video.onloadedmetadata = () => {
                const isValid = video.videoWidth > 0 && 
                              video.videoHeight > 0 && 
                              video.duration > 0;
                              
                URL.revokeObjectURL(video.src);
                video.remove();
                
                if (isValid) {
                    resolve(true);
                } else {
                    reject(new Error('Invalid segment generated'));
                }
            };

            video.onerror = () => reject(new Error('Failed to verify segment'));

            const blob = new Blob([segment.data], { type: 'video/mp4' });
            video.src = URL.createObjectURL(blob);
        });
    }
}

export default new FrameProcessor();