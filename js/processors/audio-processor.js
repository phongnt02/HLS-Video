// js/processor/audio-processor.js

export class AudioProcessor {
    constructor() {
        this.audioContext = null;
        this.audioBufferCache = new Map();
    }

    async initAudioContext() {
        if (!this.audioContext) {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)({
                latencyHint: 'interactive',
                sampleRate: 48000
            });
        }
        return this.audioContext;
    }

    async extractAudioFromSegment(segmentData) {
        console.log('[AudioProcessor] Extracting audio from segment');
        
        const audioContext = await this.initAudioContext();
        const videoElement = document.createElement('video');
        
        try {
            // Create blob URL from segment data
            const blob = new Blob([segmentData], { type: 'video/mp4' });
            videoElement.src = URL.createObjectURL(blob);

            // Wait for video to load
            await new Promise((resolve, reject) => {
                videoElement.onloadedmetadata = resolve;
                videoElement.onerror = reject;
            });

            // Create audio processing nodes
            const source = audioContext.createMediaElementSource(videoElement);
            const destination = audioContext.createMediaStreamDestination();
            
            // Add compression for consistent audio levels
            const compressor = audioContext.createDynamicsCompressor();
            compressor.threshold.value = -24;
            compressor.knee.value = 30;
            compressor.ratio.value = 12;
            compressor.attack.value = 0.003;
            compressor.release.value = 0.25;
            
            source.connect(compressor);
            compressor.connect(destination);

            // Record audio
            const chunks = [];
            const recorder = new MediaRecorder(destination.stream, {
                mimeType: 'audio/webm;codecs=opus',
                audioBitsPerSecond: 128000
            });

            recorder.ondataavailable = e => chunks.push(e.data);

            const recordingPromise = new Promise(resolve => {
                recorder.onstop = () => {
                    const audioBlob = new Blob(chunks, { type: 'audio/webm;codecs=opus' });
                    resolve(audioBlob);
                };
            });

            // Start recording and playback
            recorder.start();
            videoElement.currentTime = 0;
            await videoElement.play();

            // Wait for playback to complete
            await new Promise(resolve => {
                videoElement.onended = () => {
                    setTimeout(resolve, 100); // Small buffer
                };
            });

            recorder.stop();
            const audioBlob = await recordingPromise;

            // Cleanup
            videoElement.pause();
            URL.revokeObjectURL(videoElement.src);
            videoElement.remove();

            console.log('[AudioProcessor] Audio extraction complete');
            return audioBlob;

        } catch (error) {
            console.error('[AudioProcessor] Audio extraction failed:', error);
            throw error;
        }
    }

    async mergeAudioWithSegment(enhancedSegment, originalSegment) {
        console.log('[AudioProcessor] Merging audio with enhanced segment');
        
        try {
            // Extract audio from original segment
            const audioBlob = await this.extractAudioFromSegment(originalSegment.data);
            
            // Create temporary elements
            const canvas = document.createElement('canvas');
            const videoElement = document.createElement('video');
            const audioElement = document.createElement('audio');

            // Set up enhanced video
            const videoBlob = new Blob([enhancedSegment.data], { type: 'video/mp4' });
            videoElement.src = URL.createObjectURL(videoBlob);
            videoElement.muted = true;  // Prevent audio doubling

            // Set up extracted audio
            audioElement.src = URL.createObjectURL(audioBlob);

            // Wait for both elements to load
            await Promise.all([
                new Promise(resolve => {
                    videoElement.onloadedmetadata = () => {
                        videoElement.oncanplay = resolve;
                    };
                }),
                new Promise(resolve => {
                    audioElement.onloadedmetadata = () => {
                        audioElement.oncanplay = resolve;
                    };
                })
            ]);

            // Set up canvas
            canvas.width = videoElement.videoWidth;
            canvas.height = videoElement.videoHeight;
            const ctx = canvas.getContext('2d', { alpha: false });

            // Create stream for recording
            const stream = canvas.captureStream();
            const audioContext = await this.initAudioContext();
            
            const source = audioContext.createMediaElementSource(audioElement);
            const destination = audioContext.createMediaStreamDestination();
            
            // Add small delay for sync
            const delayNode = audioContext.createDelay();
            delayNode.delayTime.value = 0.01;
            
            source.connect(delayNode);
            delayNode.connect(destination);
            
            // Add audio to stream
            stream.getAudioTracks().forEach(track => track.enabled = false);
            destination.stream.getAudioTracks().forEach(track => {
                stream.addTrack(track);
            });

            // Create and set up recorder
            const recorder = new MediaRecorder(stream, {
                mimeType: 'video/webm;codecs=vp8',
                videoBitsPerSecond: 8000000,
                audioBitsPerSecond: 128000
            });

            const chunks = [];
            recorder.ondataavailable = e => chunks.push(e.data);

            return new Promise((resolve, reject) => {
                recorder.start();

                // Start playback
                Promise.all([
                    videoElement.play(),
                    audioElement.play()
                ]).catch(reject);

                let lastDrawTime = 0;
                function drawFrame(timestamp) {
                    if (!videoElement.ended) {
                        const timeDiff = timestamp - lastDrawTime;
                        if (timeDiff >= (1000 / 60)) {  // 60fps
                            ctx.drawImage(videoElement, 0, 0);
                            lastDrawTime = timestamp;
                        }
                        requestAnimationFrame(drawFrame);
                    } else {
                        setTimeout(() => recorder.stop(), 100);
                    }
                }
                requestAnimationFrame(drawFrame);

                recorder.onstop = async () => {
                    try {
                        const finalBlob = new Blob(chunks, { type: 'video/webm' });
                        const arrayBuffer = await finalBlob.arrayBuffer();

                        // Create final segment
                        const mergedSegment = {
                            ...enhancedSegment,
                            data: arrayBuffer
                        };

                        // Cleanup
                        URL.revokeObjectURL(videoElement.src);
                        URL.revokeObjectURL(audioElement.src);
                        audioContext.close();

                        console.log('[AudioProcessor] Audio merge complete');
                        resolve(mergedSegment);
                    } catch (error) {
                        reject(error);
                    }
                };
            });

        } catch (error) {
            console.error('[AudioProcessor] Audio merge failed:', error);
            throw error;
        }
    }

    clearCache() {
        this.audioBufferCache.clear();
        if (this.audioContext) {
            this.audioContext.close();
            this.audioContext = null;
        }
    }
}

export default new AudioProcessor();