import hlsService from '../services/hls-service.js';
import videoMonitoring from '../utils/video-monitoring.js';
import { PLAYER_CONFIG } from '../constants/player.js';
import { setupVideoEvents, createHlsEventHandlers } from './events.js';
import { 
    initializeUI, 
    updateStatus, 
    showError, 
    showLoading, 
    updatePlayButton,
    updateMetricsDisplay,
    updateTimeDisplay,
    updateProgress,
    updateVolumeIcon,
    updateBufferProgress
} from './ui.js';

import videoEnhancement from '../enhancement/videoEnhancement.js';
import { setupEnhancementEvents } from '../enhancement/enhancementEvents.js';

class VideoPlayer {
    constructor() {
        this.video = document.getElementById('video');
        this.initializeElements();
        this.currentQuality = -1;
        
        initializeUI();
        this.setupEventListeners();

        // Add these properties
        this.enhancementController = null;
        this.autoEnhanceCheckbox = document.getElementById('auto-enhance');
        
        // Initialize enhancement UI
        this.initializeEnhancement();
    }

    initializeEnhancement() {
        // Initialize enhancement UI
        videoEnhancement.initialize(document.querySelector('.video-controls'));
        
        // Setup auto-enhance toggle
        if (this.autoEnhanceCheckbox) {
            this.autoEnhanceCheckbox.addEventListener('change', (e) => {
                if (this.enhancementController) {
                    this.enhancementController.setAutoEnhance(e.target.checked);
                }
            });
        }
    }

    initializeElements() {
        // Player controls
        this.playButton = document.getElementById('play-button');
        this.rewindButton = document.getElementById('rewind-button');
        this.forwardButton = document.getElementById('forward-button');
        this.muteButton = document.getElementById('mute-button');
        this.volumeSlider = document.querySelector('.volume-slider');
        this.progressBar = document.querySelector('.progress-bar');
        this.progress = document.querySelector('.progress');
        this.currentTimeElem = document.querySelector('.current-time');
        this.durationElem = document.querySelector('.duration');
        this.timeTooltip = document.querySelector('.time-tooltip');
        this.pipButton = document.getElementById('pip-button');
        this.fullscreenButton = document.getElementById('fullscreen-button');
        this.bufferBar = document.querySelector('.buffer-bar');

        // Monitoring controls
        this.qualitySelector = document.getElementById('quality-selector');
        this.toggleMetricsButton = document.getElementById('toggle-metrics');
    }

