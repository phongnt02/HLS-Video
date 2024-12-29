import { PLAYER_CONFIG } from '../constants/player.js';
import { HLS_CONFIG } from '../constants/hls-config.js';
import Hls from 'hls.js';

class HlsService {
    constructor() {
        this.hls = null;
        this.levels = [];
    }

    async fetchAllPlaylists() {
        const playlistURLs = {};

        try {
            // Fetch all playlists for each quality
            for (const quality of PLAYER_CONFIG.qualities) {
                const response = await fetch(
                    `http://localhost:8080/api/v1/videos/${PLAYER_CONFIG.courseName}/${PLAYER_CONFIG.chapterName}/${PLAYER_CONFIG.lessonName}/${quality}/playlist`
                );

                if (!response.ok) {
                    throw new Error(`Failed to fetch ${quality} playlist: ${response.status}`);
                }

                playlistURLs[quality] = response.url;
            }

            // Create master playlist
            const masterPlaylist = this.createMasterPlaylist(playlistURLs);
            const blob = new Blob([masterPlaylist], { type: 'application/x-mpegURL' });
            return URL.createObjectURL(blob);
        } catch (error) {
            throw new Error(`Failed to fetch playlists: ${error.message}`);
        }
    }

    createMasterPlaylist(playlistURLs) {
        let masterContent = '#EXTM3U\n';
        masterContent += '#EXT-X-VERSION:3\n';

        // Add stream variants
        for (const [quality, url] of Object.entries(playlistURLs)) {
            const info = PLAYER_CONFIG.qualityInfo[quality];
            masterContent += `#EXT-X-STREAM-INF:BANDWIDTH=${info.bandwidth},RESOLUTION=${info.width}x${info.height}\n`;
            masterContent += `${url}\n`;
        }

        return masterContent;
    }

    initializeHls(video, eventHandlers) {
        if (!Hls.isSupported()) {
            throw new Error('HLS is not supported in your browser');
        }

        // Destroy existing HLS instance if it exists
        if (this.hls) {
            this.hls.destroy();
        }

        this.hls = new Hls(HLS_CONFIG);
        
        // Attach event handlers
        Object.entries(eventHandlers).forEach(([event, handler]) => {
            this.hls.on(event, handler);
        });

        return this.hls;
    }

    destroy() {
        if (this.hls) {
            this.hls.destroy();
            this.hls = null;
        }
    }

    setCurrentLevel(level) {
        if (this.hls) {
            this.hls.currentLevel = level;
        }
    }

    setNextLevel(level) {
        if (this.hls) {
            this.hls.nextLevel = level;
        }
    }

    getLevels() {
        return this.levels;
    }

    setLevels(levels) {
        this.levels = levels;
    }
}

export default new HlsService(); // Export singleton instance