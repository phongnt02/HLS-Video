export const PLAYER_CONFIG = {
    courseName: 'courses_h264',
    chapterName: 'chapters',
    lessonName: 'lessons',
    qualities: ['480p', '720p', '1080p'],
    qualityInfo: {
        '480p': { bandwidth: 2000000, width: 854, height: 480 },
        '720p': { bandwidth: 4000000, width: 1280, height: 720 },
        '1080p': { bandwidth: 8000000, width: 1920, height: 1080 }
    },
    movingAveragePeriod: 3,
    qualityCheckInterval: 1000,
    bandwidthSafetyFactor: 0.8 // Use 80% of available bandwidth
};