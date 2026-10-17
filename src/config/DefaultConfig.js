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

    commandRateLimit: {
        min: 0,
        round: true
    },
    commandRateLimitWindow: {
        min: 0,
        round: true,
        mult: 1 / Util.durationSeconds.milli
    },

    minResponseTime: {
        min: 0,
        max: 10 / Util.durationSeconds.milli,
        round: true,
        mult: 1 / Util.durationSeconds.milli
    },
    globalTimeLimit: {
        min: 0,
        round: true,
        mult: 1 / Util.durationSeconds.milli
    },
    commandWaitTime: {
        base: 0,
        min: 0,
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
            min: 0,
            round: true,
            mult: 1 / Util.durationSeconds.milli
        },
        userConnectTimeout: {
            base: 0,
            min: 0,
            round: true,
            mult: 1 / Util.durationSeconds.milli
        },
        userActionTimeout: {
            base: 0,
            min: 0,
            round: true,
            mult: 1 / Util.durationSeconds.milli
        }
    },

    vmHttp: {
        maxUploadSize: {
            base: 0,
            min: 0,
            round: true,
            mult: Util.dataBytes.megabyte
        },
        maxDownloadSize: {
            base: 0,
            min: 0,
            round: true,
            mult: Util.dataBytes.megabyte
        },
        maxRequests: {
            base: 0,
            min: 0,
            round: true
        },
        rateLimitWindow: {
            base: 0,
            min: 0,
            round: true,
            mult: 1 / Util.durationSeconds.milli
        }
    },

    timeLimit: {
        min: 0,
        round: true,
        mult: 1 / Util.durationSeconds.milli
    },
    otherTimeLimit: {
        min: 0,
        round: true,
        mult: 1 / Util.durationSeconds.milli
    },

    reminderSendInterval: {
        min: 0,
        round: true,
        mult: 1 / Util.durationSeconds.milli
    }
});

export default DefaultConfig;
