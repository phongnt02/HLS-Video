// js/enhancement/utils.js

export function calculateSegmentBitrate(segment) {
    if (!segment?.data) return 0;
    const bitLength = segment.data.byteLength * 8;
    const duration = segment.duration;
    return Math.round(bitLength / duration);
}

export function logSegmentInfo(segment) {
    if (!segment) return;
    
    console.log('Segment Info:', {
        number: segment.sn,
        level: segment.level,
        duration: segment.duration?.toFixed(2),
        start: segment.start?.toFixed(2),
        bitrate: calculateSegmentBitrate(segment),
        size: segment.data ? (segment.data.byteLength / 1024).toFixed(2) + ' KB' : 'N/A'
    });
}

export function validateSegment(segment) {
    if (!segment) throw new Error('Invalid segment: segment is null');
    if (!segment.data) throw new Error('Invalid segment: no data');
    if (!segment.duration) throw new Error('Invalid segment: no duration');
    if (typeof segment.sn !== 'number') throw new Error('Invalid segment: no sequence number');
    return true;
}

export function createSegmentStatusMessage(segment, action) {
    return `${action} segment ${segment.sn} (${(segment.duration || 0).toFixed(2)}s at ${segment.start?.toFixed(2)}s)`;
}

export function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

export const EnhancementStatus = {
    IDLE: 'idle',
    PROCESSING: 'processing',
    COMPLETE: 'complete',
    ERROR: 'error'
};