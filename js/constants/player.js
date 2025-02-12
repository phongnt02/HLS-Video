export const PLAYER_CONFIG = {
    courseName: 'learning',
    chapterName: 'ost',
    lessonName: 'test',
    codec: 'h264', // Codec default
    qualities: ['360p', '480p', '720p', '1080p'],
    qualityInfo: {
        '360p': { bandwidth: 1000000, width: 640, height: 360 },
        '480p': { bandwidth: 2000000, width: 854, height: 480 },
        '720p': { bandwidth: 4000000, width: 1280, height: 720 },
        '1080p': { bandwidth: 8000000, width: 1920, height: 1080 }
    },
    movingAveragePeriod: 3,
    qualityCheckInterval: 1000,
    bandwidthSafetyFactor: 0.8 // Use 80% of available bandwidth
};