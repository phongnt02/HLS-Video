# HLS Video Player with ABR
A modern HTTP Live Streaming (HLS) video player implementation with Adaptive Bitrate (ABR) capabilities. The system is designed with a layered architecture that provides efficient video streaming and automatic quality adaptation based on network conditions.

![image](https://github.com/user-attachments/assets/27c7aec5-b3de-4297-b333-ab5a4b3dd93b)

## Architecture Overview
The system is divided into four main layers:

### UI Layer: Handles all user interactions and visual updates
Implements video controls interface
Manages player state display
Renders performance metrics

### Core Layer

VideoPlayer: Central controller coordinating all components
EventHandler: Manages video and HLS events
Handles user interactions and system events
Controls quality switching decisions

### Service Layer

HLSService: Manages video streaming and quality control
VideoMonitoring: Monitors performance and collects metrics
Implements HLS.js integration
Provides real-time performance data

### Config Layer

PlayerConfig: Basic player settings and ABR parameters
HLSConfig: HLS.js specific configurations

## Key Features

Adaptive Bitrate Streaming (ABR)
Advanced player controls (play/pause, seek, volume, etc.)
Picture-in-Picture support
Performance monitoring dashboard
Error recovery mechanisms

## Getting Started

Clone the repository :

`git clone https://github.com/phongnt02/HLS-Video`

## Install dependencies
cd hls-video-player

Basic Usage

```html
<!-- Include required scripts -->
<script src="path/to/hls.js"></script>
<script type="module" src="js/main.js"></script>

<!-- Add video element to your HTML -->
<div class="player-container">
    <video id="video"></video>
    <!-- Controls will be injected by JavaScript -->
</div>
```

## Usage
Player Configuration
player.js

```javascript
export const PLAYER_CONFIG = {
    qualities: ['480p', '720p', '1080p'],
    bandwidthSafetyFactor: 0.8,
    movingAveragePeriod: 3,
    qualityCheckInterval: 1000
};
```

## HLS Configuration
hls-config.js

```javascript
export const HLS_CONFIG = {
    maxBufferLength: 10,
    enableWorker: true,
    lowLatencyMode: true
};
```

## Documentation
Detailed documentation about components and their interactions can be found in the docs directory:

Component Diagram
Technical Documentation
API Reference

## Acknowledgments

HLS.js for the core HLS functionality

ABR research papers for quality switching algorithms
