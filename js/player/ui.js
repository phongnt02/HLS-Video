let statusElement;
let errorElement;
let loadingElement;
let metricsPanel;

export function initializeUI() {
    statusElement = document.getElementById('status');
    errorElement = document.getElementById('error-message');
    loadingElement = document.querySelector('.loading');
    metricsPanel = document.querySelector('.metrics-panel');
}

export function updateStatus(message) {
    if (statusElement) {
        statusElement.textContent = message;
    }
}

export function showError(message) {
    if (errorElement) {
        errorElement.textContent = message;
        errorElement.style.display = 'block';
        setTimeout(() => {
            errorElement.style.display = 'none';
        }, 5000);
    }
}

export function showLoading(show) {
    if (loadingElement) {
        loadingElement.style.display = show ? 'block' : 'none';
    }
}

export function updatePlayButton(button, isPlaying) {
    if (button) {
        button.innerHTML = isPlaying ? 
            '<i class="fas fa-pause"></i>' :
            '<i class="fas fa-play"></i>';
        button.title = isPlaying ? 'Pause (k)' : 'Play (k)';
    }
}

export function updateVolumeIcon(button, isMuted, volume) {
    if (button) {
        let icon;
        if (isMuted || volume === 0) {
            icon = 'fa-volume-mute';
        } else if (volume < 0.5) {
            icon = 'fa-volume-down';
        } else {
            icon = 'fa-volume-up';
        }
        button.innerHTML = `<i class="fas ${icon}"></i>`;
        button.title = isMuted ? 'Unmute (m)' : 'Mute (m)';
    }
}

export function updateProgress(progressElement, video) {
    if (progressElement && !isNaN(video.duration)) {
        const progress = (video.currentTime / video.duration) * 100;
        progressElement.style.width = progress + '%';
    }
}

export function updateBufferProgress(bufferElement, width) {
    if (bufferElement) {
        bufferElement.style.width = width + '%';
    }
}

export function updateTimeDisplay(currentTimeElem, durationElem, video) {
    if (currentTimeElem && durationElem && !isNaN(video.duration)) {
        currentTimeElem.textContent = formatTime(video.currentTime);
        durationElem.textContent = formatTime(video.duration);
    }
}

function formatTime(time) {
    const hours = Math.floor(time / 3600);
    const minutes = Math.floor((time % 3600) / 60);
    const seconds = Math.floor(time % 60);
    if (hours > 0) {
        return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

export function updateMetricsDisplay(metrics) {
    if (!metricsPanel) return;

    const switchesHtml = metrics.quality.recentSwitches.map(switchText => `
        <div class="metric-subvalue">
            <span>Switch:</span>
            <span>${switchText}</span>
        </div>
    `).join('');

    const errorsHtml = metrics.errors.count > 0 ? `
        <div class="metric-card">
            <h3>Errors</h3>
            <div class="metric-value">${metrics.errors.count} errors</div>
            ${metrics.errors.recent.map(error => `
                <div class="metric-subvalue">
                    <span>Error:</span>
                    <span>${error}</span>
                </div>
            `).join('')}
        </div>
    ` : '';

    metricsPanel.innerHTML = `
        <div class="metrics-grid">
            <div class="metric-card">
                <h3>Bandwidth</h3>
                <div class="metric-value">${metrics.bandwidth.current}</div>
                <div class="metric-subvalue">
                    <span>Average:</span>
                    <span>${metrics.bandwidth.average}</span>
                </div>
            </div>
            
            <div class="metric-card">
                <h3>Buffering</h3>
                <div class="metric-value">${metrics.buffering.count} events</div>
                <div class="metric-subvalue">
                    <span>Total Duration:</span>
                    <span>${metrics.buffering.totalDuration}</span>
                </div>
            </div>
            
            <div class="metric-card">
                <h3>Playback</h3>
                <div class="metric-value">${metrics.playback.duration}</div>
                <div class="metric-subvalue">
                    <span>Pauses:</span>
                    <span>${metrics.playback.pauseCount}</span>
                </div>
                <div class="metric-subvalue">
                    <span>Seeks:</span>
                    <span>${metrics.playback.seekCount} (${metrics.playback.seekTime})</span>
                </div>
            </div>
            
            <div class="metric-card">
                <h3>Quality Changes</h3>
                <div class="metric-value">${metrics.quality.switches} switches</div>
                <div class="metric-subvalue">
                    <span>Current:</span>
                    <span>${metrics.quality.current || 'Auto'}</span>
                </div>
                ${switchesHtml}
            </div>
            
            ${errorsHtml}
        </div>
    `;
}