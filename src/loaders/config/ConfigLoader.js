import BaseConfigLoader from "./BaseConfigLoader.js";

import Util from "../../util/Util.js";
import DiscordUtil from "../../util/DiscordUtil.js";

class ConfigLoader extends BaseConfigLoader {
    constructor(logger, options) {
        super("config", logger, options);
    }

    modify(config) {
        config.outCharLimit = Util.clamp(config.outCharLimit, 0, DiscordUtil.msgCharLimit);
        config.outLineLimit = Util.clamp(config.outLineLimit, 0, DiscordUtil.msgCharLimit);

        config.embedCharLimit = Util.clamp(config.embedCharLimit, 0, DiscordUtil.embedCharLimit);
        config.embedLineLimit = Util.clamp(config.embedLineLimit, 0, DiscordUtil.embedCharLimit);

        config.minResponseTime = Util.clamp(
            config.minResponseTime / Util.durationSeconds.milli,
            -1,
            10 / Util.durationSeconds.milli
        );

        config.timeLimit = Math.floor(config.timeLimit / Util.durationSeconds.milli);
        config.otherTimeLimit = Math.floor(config.timeLimit / Util.durationSeconds.milli);

        config.reminderSendInterval = Math.floor(config.reminderSendInterval / Util.durationSeconds.milli);
    }
}

export default ConfigLoader;
