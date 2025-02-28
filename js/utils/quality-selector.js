class QualitySelector {
    constructor(config = {}) {
        this.config = {
            // Minimum time between quality switches (ms)
            minSwitchInterval: config.minSwitchInterval || 5000,
            
            // Thresholds for switching up/down
            upSwitchThreshold: config.upSwitchThreshold || 1.5,  // Need 1.5x bandwidth for up-switch
            downSwitchThreshold: config.downSwitchThreshold || 0.8,  // Switch down at 80% bandwidth
            
            // Buffer thresholds (seconds)
            minBufferForUpswitch: config.minBufferForUpswitch || 10,
            criticalBufferLevel: config.criticalBufferLevel || 5,
            
            // Stability settings
            maxConsecutiveSwitches: config.maxConsecutiveSwitches || 2,
            stabilityPeriod: config.stabilityPeriod || 30000, // 30 seconds
            
            // Trend analysis
            trendWindowSize: config.trendWindowSize || 5,  // Number of samples for trend
            trendThreshold: config.trendThreshold || 0.1   // 10% change indicates trend
        };

        this.state = {
            lastSwitchTime: 0,
            currentLevel: -1,
            consecutiveSwitches: 0,
            lastSwitchDirection: null, // 'up' or 'down'
            stabilityEndTime: 0,
            recentBandwidthTrend: [], // Store recent bandwidth measurements
            switchHistory: []
        };
    }

    selectQuality(metrics, levels) {
        if (!Array.isArray(levels) || levels.length === 0) {
            return this.state.currentLevel;
        }

        const now = Date.now();
        
        // Get current playback metrics
        const {
            effectiveBandwidth,
            bufferLength,
            currentTime,
            duration
        } = metrics;

        // Check if we're in a stability period
        if (now < this.state.stabilityEndTime) {
            return this.state.currentLevel;
        }

        // Update bandwidth trend
        this.updateBandwidthTrend(effectiveBandwidth);

        // Don't switch if we recently switched
        if (now - this.state.lastSwitchTime < this.config.minSwitchInterval) {
            return this.state.currentLevel;
        }

        // Get ideal level based on current conditions
        const idealLevel = this.calculateIdealLevel(levels, metrics);
        if (idealLevel === undefined || idealLevel === null) {
            return this.state.currentLevel;
        }

        // If no change needed, maintain current level
        if (idealLevel === this.state.currentLevel) {
            return this.state.currentLevel;
        }

        // Determine if this is an up-switch or down-switch
        const isUpSwitch = idealLevel > this.state.currentLevel;

        // Get target level
        const targetLevel = levels[idealLevel];
        if (!targetLevel) {
            return this.state.currentLevel;
        }

        // Apply additional checks for up-switching
        if (isUpSwitch) {
            if (!this.canUpSwitch(metrics, targetLevel)) {
                return this.state.currentLevel;
            }
        } else {
            // For down-switching, be more aggressive if buffer is critical
            if (!this.shouldDownSwitch(metrics, targetLevel)) {
                return this.state.currentLevel;
            }
        }

        // Check for too many consecutive switches
        if (this.state.lastSwitchDirection === (isUpSwitch ? 'up' : 'down')) {
            this.state.consecutiveSwitches++;
            if (this.state.consecutiveSwitches >= this.config.maxConsecutiveSwitches) {
                // Enter stability period
                this.state.stabilityEndTime = now + this.config.stabilityPeriod;
                this.state.consecutiveSwitches = 0;
                return this.state.currentLevel;
            }
        } else {
            this.state.consecutiveSwitches = 1;
        }

        // Update state for the switch
        this.recordQualitySwitch(this.state.currentLevel, idealLevel, now);
        
        return idealLevel;
    }

    calculateIdealLevel(levels, metrics) {
        if (!Array.isArray(levels) || levels.length === 0) {
            return 0;
        }

        const {effectiveBandwidth, bufferLength, currentTime, duration} = metrics;
        
        // Find all levels that we have enough bandwidth for
        const suitableLevels = levels.filter(level => 
            level && typeof level.bitrate === 'number' &&
            level.bitrate <= effectiveBandwidth * this.getBandwidthMultiplier(metrics)
        );

        if (suitableLevels.length === 0) {
            return 0; // Return lowest quality if no suitable levels
        }

        // Consider playback position
        const remainingDuration = duration - currentTime;
        if (remainingDuration < 30) {
            // Be conservative near the end to avoid stalls
            return Math.min(
                suitableLevels[0].level || 0,
                (this.state.currentLevel + 1)
            );
        }

        // Get the highest suitable level
        const highestSuitable = suitableLevels[suitableLevels.length - 1];
        return highestSuitable.level || 0;
    }

    getBandwidthMultiplier(metrics) {
        const {bufferLength} = metrics;
        
        // Be more conservative with low buffer
        if (bufferLength < this.config.criticalBufferLevel) {
            return this.config.downSwitchThreshold;
        }
        
        // Be more aggressive with high buffer
        if (bufferLength > this.config.minBufferForUpswitch) {
            return this.config.upSwitchThreshold;
        }
        
        // Default multiplier
        return 1.0;
    }

    canUpSwitch(metrics, targetLevel) {
        if (!targetLevel || typeof targetLevel.bitrate !== 'number') {
            return false;
        }

        const {bufferLength, effectiveBandwidth} = metrics;

        // Basic bandwidth check with higher threshold for up-switching
        if (targetLevel.bitrate > effectiveBandwidth * this.config.upSwitchThreshold) {
            return false;
        }

        // Need higher buffer level for up-switching
        if (bufferLength < this.config.minBufferForUpswitch) {
            return false;
        }

        // Check bandwidth trend
        const trend = this.analyzeBandwidthTrend();
        if (trend === 'decreasing') {
            return false;
        }

        return true;
    }

    shouldDownSwitch(metrics, targetLevel) {
        if (!targetLevel || typeof targetLevel.bitrate !== 'number') {
            return false;
        }

        const {bufferLength, effectiveBandwidth} = metrics;

        // Immediate down-switch if buffer is critical
        if (bufferLength < this.config.criticalBufferLevel) {
            return true;
        }

        // Check if we're significantly below current level's bandwidth requirement
        if (targetLevel.bitrate > effectiveBandwidth * this.config.downSwitchThreshold) {
            return true;
        }

        // Check bandwidth trend
        const trend = this.analyzeBandwidthTrend();
        if (trend === 'decreasing') {
            return true;
        }

        return false;
    }

    updateBandwidthTrend(bandwidth) {
        this.state.recentBandwidthTrend.push(bandwidth);
        if (this.state.recentBandwidthTrend.length > this.config.trendWindowSize) {
            this.state.recentBandwidthTrend.shift();
        }
    }

    analyzeBandwidthTrend() {
        if (this.state.recentBandwidthTrend.length < this.config.trendWindowSize) {
            return 'stable';
        }

        const first = this.state.recentBandwidthTrend[0];
        const last = this.state.recentBandwidthTrend[this.state.recentBandwidthTrend.length - 1];
        const change = (last - first) / first;

        if (change > this.config.trendThreshold) {
            return 'increasing';
        } else if (change < -this.config.trendThreshold) {
            return 'decreasing';
        }
        return 'stable';
    }

    recordQualitySwitch(oldLevel, newLevel, timestamp) {
        this.state.lastSwitchTime = timestamp;
        this.state.currentLevel = newLevel;
        this.state.lastSwitchDirection = newLevel > oldLevel ? 'up' : 'down';
        
        this.state.switchHistory.push({
            timestamp,
            from: oldLevel,
            to: newLevel,
            direction: this.state.lastSwitchDirection
        });

        // Keep only recent history
        if (this.state.switchHistory.length > 10) {
            this.state.switchHistory.shift();
        }
    }

    reset() {
        this.state = {
            lastSwitchTime: 0,
            currentLevel: -1,
            consecutiveSwitches: 0,
            lastSwitchDirection: null,
            stabilityEndTime: 0,
            recentBandwidthTrend: [],
            switchHistory: []
        };
    }

    getDebugInfo() {
        return {
            currentLevel: this.state.currentLevel,
            consecutiveSwitches: this.state.consecutiveSwitches,
            lastSwitchDirection: this.state.lastSwitchDirection,
            bandwidthTrend: this.analyzeBandwidthTrend(),
            switchHistory: this.state.switchHistory
        };
    }
}

export default QualitySelector;