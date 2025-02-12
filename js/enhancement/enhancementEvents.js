import Hls from 'hls.js';
import videoEnhancement from './videoEnhancement.js';
import { updateStatus, showError, updatePlayButton } from '../player/ui.js';

export function setupEnhancementEvents(hls, video) {
    let currentSegment = null;
    let isWaitingForEnhancement = false;
    let autoEnhanceEnabled = false;
    let enhanceButtonActive = false;

    // Monitor quality level changes
    hls.on('hlsLevelSwitching', (event, data) => {
        const newLevel = hls.levels[data.level];
        console.log('[EnhancementEvents] Quality level switching:', {
            level: data.level,
            height: newLevel?.height
        });

        if (newLevel && newLevel.height === 360) {
            console.log('[EnhancementEvents] Switching to 360p - Enabling enhancement');
            videoEnhancement.enableEnhancement(true);
        } else {
            console.log('[EnhancementEvents] Switching to higher quality - Disabling enhancement');
            videoEnhancement.enableEnhancement(false);
            isWaitingForEnhancement = false;
            enhanceButtonActive = false;
        }
    });

    // Monitor fragment loading
    hls.on('hlsFragLoading', (event, data) => {
        const currentLevel = hls.levels[hls.currentLevel];
        if (currentLevel && currentLevel.height === 360) {
            // Don't set currentSegment here yet, wait for data
            console.log('[EnhancementEvents] Loading 360p segment:', {
                segmentNumber: data.frag.sn,
                duration: data.frag.duration,
                start: data.frag.start
            });
        }
    });

    // Monitor fragment loaded to store current segment
    hls.on('hlsFragLoaded', (event, data) => {
        const currentLevel = hls.levels[hls.currentLevel];
        if (currentLevel && currentLevel.height === 360) {
            // Create a copy of the fragment with its data
            currentSegment = {
                ...data.frag,
                data: data.payload
            };

            console.log('[EnhancementEvents] Loaded 360p segment:', {
                segmentNumber: currentSegment.sn,
                duration: currentSegment.duration,
                start: currentSegment.start,
                hasData: !!currentSegment.data,
                dataSize: currentSegment.data ? currentSegment.data.byteLength : 0
            });

            // Tự động enhance nếu nút enhance đang bật
            if (enhanceButtonActive && !videoEnhancement.isCurrentlyEnhancing()) {
                videoEnhancement.callback();
            }
        } else {
            currentSegment = null;
        }
    });

    // Enhancement callback
    videoEnhancement.setEnhanceCallback(async () => {
        if (!currentSegment || videoEnhancement.isCurrentlyEnhancing()) {
            console.log('[EnhancementEvents] Enhancement callback blocked:', {
                hasCurrentSegment: !!currentSegment,
                isEnhancing: videoEnhancement.isCurrentlyEnhancing()
            });
            return;
        }

        // Set button state to active when enhancement starts
        enhanceButtonActive = true;

        console.log('[EnhancementEvents] Starting enhancement process');
        console.log('Current video state:', {
            currentTime: video.currentTime,
            isPaused: video.paused,
            segment: {
                number: currentSegment.sn,
                start: currentSegment.start,
                duration: currentSegment.duration
            }
        });

        const currentTime = video.currentTime;
        video.pause();
        // Update play button UI when paused
        const playButton = document.getElementById('play-button');
        updatePlayButton(playButton, false);

        console.log('[EnhancementEvents] Video paused for enhancement at:', currentTime);

        try {
            await enhanceCurrentSegment();

            if (!videoEnhancement.isCurrentlyEnhancing()) {
                console.log('[EnhancementEvents] Enhancement complete, resuming playback');
                video.currentTime = currentTime;
                video.play();
                // Update play button UI when playing
                updatePlayButton(playButton, true);

                // Reset enhance button state sau khi enhance xong
                enhanceButtonActive = false;
            }
        } catch (error) {
            console.error('[EnhancementEvents] Enhancement failed:', error);
            showError('Enhancement failed. Playing original quality.');
            video.play();
            // Update play button UI when error
            updatePlayButton(playButton, true);
            enhanceButtonActive = false; // Disable enhancement on error
        }
    });

    // Trong enhancementEvents.js
    async function enhanceCurrentSegment() {
        if (!currentSegment || videoEnhancement.isCurrentlyEnhancing()) {
            console.log('[EnhancementEvents] Enhancement skipped:', {
                hasCurrentSegment: !!currentSegment,
                isEnhancing: videoEnhancement.isCurrentlyEnhancing()
            });
            return;
        }
    
        isWaitingForEnhancement = true;
        updateStatus('Enhancing video segment...');
        console.log('[EnhancementEvents] Starting enhancement for segment:', currentSegment.sn);
    
        try {
            const segmentToEnhance = { ...currentSegment };
            const enhancedSegment = await videoEnhancement.enhanceSegment(segmentToEnhance);
            
            if (enhancedSegment) {
                console.log('[EnhancementEvents] Enhancement successful');
                updateStatus('Enhancement complete');
                
                if (currentSegment.sn === enhancedSegment.sn) {
                    console.log('[EnhancementEvents] Applying enhanced segment');
                    
                    try {
                        await new Promise((resolve, reject) => {
                            const segmentStart = currentSegment.start;
                            const segmentEnd = currentSegment.start + currentSegment.duration;
        
                            // Flush buffer 
                            hls.trigger(Hls.Events.BUFFER_FLUSHING, {
                                startOffset: segmentStart,
                                endOffset: segmentEnd,
                                type: 'video'
                            });
        
                            hls.once(Hls.Events.BUFFER_FLUSHED, () => {
                                console.log('[EnhancementEvents] Buffer flushed, appending enhanced segment');
        
                                // Create fragment data
                                const fragData = new Uint8Array(enhancedSegment.data);
        
                                // Append enhanced segment
                                hls.trigger(Hls.Events.BUFFER_APPENDING, {
                                    type: 'video',
                                    data: fragData,
                                    frag: currentSegment,
                                    chunkMeta: null
                                });
        
                                // Wait for append complete
                                hls.once(Hls.Events.BUFFER_APPENDED, () => {
                                    console.log('[EnhancementEvents] Enhanced segment appended successfully');
                                    resolve();
                                });
                            });
                        });
                    } catch (error) {
                        console.error('[EnhancementEvents] Failed to apply enhanced segment:', error);
                        throw error; 
                    }
                }
            }
        } catch (error) {
            console.error('[EnhancementEvents] Enhancement failed:', error);
            showError('Enhancement failed. Playing original quality.');
            isWaitingForEnhancement = false;
            throw error;
        }
    }

    // Thêm method để tắt enhancement từ bên ngoài
    const disableEnhancement = () => {
        enhanceButtonActive = false;
        isWaitingForEnhancement = false;
    };

    return {
        setAutoEnhance: (enable) => {
            console.log('[EnhancementEvents] Auto-enhance mode:', enable ? 'enabled' : 'disabled');
            autoEnhanceEnabled = enable;
        },
        disableEnhancement // Export method để có thể tắt enhancement
    };
}