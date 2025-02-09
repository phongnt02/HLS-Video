import { PLAYER_CONFIG } from '../constants/player.js';
import BandwidthCalculator from './bandwidth-calculator.js';
import QualitySelector from './quality-selector.js';

class VideoMonitoring {
    constructor() {
        // Initialize bandwidth calculator with config
        this.bandwidthCalculator = new BandwidthCalculator({
            windowSize: 3000,
            minSamples: 3,
            ewmaFastAlpha: 0.3,
            ewmaSlowAlpha: 0.1,
            safetyFactor: PLAYER_CONFIG.bandwidthSafetyFactor || 0.7
        });

        // Initialize quality selector with config
        this.qualitySelector = new QualitySelector({
            minSwitchInterval: 5000,
            upSwitchThreshold: 1.5,
            downSwitchThreshold: 0.8,
            minBufferForUpswitch: 10,
            criticalBufferLevel: 5,
            maxConsecutiveSwitches: 2,
            stabilityPeriod: 30000,
            trendWindowSize: 5,
            trendThreshold: 0.1
        });

        this.metrics = {
            bandwidth: {
                current: 0,
                estimate: 0,
                effectiveRate: 0
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
                seekTime: 0,
                lastSeekStart: null,
            },
            quality: {
                switches: 0,
                currentQuality: null,
                switchHistory: [],
                selectorDebug: {}
            },
            errors: {
                count: 0,
                lastError: null,
                errorHistory: [],
            }
        };

        this.lastQualityCheck = Date.now();
    }

    // Updated bandwidth monitoring using BandwidthCalculator
    addBandwidthSample(downloadedBytes, durationMs, timestamp = Date.now()) {
        const estimate = this.bandwidthCalculator.addSample(downloadedBytes, durationMs, timestamp);
        const effectiveRate = this.bandwidthCalculator.getEffectiveBandwidth();
        
        this.metrics.bandwidth = {
            current: (downloadedBytes * 8) / (durationMs / 1000), // Current sample in bps
            estimate: estimate,
            effectiveRate: effectiveRate
        };

        return effectiveRate;
    }

    // Quality selection using the new QualitySelector
    calculateIdealLevel(levels, video) {
        const metrics = {
            effectiveBandwidth: this.bandwidthCalculator.getEffectiveBandwidth(),
            bufferLength: video.buffered.length ? 
                video.buffered.end(video.buffered.length - 1) - video.currentTime : 0,
            currentTime: video.currentTime,
            duration: video.duration
        };

        // Get debug info from quality selector
        this.metrics.quality.selectorDebug = this.qualitySelector.getDebugInfo();

        return this.qualitySelector.selectQuality(metrics, levels);
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

    // Quality change monitoring
    recordQualitySwitch(oldQuality, newQuality) {
        this.metrics.quality.switches++;
        this.metrics.quality.currentQuality = newQuality;
        this.metrics.quality.switchHistory.push({
            timestamp: Date.now(),
            from: oldQuality,
            to: newQuality
        });

        // Keep only recent switches
        if (this.metrics.quality.switchHistory.length > 10) {
            this.metrics.quality.switchHistory.shift();
        }
    }

    // Error monitoring
    recordError(error) {
        this.metrics.errors.count++;
        this.metrics.errors.lastError = error;
        this.metrics.errors.errorHistory.push({
            timestamp: Date.now(),
            error
        });

        // Keep only recent errors
        if (this.metrics.errors.errorHistory.length > 10) {
            this.metrics.errors.errorHistory.shift();
        }
    }

    shouldCheckQuality() {
        const now = Date.now();
        if (now - this.lastQualityCheck >= PLAYER_CONFIG.qualityCheckInterval) {
            this.lastQualityCheck = now;
            return true;
        }
        return false;
    }

    // Get formatted metrics for UI with enhanced debug info
    getFormattedMetrics() {
        const now = Date.now();
        return {
            bandwidth: {
                current: `${(this.metrics.bandwidth.current / 1000000).toFixed(2)} Mbps`,
                estimate: `${(this.metrics.bandwidth.estimate / 1000000).toFixed(2)} Mbps`,
                effective: `${(this.metrics.bandwidth.effectiveRate / 1000000).toFixed(2)} Mbps`
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
                    .map(s => `${s.from}p → ${s.to}p`),
                selectorInfo: {
                    trend: this.metrics.quality.selectorDebug.bandwidthTrend,
                    consecutiveSwitches: this.metrics.quality.selectorDebug.consecutiveSwitches,
                    lastDirection: this.metrics.quality.selectorDebug.lastSwitchDirection
                }
            },
            errors: {
                count: this.metrics.errors.count,
                recent: this.metrics.errors.errorHistory
                    .slice(-3)
                    .map(e => e.error.message || e.error)
            }
        };
    }

    // Reset all monitoring state
    reset() {
        this.bandwidthCalculator.reset();
        this.qualitySelector.reset();
        
        this.metrics = {
            bandwidth: {
                current: 0,
                estimate: 0,
                effectiveRate: 0
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
                switchHistory: [],
                selectorDebug: {}
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

export default new VideoMonitoring(); // Export singleton instance