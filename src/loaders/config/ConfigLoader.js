import BaseConfigLoader from "./BaseConfigLoader.js";

import Util from "../../util/Util.js";
import DiscordUtil from "../../util/DiscordUtil.js";
import TypeTester from "../../util/TypeTester.js";

class ConfigLoader extends BaseConfigLoader {
    static formatContentGroup = "(?<content>)";

    constructor(logger, options) {
        super("config", logger, options);
    }

    modify(config) {
        config.outCharLimit = Util.clamp(config.outCharLimit, 0, DiscordUtil.msgCharLimit);
        config.outLineLimit = Util.clamp(config.outLineLimit, 0, DiscordUtil.msgCharLimit);

        config.embedCharLimit = Util.clamp(config.embedCharLimit, 0, DiscordUtil.embedCharLimit);
        config.embedLineLimit = Util.clamp(config.embedLineLimit, 0, DiscordUtil.embedCharLimit);

        config.minResponseTime = Util.clamp(
            Math.round(config.minResponseTime / Util.durationSeconds.milli),
            null,
            10 / Util.durationSeconds.milli
        );
        config.globalTimeLimit = Math.round(config.globalTimeLimit / Util.durationSeconds.milli);
        config.commandWaitTime = Math.round((config.commandWaitTime ?? 0) / Util.durationSeconds.milli);

        config.timeLimit = Math.round(config.timeLimit / Util.durationSeconds.milli);
        config.otherTimeLimit = Math.round(config.otherTimeLimit / Util.durationSeconds.milli);

        config.reminderSendInterval = Math.round(config.reminderSendInterval / Util.durationSeconds.milli);

        this._setBridgeBotConfig(config);
    }

    _parseBridgeBotFormat(format) {
        if (typeof format === "string") {
            format = [format];
        } else if (!Array.isArray(format)) {
            return [null, false];
        }

        format = format.filter(exp => !Util.empty(exp) && exp.includes(ConfigLoader.formatContentGroup));

        if (Util.empty(format)) {
            return [null, false];
        }

        let expText = `(${format.join(")|(")})`;

        let i = 1;
        expText = expText.replaceAll(ConfigLoader.formatContentGroup, _ => `(?<content${i++}>)`);

        try {
            const exp = new RegExp(expText);
            return [exp, true];
        } catch (err) {
            return [null, false];
        }
    }

    _setBridgeBotConfig(config = this.data) {
        delete config.bridgeBotExp;
        delete config.bridgeBotExps;

        let botIds = config.bridgeBotIds,
            messageFormats = config.bridgeBotMessageFormats ?? config.bridgeBotMessageFormat;

        let enabled = !Util.empty(botIds);

        if (!enabled) {
            config.useBridgeBot = false;
            config.individualBridgeBotFormats = false;
            return config;
        }

        const individual = TypeTester.isObject(messageFormats) && !Array.isArray(messageFormats);
        config.individualBridgeBotFormats = individual;

        if (individual) {
            config.bridgeBotExps = new Map();

            for (let i = botIds.length - 1; i >= 0; i--) {
                const id = botIds[i],
                    format = messageFormats[id];

                const [exp, valid] = this._parseBridgeBotFormat(format);

                if (valid) {
                    config.bridgeBotExps.set(id, exp);
                } else {
                    this.logger?.warn?.(`No/invalid regex for bot "${id}".`);
                    botIds.splice(i, 1);
                }
            }

            enabled = !Util.empty(botIds);
        } else {
            const [exp, valid] = this._parseBridgeBotFormat(messageFormats);

            if (valid) {
                config.bridgeBotExp = exp;
            } else {
                this.logger?.warn?.("No/invalid bridge bot regex provided.");
                enabled = false;
            }
        }

        if (!enabled) {
            this.logger?.warn?.("Bridge bot support was disabled.");
        }

        config.useBridgeBot = enabled;
        return config;
    }
}

export default ConfigLoader;
