import Util from "../util/Util.js";
import DiscordUtil from "../util/DiscordUtil.js";

const DefaultConfig = Object.freeze({
    outCharLimit: {
        min: 0,
        max: DiscordUtil.msgCharLimit
    },
    outLineLimit: {
        min: 0,
        max: DiscordUtil.msgCharLimit
    },

    embedCharLimit: {
        min: 0,
        max: DiscordUtil.embedCharLimit
    },
    embedLineLimit: {
        min: 0,
        max: DiscordUtil.embedCharLimit
    },
    errorCharLimit: {
        min: 0,
        max: DiscordUtil.embedCharLimit
    },
    maxFileSize: {
        base: 0,
        limit: true,
        round: true,
        mult: Util.dataBytes.megabyte
    },

    commandRateLimit: {
        limit: true,
        round: true
    },
    commandRateLimitWindow: {
        limit: true,
        round: true,
        mult: 1 / Util.durationSeconds.milli
    },

    minResponseTime: {
        limit: true,
        max: 10 / Util.durationSeconds.milli,
        round: true,
        mult: 1 / Util.durationSeconds.milli
    },
    globalTimeLimit: {
        limit: true,
        round: true,
        mult: 1 / Util.durationSeconds.milli
    },
    commandWaitTime: {
        base: 0,
        limit: true,
        round: true,
        mult: 1 / Util.durationSeconds.milli
    },
    interactionTimeout: {
        base: 1,
        min: 0,
        round: true,
        mult: 1 / Util.durationSeconds.milli
    },

    vmInspector: {
        connectTimeout: {
            base: 0,
            limit: true,
            round: true,
            mult: 1 / Util.durationSeconds.milli
        },
        userConnectTimeout: {
            base: 0,
            limit: true,
            round: true,
            mult: 1 / Util.durationSeconds.milli
        },
        userActionTimeout: {
            base: 0,
            limit: true,
            round: true,
            mult: 1 / Util.durationSeconds.milli
        }
    },

    vmHttp: {
        maxUploadSize: {
            base: 0,
            limit: true,
            round: true,
            mult: Util.dataBytes.megabyte
        },
        maxDownloadSize: {
            base: 0,
            limit: true,
            round: true,
            mult: Util.dataBytes.megabyte
        },
        maxRequests: {
            base: 0,
            limit: true,
            round: true
        },
        rateLimitWindow: {
            base: 0,
            limit: true,
            round: true,
            mult: 1 / Util.durationSeconds.milli
        }
    },

    timeLimit: {
        limit: true,
        round: true,
        mult: 1 / Util.durationSeconds.milli
    },
    otherTimeLimit: {
        limit: true,
        round: true,
        mult: 1 / Util.durationSeconds.milli
    },

    ai: {
        timeLimit: {
            limit: true,
            round: true,
            mult: 1 / Util.durationSeconds.milli
        },
        requestTimeout: {
            limit: true,
            round: true,
            mult: 1 / Util.durationSeconds.milli
        },
        modelCooldown: {
            limit: true,
            allowZero: true,
            round: true,
            mult: 1 / Util.durationSeconds.milli
        },
        maxModelCooldown: {
            limit: true,
            allowZero: true,
            round: true,
            mult: 1 / Util.durationSeconds.milli
        },
        maxDownloadSize: {
            limit: true,
            round: true,
            mult: Util.dataBytes.megabyte
        },
        rateLimitWindow: {
            limit: true,
            round: true,
            mult: 1 / Util.durationSeconds.milli
        }
    },

    reminderSendInterval: {
        limit: true,
        round: true,
        mult: 1 / Util.durationSeconds.milli
    }
});

export default DefaultConfig;
