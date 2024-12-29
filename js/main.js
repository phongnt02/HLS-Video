import VideoPlayer from './player/VideoPlayer.js';

document.addEventListener('DOMContentLoaded', () => {
    const player = new VideoPlayer();
    player.initializePlayer();

    // Clean up on page unload
    window.addEventListener('beforeunload', () => {
        player.destroy();
    });
});