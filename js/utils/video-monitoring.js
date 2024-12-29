import { PLAYER_CONFIG } from '../constants/player.js';

class VideoMonitoring {
    constructor() {
        this.metrics = {
            bandwidth: {
                samples: [],
                current: 0,
                average: 0,
            },
            buffering: {
                count: 0,
                totalDuration: 0,
                lastBufferStart: null,
            },
            playback: {
                startTime: null,
                totalPlayTime: 0,
                pauseCount: 0,
                seekCount: 0,
                seekTime: 0, // Total time spent seeking
                lastSeekStart: null,
            },
            quality: {
                switches: 0,
                currentQuality: null,
                switchHistory: [],
            },
            errors: {
                count: 0,
                lastError: null,
                errorHistory: [],
            }
        };

        this.lastQualityCheck = Date.now();
    }

    // Bandwidth monitoring
    addBandwidthSample(bandwidthBps) {
        this.metrics.bandwidth.samples.push(bandwidthBps);
        if (this.metrics.bandwidth.samples.length > PLAYER_CONFIG.movingAveragePeriod) {
            this.metrics.bandwidth.samples.shift();
        }

        this.metrics.bandwidth.current = bandwidthBps;
        this.metrics.bandwidth.average = this.getAverageBandwidth();
        return this.metrics.bandwidth.average;
    }

    getAverageBandwidth() {
        if (this.metrics.bandwidth.samples.length === 0) return 0;
        return this.metrics.bandwidth.samples.reduce((a, b) => a + b, 0) / this.metrics.bandwidth.samples.length;
    }

    // Buffer monitoring
    startBuffering() {
        if (!this.metrics.buffering.lastBufferStart) {
            this.metrics.buffering.lastBufferStart = Date.now();
            this.metrics.buffering.count++;
        }
    }

    endBuffering() {
        if (this.metrics.buffering.lastBufferStart) {
            const duration = Date.now() - this.metrics.buffering.lastBufferStart;
            this.metrics.buffering.totalDuration += duration;
            this.metrics.buffering.lastBufferStart = null;
        }
    }

    // Playback monitoring
    startPlayback() {
        if (!this.metrics.playback.startTime) {
            this.metrics.playback.startTime = Date.now();
        }
    }

    pausePlayback() {
        this.metrics.playback.pauseCount++;
        this.updateTotalPlayTime();
    }

    updateTotalPlayTime() {
        if (this.metrics.playback.startTime) {
            this.metrics.playback.totalPlayTime = Date.now() - this.metrics.playback.startTime;
        }
    }

    // Seek monitoring
    startSeeking() {
        if (!this.metrics.playback.lastSeekStart) {
            this.metrics.playback.lastSeekStart = Date.now();
            this.metrics.playback.seekCount++;
        }
    }

    endSeeking() {
        if (this.metrics.playback.lastSeekStart) {
            const seekDuration = Date.now() - this.metrics.playback.lastSeekStart;
            this.metrics.playback.seekTime += seekDuration;
            this.metrics.playback.lastSeekStart = null;
        }
    }

    // Quality monitoring
    recordQualitySwitch(oldQuality, newQuality) {
        this.metrics.quality.switches++;
        this.metrics.quality.currentQuality = newQuality;
        this.metrics.quality.switchHistory.push({
            timestamp: Date.now(),
            from: oldQuality,
            to: newQuality
        });
    }

    // Error monitoring
    recordError(error) {
        this.metrics.errors.count++;
        this.metrics.errors.lastError = error;
        this.metrics.errors.errorHistory.push({
            timestamp: Date.now(),
            error
        });
    }

    // Helpers for ABR
    calculateIdealLevel(levels) {
        const averageBandwidth = this.getAverageBandwidth();
        let idealLevel = 0;

        for (let i = 0; i < levels.length; i++) {
            if (levels[i].bitrate < averageBandwidth * PLAYER_CONFIG.bandwidthSafetyFactor) {
                idealLevel = i;
            }
        }

        return idealLevel;
    }

    shouldCheckQuality() {
        const now = Date.now();
        if (now - this.lastQualityCheck >= PLAYER_CONFIG.qualityCheckInterval) {
            this.lastQualityCheck = now;
            return true;
        }
        return false;
    }

    // Get formatted metrics for UI
    getFormattedMetrics() {
        const now = Date.now();
        return {
            bandwidth: {
                current: `${(this.metrics.bandwidth.current / 1000000).toFixed(2)} Mbps`,
                average: `${(this.metrics.bandwidth.average / 1000000).toFixed(2)} Mbps`
            },
            buffering: {
                count: this.metrics.buffering.count,
                totalDuration: `${(this.metrics.buffering.totalDuration / 1000).toFixed(1)}s`
            },
            playback: {
                duration: `${(this.metrics.playback.totalPlayTime / 1000).toFixed(0)}s`,
                pauseCount: this.metrics.playback.pauseCount,
                seekCount: this.metrics.playback.seekCount,
                seekTime: `${(this.metrics.playback.seekTime / 1000).toFixed(1)}s`
            },
            quality: {
                switches: this.metrics.quality.switches,
                current: this.metrics.quality.currentQuality,
                recentSwitches: this.metrics.quality.switchHistory
                    .slice(-3)
                    .map(s => `${s.from}p → ${s.to}p`)
            },
            errors: {
                count: this.metrics.errors.count,
                recent: this.metrics.errors.errorHistory
                    .slice(-3)
                    .map(e => e.error.message)
            }
        };
    }

    reset() {
        this.metrics = {
            bandwidth: {
                samples: [],
                current: 0,
                average: 0
            },
            buffering: {
                count: 0,
                totalDuration: 0,
                lastBufferStart: null
            },
            playback: {
                startTime: null,
                totalPlayTime: 0,
                pauseCount: 0,
                seekCount: 0,
                seekTime: 0,
                lastSeekStart: null
            },
            quality: {
                switches: 0,
                currentQuality: null,
                switchHistory: []
            },
            errors: {
                count: 0,
                lastError: null,
                errorHistory: []
            }
        };
        this.lastQualityCheck = Date.now();
    }
}

export default new VideoMonitoring();