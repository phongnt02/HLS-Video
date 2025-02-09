class BandwidthCalculator {
    constructor(config) {
        // Configuration
        this.config = {
            windowSize: config.windowSize || 3000,     // Window size in ms
            minSamples: config.minSamples || 3,       // Minimum samples needed
            ewmaFastAlpha: config.ewmaFastAlpha || 0.3, // Fast EWMA coefficient
            ewmaSlowAlpha: config.ewmaSlowAlpha || 0.1, // Slow EWMA coefficient
            safetyFactor: config.safetyFactor || 0.7   // Safety factor for estimation
        };

        // State
        this.samples = [];
        this.ewmaFast = 0;  // Fast-moving average
        this.ewmaSlow = 0;  // Slow-moving average
        this.lastSampleTime = 0;
    }

    addSample(downloadedBytes, durationMs, timestamp = Date.now()) {
        // Convert to bits per second
        const bandwidthBps = (downloadedBytes * 8) / (durationMs / 1000);

        // Add sample with timestamp
        this.samples.push({
            bandwidth: bandwidthBps,
            timestamp: timestamp
        });

        // Remove old samples outside the window
        this.cleanupOldSamples(timestamp);

        // Update EWMA values
        if (this.ewmaFast === 0) {
            // Initialize if first sample
            this.ewmaFast = this.ewmaSlow = bandwidthBps;
        } else {
            // Update both EWMA values
            this.ewmaFast = this.calculateEWMA(
                bandwidthBps,
                this.ewmaFast,
                this.config.ewmaFastAlpha
            );
            this.ewmaSlow = this.calculateEWMA(
                bandwidthBps,
                this.ewmaSlow,
                this.config.ewmaSlowAlpha
            );
        }

        this.lastSampleTime = timestamp;
        return this.getCurrentEstimate();
    }

    calculateEWMA(newValue, oldValue, alpha) {
        return alpha * newValue + (1 - alpha) * oldValue;
    }

    cleanupOldSamples(currentTime) {
        const windowStart = currentTime - this.config.windowSize;
        this.samples = this.samples.filter(sample => 
            sample.timestamp >= windowStart
        );
    }

    getCurrentEstimate() {
        // Not enough samples
        if (this.samples.length < this.config.minSamples) {
            return 0;
        }

        // Use the lower of the two EWMA values for conservative estimation
        const baseEstimate = Math.min(this.ewmaFast, this.ewmaSlow);
        
        // Apply safety factor
        return baseEstimate * this.config.safetyFactor;
    }

    getEffectiveBandwidth() {
        const estimate = this.getCurrentEstimate();
        if (estimate === 0) return 0;

        // Calculate standard deviation of recent samples
        const recentBandwidths = this.samples.map(s => s.bandwidth);
        const stdDev = this.calculateStandardDeviation(recentBandwidths);
        const variability = stdDev / estimate;

        // Adjust safety factor based on variability
        let dynamicSafetyFactor = this.config.safetyFactor;
        if (variability > 0.2) {
            // Reduce safety factor when bandwidth is highly variable
            dynamicSafetyFactor *= (1 - Math.min(variability, 0.5));
        }

        return estimate * dynamicSafetyFactor;
    }

    calculateStandardDeviation(values) {
        const n = values.length;
        if (n < 2) return 0;

        const mean = values.reduce((a, b) => a + b) / n;
        const variance = values.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / (n - 1);
        return Math.sqrt(variance);
    }

    reset() {
        this.samples = [];
        this.ewmaFast = 0;
        this.ewmaSlow = 0;
        this.lastSampleTime = 0;
    }
}

export default BandwidthCalculator;