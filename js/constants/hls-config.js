export const HLS_CONFIG = {
    debug: false,
    autoStartLoad: true,
    startLevel: -1, // Start with ABR
    
    // Buffer configuration
    maxBufferSize: 0,
    maxBufferLength: 10,
    maxMaxBufferLength: 10,
    highBufferWatchdogPeriod: 2,
    
    // ABR optimization
    abrEwmaFastLive: 3,
    abrEwmaSlowLive: 9,
    abrBandWidthFactor: 0.95,
    abrMaxWithRealBitrate: true,
    
    // Retry and timeout configuration
    manifestLoadingTimeOut: 10000,
    manifestLoadingMaxRetry: 4,
    manifestLoadingRetryDelay: 500,
    levelLoadingTimeOut: 10000,
    levelLoadingMaxRetry: 4,
    levelLoadingRetryDelay: 500,
    
    // Fragment loading configuration
    fragLoadingTimeOut: 20000,
    fragLoadingMaxRetry: 6,
    fragLoadingRetryDelay: 500,
    fragLoadingMaxRetryTimeout: 64000,
    
    // Latency configuration
    enableWorker: true,
    lowLatencyMode: true,
    backBufferLength: 30,
};