import BaseConfigLoader from "./BaseConfigLoader.js";

import DefaultConfig from "../../config/DefaultConfig.js";

import Util from "../../util/Util.js";
import TypeTester from "../../util/TypeTester.js";

class ConfigLoader extends BaseConfigLoader {
    static formatContentGroup = "(?<content>)";
    static defaults = DefaultConfig;

    constructor(logger, options) {
        super("config", logger, options);
    }

    modify(config) {
        this._setBridgeBotConfig(config);
        this._setTagLimits(config);
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
                    this.logger?.warn(`No/invalid regex for bot "${id}".`);
                    botIds.splice(i, 1);
                }
            }

            enabled = !Util.empty(botIds);
        } else {
            const [exp, valid] = this._parseBridgeBotFormat(messageFormats);

            if (valid) {
                config.bridgeBotExp = exp;
            } else {
                this.logger?.warn("No/invalid bridge bot regex provided.");
                enabled = false;
            }
        }

        if (!enabled) {
            this.logger?.warn("Bridge bot support was disabled.");
        }

        config.useBridgeBot = enabled;
        return config;
    }

    _clampTagLimit(val, round = false) {
        if (typeof val !== "number" || Number.isNaN(val)) {
            return val;
        }

        if (round) {
            val = Math.round(val);
        }

        return Util.clamp(val, -1);
    }

    _setTagLimits(config = this.data) {
        if (TypeTester.isObject(config.maxTagSize)) {
            for (const [type, limit] of Object.entries(config.maxTagSize)) {
                config.maxTagSize[type] = this._clampTagLimit(limit);
            }
        }

        if (typeof config.maxQuota !== "undefined") {
            config.maxQuota = this._clampTagLimit(config.maxQuota);
        }

        if (typeof config.maxTagCount !== "undefined") {
            config.maxTagCount = this._clampTagLimit(config.maxTagCount, true);
        }

        return config;
    }
}

export default ConfigLoader;