    setupEventListeners() {
        // Player controls events
        this.playButton.addEventListener('click', () => this.togglePlay());
        this.rewindButton.addEventListener('click', () => this.skip(-10));
        this.forwardButton.addEventListener('click', () => this.skip(10));
        this.muteButton.addEventListener('click', () => this.toggleMute());
        this.volumeSlider.addEventListener('input', (e) => this.changeVolume(e.target.value));
        this.progressBar.addEventListener('click', (e) => this.seek(e));
        this.progressBar.addEventListener('mousemove', (e) => this.updateTimeTooltip(e));
        this.progressBar.addEventListener('mouseout', () => this.timeTooltip.style.display = 'none');
        this.pipButton.addEventListener('click', () => this.togglePiP());
        this.fullscreenButton.addEventListener('click', () => this.toggleFullscreen());

        // Video events
        this.video.addEventListener('timeupdate', () => this.handleTimeUpdate());
        this.video.addEventListener('progress', () => this.handleProgress());
        this.video.addEventListener('loadedmetadata', () => this.handleLoadedMetadata());
        
        // Monitoring events
        this.qualitySelector.addEventListener('change', (e) => this.changeQuality(parseInt(e.target.value)));
        this.toggleMetricsButton?.addEventListener('click', () => this.toggleMetrics());
        
        // Setup other video events from events.js
        setupVideoEvents(this.video, (isPlaying) => updatePlayButton(this.playButton, isPlaying));

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => this.handleKeyboard(e));
    }

    async initializePlayer() {
        try {
            showLoading(true);
            const masterPlaylistUrl = await hlsService.fetchAllPlaylists();
            
            const hls = hlsService.initializeHls(
                this.video, 
                createHlsEventHandlers(this.qualitySelector, this.currentQuality)
            );

            // Set up enhancement events
            this.enhancementController = setupEnhancementEvents(hls, this.video);

            hls.loadSource(masterPlaylistUrl);
            hls.attachMedia(this.video);
            
            // Set up monitoring interval
            setInterval(() => {
                if (this.currentQuality === -1 && !this.video.paused && videoMonitoring.shouldCheckQuality()) {
                    this.evaluateQuality();
                }
                const metrics = videoMonitoring.getFormattedMetrics();
                updateMetricsDisplay(metrics);
            }, PLAYER_CONFIG.qualityCheckInterval);
            
            updateStatus('Ready to play');
        } catch (error) {
            showError(`Failed to initialize player: ${error.message}`);
        }
    }

    // Player Control Methods
    togglePlay() {
        if (this.video.paused) {
            this.video.play();
            updatePlayButton(this.playButton, true);
            videoMonitoring.startPlayback();
        } else {
            this.video.pause();
            updatePlayButton(this.playButton, false);
            videoMonitoring.pausePlayback();
        }
    }

    skip(seconds) {
        videoMonitoring.startSeeking();
        this.video.currentTime += seconds;
    }

    toggleMute() {
        this.video.muted = !this.video.muted;
        this.volumeSlider.value = this.video.muted ? 0 : (this.video.volume * 100);
        updateVolumeIcon(this.muteButton, this.video.muted, this.video.volume);
    }

    changeVolume(value) {
        const volume = value / 100;
        this.video.volume = volume;
        this.video.muted = volume === 0;
        updateVolumeIcon(this.muteButton, this.video.muted, volume);
    }

    seek(e) {
        videoMonitoring.startSeeking();
        const percent = (e.offsetX / this.progressBar.offsetWidth);
        this.video.currentTime = percent * this.video.duration;
    }

    updateTimeTooltip(e) {
        const percent = (e.offsetX / this.progressBar.offsetWidth);
        const time = percent * this.video.duration;
        this.timeTooltip.textContent = this.formatTime(time);
        this.timeTooltip.style.display = 'block';
        this.timeTooltip.style.left = `${e.offsetX}px`;
    }

    formatTime(time) {
        const hours = Math.floor(time / 3600);
        const minutes = Math.floor((time % 3600) / 60);
        const seconds = Math.floor(time % 60);
        if (hours > 0) {
            return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        }
        return `${minutes}:${seconds.toString().padStart(2, '0')}`;
    }

    async togglePiP() {
        try {
            if (document.pictureInPictureElement) {
                await document.exitPictureInPicture();
            } else if (document.pictureInPictureEnabled) {
                await this.video.requestPictureInPicture();
            }
        } catch (error) {
            console.error('PiP error:', error);
        }
    }

    toggleFullscreen() {
        if (document.fullscreenElement) {
            document.exitFullscreen();
            this.fullscreenButton.innerHTML = '<i class="fas fa-expand"></i>';
        } else {
            const playerContainer = this.video.closest('.player-container');
            if (playerContainer.requestFullscreen) {
                playerContainer.requestFullscreen();
                this.fullscreenButton.innerHTML = '<i class="fas fa-compress"></i>';
            }
        }
    }

    // Event Handlers
    handleTimeUpdate() {
        updateProgress(this.progress, this.video);
        updateTimeDisplay(this.currentTimeElem, this.durationElem, this.video);
    }

    handleProgress() {
        if (this.video.buffered.length > 0) {
            const bufferedEnd = this.video.buffered.end(this.video.buffered.length - 1);
            const duration = this.video.duration;
            const width = (bufferedEnd / duration) * 100;
            updateBufferProgress(this.bufferBar, width);
        }
    }

    handleLoadedMetadata() {
        updateTimeDisplay(this.currentTimeElem, this.durationElem, this.video);
    }

    handleKeyboard(e) {
        switch(e.key.toLowerCase()) {
            case ' ':
            case 'k':
                e.preventDefault();
                this.togglePlay();
                break;
            case 'arrowleft':
            case 'j':
                this.skip(-10);
                break;
            case 'arrowright':
            case 'l':
                this.skip(10);
                break;
            case 'm':
                this.toggleMute();
                break;
            case 'f':
                this.toggleFullscreen();
                break;
        }
    }

    // Quality Control Methods
    evaluateQuality() {
        const levels = hlsService.getLevels();
        if (!levels?.length) return;

        try {
            const idealLevel = videoMonitoring.calculateIdealLevel(levels, this.video);
            if (idealLevel === undefined || idealLevel === null) return;

            const currentLoadLevel = hlsService.hls.loadLevel;
            if (currentLoadLevel === idealLevel) return;

            const targetLevel = levels[idealLevel];
            if (!targetLevel) {
                console.warn('Invalid level index:', idealLevel);
                return;
            }

            hlsService.setNextLevel(idealLevel);
            const metrics = videoMonitoring.getFormattedMetrics();
            const qualityInfo = metrics.quality.selectorInfo;
            
            updateStatus(
                `Switching to ${targetLevel.height || 'unknown'}p ` +
                `(Bandwidth: ${metrics.bandwidth.effective}, ` +
                `Trend: ${qualityInfo.trend}, ` +
                `Buffer: ${this.video.buffered.length ? 
                    (this.video.buffered.end(this.video.buffered.length - 1) - 
                    this.video.currentTime).toFixed(1) : 0}s)`
            );
        } catch (error) {
            console.warn('Error evaluating quality:', error);
            videoMonitoring.recordError(error);
        }
    }

    changeQuality(levelIndex) {
        if (levelIndex === this.currentQuality) return;
        
        const levels = hlsService.getLevels();
        const oldQuality = this.currentQuality >= 0 ? levels[this.currentQuality]?.height : 'auto';
        
        if (levelIndex === -1) {
            hlsService.setCurrentLevel(-1);
            updateStatus('Auto quality (ABR) enabled');
        } else if (levelIndex >= 0 && levelIndex < levels.length) {
            hlsService.setCurrentLevel(levelIndex);
            updateStatus(`Switched to ${levels[levelIndex].height}p`);
        }
        
        this.currentQuality = levelIndex;
        const newQuality = levelIndex >= 0 ? levels[levelIndex]?.height : 'auto';
        videoMonitoring.recordQualitySwitch(oldQuality, newQuality);
        videoMonitoring.reset();
    }

    toggleMetrics() {
        const metricsPanel = document.querySelector('.metrics-panel');
        if (metricsPanel) {
            metricsPanel.classList.toggle('visible');
            this.toggleMetricsButton.innerHTML = metricsPanel.classList.contains('visible') ? 
                '<i class="fas fa-chart-line"></i> Hide Metrics' :
                '<i class="fas fa-chart-line"></i> Show Metrics';
        }
    }

    destroy() {
        hlsService.destroy();
        videoMonitoring.reset();
        videoEnhancement.reset();
        // Remove all event listeners
        if (this.autoEnhanceCheckbox) {
            this.autoEnhanceCheckbox.removeEventListener('change');
        }
        document.removeEventListener('keydown', this.handleKeyboard);
        clearInterval(this.qualityCheckInterval);
    }
}

export default VideoPlayer;