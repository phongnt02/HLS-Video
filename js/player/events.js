import Hls from 'hls.js';
import hlsService from '../services/hls-service.js';
import videoMonitoring from '../utils/video-monitoring.js';
import { updateStatus, showError, showLoading } from './ui.js';

export function setupVideoEvents(video, updatePlayButton) {
    video.addEventListener('playing', () => {
        updateStatus('Playing');
        videoMonitoring.startPlayback();
    });
    
    video.addEventListener('pause', () => {
        updateStatus('Paused');
        videoMonitoring.pausePlayback();
    });
    
    video.addEventListener('waiting', () => {
        showLoading(true);
        videoMonitoring.startBuffering();
    });
    
    video.addEventListener('canplay', () => {
        showLoading(false);
        videoMonitoring.endBuffering();
    });
    
    video.addEventListener('seeking', () => {
        videoMonitoring.startSeeking();
        if (hlsService.hls && hlsService.hls.currentLevel === -1) {
            videoMonitoring.reset();
        }
    });
    
    video.addEventListener('seeked', () => {
        videoMonitoring.endSeeking();
    });
}

export function createHlsEventHandlers(qualitySelector, currentQuality) {
    return {
        [Hls.Events.MANIFEST_PARSED]: (event, data) => {
            showLoading(false);
            updateStatus('Video loaded');
            hlsService.setLevels(data.levels);
            updateQualityOptions(qualitySelector, data.levels);
        },

        [Hls.Events.LEVEL_SWITCHING]: (event, data) => {
            const newLevel = hlsService.getLevels()[data.level];
            updateStatus(`Switching to ${newLevel.height}p`);
        },

        [Hls.Events.LEVEL_SWITCHED]: (event, data) => {
            const currentLevel = hlsService.getLevels()[data.level];
            updateStatus(`Quality: ${currentLevel.height}p`);
            currentQuality = data.level;
            qualitySelector.value = data.level.toString();

            // Record quality switch in monitoring
            const oldLevel = hlsService.getLevels()[hlsService.hls.loadLevel];
            videoMonitoring.recordQualitySwitch(
                oldLevel ? oldLevel.height : 'auto',
                currentLevel ? currentLevel.height : 'auto'
            );
        },

        [Hls.Events.FRAG_LOAD_PROGRESS]: (event, data) => {
            if (data.stats) {
                const downloadDuration = data.stats.loading.end - data.stats.loading.start;
                if (downloadDuration > 0) {
                    const bandwidthBps = (data.stats.loaded * 8) / (downloadDuration / 1000);
                    videoMonitoring.addBandwidthSample(bandwidthBps);
                }
            }
        },

        [Hls.Events.FRAG_LOADED]: (event, data) => {
            const stats = data.frag.stats;
            const downloadDuration = stats.loading.end - stats.loading.start;
            if (downloadDuration > 0) {
                const bandwidthBps = (stats.loaded * 8) / (downloadDuration / 1000);
                videoMonitoring.addBandwidthSample(bandwidthBps);
            }
        },

        [Hls.Events.ERROR]: (event, data) => {
            if (data.fatal) {
                switch (data.type) {
                    case Hls.ErrorTypes.NETWORK_ERROR:
                        showError('Network error, trying to recover...');
                        hlsService.hls.startLoad();
                        break;
                    case Hls.ErrorTypes.MEDIA_ERROR:
                        showError('Media error, trying to recover...');
                        hlsService.hls.recoverMediaError();
                        break;
                    default:
                        showError('Fatal error, playback stopped');
                        hlsService.destroy();
                        break;
                }
                videoMonitoring.recordError(data.details);
            }
        }
    };
}

function updateQualityOptions(qualitySelector, levels) {
    // Clear all options except Auto
    while (qualitySelector.options.length > 1) {
        qualitySelector.remove(1);
    }

    // Add new quality levels
    levels.forEach((level, index) => {
        const option = document.createElement('option');
        option.value = index;
        option.text = `${level.height}p`;
        qualitySelector.add(option);
    });
}