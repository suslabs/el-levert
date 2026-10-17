const DefaultConfig = Object.freeze({
    maxMinResponseTime: 10,
    commandWaitTime: 0,
    interactionTimeout: 1,
    vmInspector: {
        connectTimeout: 0,
        userConnectTimeout: 0,
        userActionTimeout: 0
    },
    vmHttp: {
        maxUploadSize: 50,
        maxDownloadSize: 50,
        maxRequests: 20,
        rateLimitWindow: 1,
        allowLocalhostRequests: false,
        allowFilesystemRequests: false
    }
});

export default DefaultConfig;
